// Autenticación con Supabase Auth (Google OAuth real + correo/contraseña).
// Supabase guarda y protege las contraseñas; aquí nunca se almacenan ni se calculan hashes.
// Todas las funciones devuelven { data } o { error: "texto en español" } (siempre string).
(function () {
  const c = window.APP_CONFIG || {};
  const libOk = !!window.supabase;
  const ok = !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && libOk);
  const sb = ok ? supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  const here = () => location.origin + location.pathname;

  const BY_CODE = {
    invalid_credentials: 'Correo o contraseña incorrectos.',
    email_not_confirmed: 'Confirma tu correo antes de iniciar sesión.',
    user_already_exists: 'El correo ya está registrado.',
    email_exists: 'El correo ya está registrado.',
    weak_password: 'La contraseña es demasiado débil. Usa al menos 8 caracteres, con letras y números.',
    same_password: 'La nueva contraseña debe ser distinta de la actual.',
    over_email_send_rate_limit: 'Demasiados correos enviados. Espera unos minutos e inténtalo de nuevo.',
    over_request_rate_limit: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    signup_disabled: 'El registro está desactivado en este momento.',
    provider_disabled: 'El inicio de sesión con Google no está activado en Supabase.',
    validation_failed: 'Revisa el correo y la contraseña.',
    session_not_found: 'Tu sesión expiró. Inicia sesión de nuevo.'
  };
  // Convierte CUALQUIER error (objeto, string, excepción) en un string legible.
  function text(e, fallback) {
    if (!e) return fallback;
    if (typeof e === 'string') return e;
    if (BY_CODE[e.code]) return BY_CODE[e.code];
    const m = String(e.message || e.error_description || '');
    if (/invalid login credentials/i.test(m)) return BY_CODE.invalid_credentials;
    if (/already registered|already been registered/i.test(m)) return BY_CODE.user_already_exists;
    if (/not confirmed/i.test(m)) return BY_CODE.email_not_confirmed;
    if (/at least \d+ char|password should/i.test(m)) return BY_CODE.weak_password;
    if (/rate limit/i.test(m)) return BY_CODE.over_email_send_rate_limit;
    if (/failed to fetch|network/i.test(m)) return 'No se pudo conectar con el servicio de cuentas. Revisa tu conexión.';
    return fallback;
  }
  function notReady() {
    if (!libOk) return 'No se pudo cargar el servicio de cuentas. Revisa tu conexión a internet.';
    return 'Las cuentas no están configuradas: completa SUPABASE_URL y SUPABASE_ANON_KEY en js/config.js.';
  }
  async function wrap(fn, fallback) {
    if (!ok) return { error: notReady() };
    try {
      const r = await fn();
      return r.error ? { error: text(r.error, fallback) } : r;
    } catch (e) { return { error: text(e, fallback) }; }
  }

  window.Auth = {
    configured: ok,
    notReady,
    user: null,
    async init(onChange, onRecovery) {
      if (!ok) return onChange(null);
      sb.auth.onAuthStateChange((ev, s) => {   // sin llamadas a Supabase aquí dentro (evita bloqueos)
        this.user = s?.user || null;
        if (ev === 'PASSWORD_RECOVERY') onRecovery();
        onChange(this.user);
      });
      const { data } = await sb.auth.getSession();
      this.user = data.session?.user || null;
      onChange(this.user);
    },
    name: u => u?.user_metadata?.display_name || u?.user_metadata?.full_name || u?.email?.split('@')[0] || '',
    // Token vigente (supabase-js lo renueva solo). Si no hay sesión → null.
    async token() {
      if (!ok) return null;
      try { return (await sb.auth.getSession()).data.session?.access_token || null; } catch { return null; }
    },
    signUp: (name, email, password) => wrap(async () => {
      const r = await sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: here() } });
      // Con confirmación de correo activa, Supabase no da error si el correo ya existe: devuelve identities vacío.
      if (!r.error && r.data?.user && Array.isArray(r.data.user.identities) && r.data.user.identities.length === 0)
        return { error: { code: 'user_already_exists' } };
      return r;
    }, 'No se pudo crear la cuenta. Inténtalo de nuevo.'),
    signIn: (email, password) => wrap(() => sb.auth.signInWithPassword({ email, password }), 'No se pudo iniciar sesión. Inténtalo de nuevo.'),
    google: () => wrap(() => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } }), 'No se pudo iniciar sesión con Google.'),
    signOut: () => wrap(() => sb.auth.signOut(), 'No se pudo cerrar la sesión.'),
    reset: email => wrap(() => sb.auth.resetPasswordForEmail(email, { redirectTo: here() }), 'No se pudo enviar el correo de recuperación.'),
    setPassword: password => wrap(() => sb.auth.updateUser({ password }), 'No se pudo cambiar la contraseña.'),
    setName: name => wrap(() => sb.auth.updateUser({ data: { display_name: name } }), 'No se pudo guardar el nombre.')
  };
})();
