// Se ejecuta en Render al construir el sitio estático: genera frontend/js/config.js
// a partir de variables de entorno. Solo valores PÚBLICOS (nunca service_role ni secrets).
const fs = require('fs');
const path = require('path');
const env = n => (process.env[n] || '').trim();
const API_URL = env('API_URL').replace(/\/+$/, '');
if (!API_URL) { console.error('Falta la variable API_URL (URL del backend en Render).'); process.exit(1); }
if (!env('SUPABASE_URL') || !env('SUPABASE_ANON_KEY')) { console.error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY.'); process.exit(1); }
const cfg = {
  API_URL,
  SUPABASE_URL: env('SUPABASE_URL'),
  SUPABASE_ANON_KEY: env('SUPABASE_ANON_KEY'),
  REQUIRE_LOGIN: env('REQUIRE_LOGIN') !== 'false'
};
fs.writeFileSync(path.join(__dirname, '..', 'frontend', 'js', 'config.js'),
  '// Generado en el build de Render. No editar a mano.\nwindow.APP_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n');
console.log('config.js generado para', API_URL);
