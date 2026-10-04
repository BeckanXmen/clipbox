// Clipbox API: Frontend -> API -> yt-dlp -> archivo temporal -> Frontend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { execFile, execSync } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const run = promisify(execFile);
const YT = process.env.YT_DLP_PATH || 'yt-dlp';

// Forzar actualización automática de yt-dlp al iniciar el servidor para evitar bloqueos de YouTube
try {
  console.log('Actualizando yt-dlp a la última versión...');
  execSync(`${YT} -U`, { stdio: 'inherit' });
} catch (err) {
  console.warn('No se pudo actualizar yt-dlp automáticamente, usando versión instalada:', err.message);
}

const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';
const TMP = path.join(os.tmpdir(), 'clipbox');
fs.mkdirSync(TMP, { recursive: true });

// Configuración opcional de cookies de YouTube para saltar bloqueos en la nube
const cookiesPath = path.join(os.tmpdir(), 'yt_cookies.txt');
if (process.env.YT_COOKIES) {
  try {
    fs.writeFileSync(cookiesPath, process.env.YT_COOKIES.replace(/\\n/g, '\n'), 'utf8');
    console.log('Cookies de YouTube cargadas correctamente.');
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

// Actualizamos los argumentos para usar los clientes de YouTube más estables y recientes
const BASE = [
  '--no-playlist', 
  '--no-warnings', 
  '--socket-timeout', '15',
  '--age-limit', '99',
  '--extractor-args', 'youtube:player_client=ios,android,web',
  ...(fs.existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [])
];
