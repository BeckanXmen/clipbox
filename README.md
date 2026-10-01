# SaveClip (antes Clipbox)

El diseño es el de tu `descargador.html` original (temas, pestañas, botones MP4/HD/MP3, modal), separado en archivos. Lo único nuevo en pantalla: botón de Google, "¿Olvidaste tu contraseña?", modal de Perfil y estados animados.

**Probar sin Supabase:** pon `REQUIRE_LOGIN: false` en `frontend/js/config.js`. Con `true` (como tu original) hay que iniciar sesión para descargar, y eso exige configurar Supabase primero.

```
Frontend (HTML/JS) → API Express → yt-dlp (+ffmpeg) → archivo temporal → Frontend
        ↘ Supabase Auth (Google OAuth + correo/contraseña) ↙ (el backend verifica el token)
```

```
clipbox/
├─ frontend/  index.html · css/styles.css · js/config.js · js/auth.js · js/app.js
└─ backend/   server.js · package.json · .env.example
```

## Por qué Supabase
Da Google OAuth real, registro por correo, recuperación de contraseña y sesión persistente ya hechos. Guarda las contraseñas con hash (nunca las ves). No necesitas base de datos propia por ahora: el nombre del perfil va en los metadatos del usuario. Plan gratuito suficiente.

## 1. Requisitos en Windows (PowerShell)
```
winget install OpenJS.NodeJS.LTS
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```
Cierra y abre PowerShell. Comprueba: `node -v`, `yt-dlp --version`, `ffmpeg -version`.

## 2. Backend
```
cd clipbox\backend
npm install
copy .env.example .env
npm start
```
Prueba: http://localhost:3000/api/health

## 3. Frontend
No necesita build. Con VS Code: extensión "Live Server" → clic derecho en `frontend/index.html` → Open with Live Server (http://127.0.0.1:5500). Ese origen ya está en `ALLOWED_ORIGINS`.
Alternativa: `cd clipbox\frontend` y `npx serve -l 5500`.

## 4. API_URL
Edita `frontend/js/config.js` → `API_URL`. Local: `http://localhost:3000`. En producción: `https://api.tudominio.com`. Y en `backend/.env` pon en `ALLOWED_ORIGINS` la URL de tu frontend.

## 5. Supabase
1. Crea proyecto en supabase.com.
2. Project Settings → API: copia **Project URL** y **anon public key** a `frontend/js/config.js` y a `backend/.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). **Nunca uses la service_role key.**
3. Authentication → URL Configuration: Site URL = `http://127.0.0.1:5500/` y añade en Redirect URLs `http://127.0.0.1:5500/**` (y tu dominio real después).
4. Authentication → Providers → Email: activo. Mantén "Confirm email" activado.

## 6. Google OAuth
1. console.cloud.google.com → crea proyecto → APIs & Services → OAuth consent screen (External) → completa datos.
2. Credentials → Create credentials → OAuth client ID → Web application.
3. Authorized redirect URI: `https://TU-PROYECTO.supabase.co/auth/v1/callback` (la muestra Supabase en Providers → Google).
4. Copia Client ID y Client Secret **en Supabase** → Authentication → Providers → Google (el secret vive solo ahí).

## 7. Al subir a hosting
- Frontend: Netlify, Vercel o Cloudflare Pages (carpeta `frontend`).
- Backend: necesita un servidor con Node + yt-dlp + ffmpeg (VPS, Railway o Render con Docker). **No funciona en hosting estático ni serverless puro.**
- Cambiar: `API_URL`, `ALLOWED_ORIGINS`, Redirect URLs de Supabase y Site URL, HTTPS obligatorio.
- Mantén yt-dlp actualizado (`yt-dlp -U`): las plataformas cambian a menudo.
- Opcional: `REQUIRE_AUTH=true` para exigir cuenta al descargar.

## Límites conocidos (honestos)
- **Instagram**: suele exigir inicio de sesión incluso para contenido público; yt-dlp puede fallar. Este proyecto no usa cookies ni evasión, así que algunos enlaces darán error. Para uso confiable habría que usar la API oficial de Instagram con el contenido del propio usuario.
- **YouTube** aplica bloqueos a IPs de servidores/datacenter; puede fallar en hosting aunque funcione en tu PC.
- "HD" = hasta 1080p; "MP4" = hasta 720p; MP3 y HD requieren ffmpeg.
- Archivos temporales se borran al descargar o a los 10 min; límite 500 MB.
- Descargar contenido ajeno puede violar términos de las plataformas o derechos de autor: es responsabilidad de quien use la app.
