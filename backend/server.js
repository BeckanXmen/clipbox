// Clipbox API: Frontend -> API -> yt-dlp -> archivo temporal -> Frontend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const run = promisify(execFile);
const YT = process.env.YT_DLP_PATH || 'yt-dlp';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';
const TMP = path.join(os.tmpdir(), 'clipbox');
fs.mkdirSync(TMP, { recursive: true });

// Configuración robusta de cookies de YouTube para Render
const cookiesPath = path.join(os.tmpdir(), 'yt_cookies.txt');
if (process.env.YT_COOKIES) {
  try {
    let rawCookies = process.env.YT_COOKIES.trim();
    if (rawCookies.includes('\\n')) {
      rawCookies = rawCookies.replace(/\\n/g, '\n');
    }
    fs.writeFileSync(cookiesPath, rawCookies, 'utf8');
    console.log('Cookies de YouTube cargadas y formateadas correctamente.');
  } catch (err) {
    console.error('Error al guardar las cookies:', err);
  }
}

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY) : null;
if (REQUIRE_AUTH && !supabase) console.warn('REQUIRE_AUTH=true pero falta configurar Supabase: nadie podrá descargar.');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
if (!origins.length) console.warn('ALLOWED_ORIGINS vacío: el navegador no podrá llamar a la API.');
app.use(cors({ origin: origins.length ? origins : false, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '10kb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true }));

function detect(u) {
  try {
    const url = new URL(u);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const h = url.hostname.toLowerCase();
    if (/(^|\.)youtube\.com$/.test(h) || h === 'youtu.be') return 'youtube';
    if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
    if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
  } catch {}
  return null;
}

function friendlyError(stderr = '') {
  const s = stderr.toLowerCase();
  if (/private|login required|log in|sign in|members-only|cookies/.test(s))
    return 'Este contenido es privado o requiere iniciar sesión en la plataforma. Solo se pueden procesar enlaces públicos.';
  if (/unavailable|not available|removed|deleted|404/.test(s)) return 'El contenido no está disponible o fue eliminado.';
  if (/age|confirm your age/.test(s)) return 'El contenido tiene restricción de edad y no se puede procesar.';
  if (/copyright|blocked|geo/.test(s)) return 'El contenido está restringido en esta región o por derechos de autor.';
  if (/unsupported url/.test(s)) return 'El enlace no apunta a un video válido.';
  if (/ffmpeg|ffprobe/.test(s)) return 'El servidor necesita ffmpeg instalado para este formato.';
  if (/timed out|timeout/.test(s)) return 'La plataforma tardó demasiado en responder. Inténtalo de nuevo.';
  return 'No se pudo procesar el enlace. Comprueba que el contenido sea público.';
}

async function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7).trim() 
    : (req.query.token || null);

  if (REQUIRE_AUTH && !supabase)
    return res.status(500).json({ error: 'El servidor no tiene configurado Supabase.' });
  
  if (token && supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (data?.user) req.user = data.user;
      else if (error && (!error.status || error.status >= 500))
        return res.status(503).json({ error: 'No se pudo verificar tu sesión.' });
    } catch {
      return res.status(503).json({ error: 'No se pudo verificar tu sesión.' });
    }
  }
  if (REQUIRE_AUTH && !req.user) return res.status(401).json({ error: 'Inicia sesión para descargar.' });
  next();
}

function validate(req, res, next) {
  const url = String(req.body?.url || '').trim();
  if (url.length > 500) return res.status(400).json({ error: 'El enlace es demasiado largo.' });
  const platform = detect(url);
  if (!platform) return res.status(400).json({ error: 'Enlace no válido. Usa un enlace público de YouTube, Instagram o TikTok.' });
  req.media = { url, platform };
  next();
}

const BASE = [
  '--no-playlist', 
  '--no-warnings', 
  '--socket-timeout', '20',
  '--age-limit', '99',
  '--extractor-args', 'youtube:player_client=web_safari',
  ...(fs.existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [])
];

app.get('/api/health', (_, res) => res.json({ ok: true, authRequired: REQUIRE_AUTH }));

app.post('/api/analyze', auth, validate, async (req, res) => {
  try {
    const { stdout } = await run(YT, [...BASE, '-J', '--', req.media.url], { timeout: 45_000, maxBuffer: 20e6 });
    const i = JSON.parse(stdout);
    res.json({ platform: req.media.platform, title: i.title || 'Sin título', thumbnail: i.thumbnail || null,
      duration: i.duration || null, uploader: i.uploader || null });
  } catch (e) {
    const rawError = e.stderr || e.message || 'Error desconocido';
    console.error('--- ERROR EN ANALYZE ---', rawError);
    res.status(422).json({ error: rawError });
  }
});

const FORMATS = {
  mp3: ['-x', '--audio-format', 'mp3', '--audio-quality', '0'],
  mp4: ['-f', 'best[height<=720]/best', '--merge-output-format', 'mp4'],
  hd:  ['-f', 'best[height<=1080]/best', '--merge-output-format', 'mp4'],
};
const files = new Map();
let active = 0;

app.post('/api/download', auth, validate, async (req, res) => {
  const fmt = FORMATS[req.body?.format];
  if (!fmt) return res.status(400).json({ error: 'Formato no válido. Elige mp3, mp4 o hd.' });
  if (active >= 3) return res.status(429).json({ error: 'El servidor está ocupado. Inténtalo en unos segundos.' });
  active++;
  const id = crypto.randomUUID();
  const dir = path.join(TMP, id);
  try {
    fs.mkdirSync(dir);
    const { stdout } = await run(YT, [...BASE, ...fmt, '--max-filesize', '500M',
      '-o', path.join(dir, '%(title).80B.%(ext)s'), '--print', 'after_move:filepath', '--', req.media.url],
      { timeout: 180_000, maxBuffer: 10e6 });
    const file = stdout.trim().split('\n').pop();
    if (!file || !fs.existsSync(file)) throw new Error('sin archivo');
    files.set(id, { file, dir, name: path.basename(file), user: req.user?.id || null, expires: Date.now() + 10 * 60_000 });
    res.json({ id, filename: path.basename(file) });
  } catch (e) {
    const rawError = e.stderr || e.message || 'Error desconocido';
    console.error('--- ERROR EN DOWNLOAD ---', rawError);
    res.status(422).json({ error: rawError });
  } finally { active--; }
});

app.get('/api/file/:id', auth, (req, res) => {
  const f = files.get(req.params.id);
  if (!f) return res.status(404).json({ error: 'El archivo expiró. Vuelve a procesar el enlace.' });
  if (f.user && f.user !== req.user?.id) return res.status(403).json({ error: 'No autorizado.' });
  res.download(f.file, f.name, () => { files.delete(req.params.id); fs.rmSync(f.dir, { recursive: true, force: true }); });
});

setInterval(() => {
  for (const [id, f] of files) if (f.expires < Date.now()) { files.delete(id); fs.rmSync(f.dir, { recursive: true, force: true }); }
}, 60_000).unref();

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Clipbox API en http://localhost:${PORT}`));
