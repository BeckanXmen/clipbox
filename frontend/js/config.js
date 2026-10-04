// Única configuración del frontend. Aquí SOLO va información pública.
// NUNCA pongas aquí la service_role key de Supabase ni el client secret de Google.
window.APP_CONFIG = {
  API_URL: "https://clipbox-api-t793.onrender.com",  // <- URL de tu servidor backend (cámbiala al publicar)
  SUPABASE_URL: "",                  // https://xxxx.supabase.co
  SUPABASE_ANON_KEY: "",             // clave "anon public" (pública por diseño)
  REQUIRE_LOGIN: true                // true = como tu diseño original (pedir sesión para descargar). Pon false para probar descargas antes de configurar Supabase.
};
