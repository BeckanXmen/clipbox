// Mismo comportamiento visual que la versión original; ahora conectado al backend y a Supabase.
const API_URL = window.APP_CONFIG.API_URL.replace(/\/$/, "");
const NAMES = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
const $ = s => document.querySelector(s);
let platform = "youtube", fmt = "mp4", mode = "login", user = null;

// ---- Temas (sin cambios) ----
function setPlatform(p) {
  platform = p;
  document.body.dataset.p = p;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.p === p));
  $("#title").textContent = "Descarga de " + NAMES[p];
  $("#url").placeholder = p === "youtube" ? "https://youtube.com/watch?v=..." : p === "instagram" ? "https://instagram.com/reel/..." : "https://tiktok.com/@usuario/video/...";
}
document.querySelectorAll(".tab").forEach(t => t.onclick = () => setPlatform(t.dataset.p));
document.querySelectorAll(".fmt").forEach(f => f.onclick = () => {
  fmt = f.dataset.f; document.querySelectorAll(".fmt").forEach(x => x.classList.toggle("on", x === f));
});
function detect(u) {   // ahora por dominio exacto, no por texto suelto
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null;
    const h = url.hostname.toLowerCase();
    if (/(^|\.)youtube\.com$/.test(h) || h === "youtu.be") return "youtube";
    if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
    if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
  } catch (e) {}
  return null;
}
$("#url").addEventListener("input", e => { const d = detect(e.target.value.trim()); if (d && d !== platform) setPlatform(d); });

// ---- Cuenta (Supabase) ----
function renderAuth(u) {
  user = u;
  const box = $("#auth"); box.innerHTML = "";
  if (u) {
    const w = document.createElement("div"); w.className = "user";
    w.append("Hola, " + Auth.name(u) + " ");
    const p = document.createElement("button"); p.className = "ghost"; p.textContent = "Perfil";
    p.onclick = () => { $("#pe").textContent = u.email; $("#pn").value = Auth.name(u); $("#pm").textContent = ""; $("#pmodal").classList.add("show"); };
    const o = document.createElement("button"); o.className = "ghost"; o.textContent = "Salir"; o.onclick = () => Auth.signOut();
    w.append(p, o); box.append(w);
    $("#modal").classList.remove("show");
  } else {
    const b = document.createElement("button"); b.className = "ghost"; b.textContent = "Iniciar sesión";
    b.onclick = () => openModal("login"); box.append(b);
  }
}
function openModal(m) {
  mode = m; $("#me").style.color = "#ffb0b0"; $("#me").textContent = "";
  $("#mt").textContent = m === "login" ? "Iniciar sesión" : "Crear cuenta";
  $("#mgo").textContent = m === "login" ? "Entrar" : "Registrarme";
  $("#nm").style.display = m === "login" ? "none" : "block";
  $("#fg").parentElement.style.display = m === "login" ? "block" : "none";
  $("#pw").autocomplete = m === "login" ? "current-password" : "new-password";
  $("#sw").textContent = m === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión";
  $("#modal").classList.add("show");
}
const meMsg = (t, ok) => { $("#me").style.color = ok ? "#7dffb5" : "#ffb0b0"; $("#me").textContent = typeof t === "string" ? t : ""; };
$("#sw").onclick = () => openModal(mode === "login" ? "register" : "login");
$("#cl").onclick = () => $("#modal").classList.remove("show");
$("#mgo").onclick = async () => {
  const em = $("#em").value.trim().toLowerCase(), pw = $("#pw").value, nm = $("#nm").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(em)) return meMsg("Correo no válido.");
  if (pw.length < 8) return meMsg("La contraseña debe tener al menos 8 caracteres.");
  if (mode === "register" && !nm) return meMsg("Escribe tu nombre o usuario.");
  meMsg("Un momento…", true);
  const r = mode === "register" ? await Auth.signUp(nm, em, pw) : await Auth.signIn(em, pw);
  if (r.error) return meMsg(r.error);
  if (mode === "register" && !r.data?.session) meMsg("Cuenta creada. Revisa tu correo para confirmarla.", true);
  else meMsg("");
};
$("#gg").onclick = async () => { const r = await Auth.google(); if (r.error) meMsg(r.error); };
$("#fg").onclick = async () => {
  const em = $("#em").value.trim();
  if (!em) return meMsg("Escribe tu correo arriba y vuelve a pulsar.");
  const r = await Auth.reset(em);
  meMsg(r.error || "Si el correo existe, recibirás un enlace para restablecer la contraseña.", !r.error);
};
$("#pc").onclick = () => $("#pmodal").classList.remove("show");
$("#po").onclick = async () => { await Auth.signOut(); $("#pmodal").classList.remove("show"); };
$("#ps").onclick = async () => { const r = await Auth.setName($("#pn").value.trim()); $("#pm").style.color = r.error ? "#ffb0b0" : "#7dffb5"; $("#pm").textContent = r.error || "Nombre actualizado."; };
$("#rs").onclick = async () => {
  const p = $("#rp").value;
  if (p.length < 8) return ($("#rm").textContent = "Mínimo 8 caracteres.");
  const r = await Auth.setPassword(p);
  if (r.error) return ($("#rm").textContent = r.error);
  $("#rmodal").classList.remove("show");
};

// ---- Descarga: Frontend -> /api/analyze -> /api/download -> /api/file/:id ----
function show(t, c) { const m = $("#msg"); m.className = c; m.textContent = t; }
async function authHeaders() { const t = await Auth.token(); return t ? { Authorization: "Bearer " + t } : {}; }
async function call(path, body) {
  let r;
  try { r = await fetch(API_URL + path, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) }); }
  catch (e) { throw new Error("No se pudo conectar con el servidor. ¿Está encendido el backend?"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(d.error || "Error inesperado del servidor."); err.status = r.status; throw err; }
  return d;
}

$("#dl").onclick = async () => {
  const u = $("#url").value.trim();
  if (window.APP_CONFIG.REQUIRE_LOGIN && !Auth.configured) return show(Auth.notReady(), "err");
  
  // Verificación robusta mediante token real para evitar bucles o falsos bloqueos de sesión
  const currentToken = await Auth.token();
  if (window.APP_CONFIG.REQUIRE_LOGIN && !user && !currentToken) { 
    show("Inicia sesión para descargar.", "err"); 
    return openModal("login"); 
  }

  if (!/^https?:\/\//i.test(u)) return show("Pega un enlace válido.", "err");
  const d = detect(u);
  if (!d) return show("Solo se admiten enlaces de YouTube, Instagram y TikTok.", "err");
  setPlatform(d);
  $("#dl").disabled = true;
  
  try {
    show("Analizando", "busy");
    const info = await call("/api/analyze", { url: u });
    
    show("Procesando (esto puede tardar unos segundos)...", "busy");
    const job = await call("/api/download", { url: u, format: fmt });
    
    show("¡Listo! Descargando...", "ok");

    const token = await Auth.token();
    const downloadUrl = `${API_URL}/api/file/${job.id}${token ? '?token=' + encodeURIComponent(token) : ''}`;
    
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = job.filename || "video";
    document.body.appendChild(a);
    a.click();
    a.remove();

    show("Completado: " + (info.title || "Descarga iniciada"), "ok");
  } catch (e) {
    show(e.message, "err"); 
    if (e.status === 401) openModal("login");
  } finally {
    $("#dl").disabled = false;
  }
};

// Inicialización de la sesión al cargar la página
Auth.init((u) => {
  renderAuth(u);
}, () => {
  $("#rmodal").classList.add("show");
});
