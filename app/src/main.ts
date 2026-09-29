import './styles.css';
import { isCloudConfigured, pbUrl, isLoggedIn } from './lib/pb';
import { db } from './lib/localdb';
import {
  signIn, signUp, signOut, getUser, refreshSession, verifyAccountPassword, myOrgs, createOrg, addMemberById,
  pullProducts, saveProductLocal, deleteProductLocal, newLocalProduct,
  createSaleOffline, syncOutbox, salesHistoryCloud, listMembers,
  hashPin, setLocalSession, getLocalSession,
  TICKET_STATUSES, pullTickets, createTicket, updateTicketStatus, getCashDay, openCashDay, closeCashDay
} from './lib/store';

const app = document.getElementById('app')!;
const fmt = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR');
const getOrg = () => localStorage.getItem('zt_org') ?? '';
const setOrg = (id: string) => localStorage.setItem('zt_org', id);
const esc = (s: string) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const withTimeout = <T,>(promise: Promise<T>, ms = 12000): Promise<T> => Promise.race([
  promise,
  new Promise<T>((_, reject) => setTimeout(() => reject(new Error('La nube tardó demasiado. Sigo con los datos locales.')), ms))
]);

function toast(msg: string) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

const getAccountType = () => (localStorage.getItem('zt_account_type') === 'empleado' ? 'empleado' : 'negocio');
const setAccountType = (type: string) => localStorage.setItem('zt_account_type', type === 'empleado' ? 'empleado' : 'negocio');
const myIdBlock = (user: any) => (user?.id ? `<div class="my-id"><small>Tu ID para que te inviten</small><code id="myId">${esc(user.id)}</code><button class="btn ghost small" id="bCopyId">Copiar</button></div>` : '');
function bindMyIdCopy() {
  (document.getElementById('bCopyId') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    const id = (document.getElementById('myId') as HTMLElement | null)?.textContent ?? '';
    try { await navigator.clipboard.writeText(id); toast('ID copiado'); }
    catch { toast(id); }
  });
}

// ---- Instalar app (PWA) ----
let deferredPrompt: any = null;
addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  deferredPrompt = e;
});
const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

function refreshInstallUI() {
  const installed = isInstalled();
  document.querySelectorAll<HTMLElement>('[data-install]').forEach((el) => {
    el.hidden = installed;
    el.style.display = installed ? 'none' : '';
  });
}

matchMedia('(display-mode: standalone)').addEventListener?.('change', refreshInstallUI);

async function installApp() {
  if (isInstalled()) { refreshInstallUI(); toast('La app ya está instalada ✓'); return; }
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    if (r?.outcome === 'accepted') { refreshInstallUI(); toast('Instalando… buscala en tu inicio'); }
    return;
  }
  const ov = document.createElement('div');
  ov.className = 'ovl';
  ov.innerHTML = `<div class="card modal-card">
    <h2>Descargar la app</h2>
    <p class="mut">Es esta misma página, instalada como app. Anda sin internet.</p>
    <p><b>Android / Chrome:</b> menú ⋮ → <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</p>
    <p><b>iPhone:</b> Compartir <b>⎙</b> → <b>Agregar a inicio</b>.</p>
    <p><b>PC:</b> ícono <b>⊕ Instalar</b> en la barra de dirección.</p>
    <div class="row"><button class="btn" id="mClose">Entendido</button></div>
  </div>`;
  ov.onclick = (e) => { if ((e.target as HTMLElement).id === 'mClose' || e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
const SCANNER_KEY = 'zt_scanner_settings';
type ScannerSettings = { enabled: boolean; suffix: 'Enter' | 'Tab'; minLength: number };
const defaultScanner = (): ScannerSettings => ({ enabled: true, suffix: 'Enter', minLength: 6 });
const getScannerSettings = (): ScannerSettings => {
  try { return { ...defaultScanner(), ...JSON.parse(localStorage.getItem(SCANNER_KEY) || '{}') }; }
  catch { return defaultScanner(); }
};
const setScannerSettings = (value: ScannerSettings) => localStorage.setItem(SCANNER_KEY, JSON.stringify(value));
let barcodeHandler: ((code: string) => void) | null = null;

function initScanner() {
  let buffer = '';
  let timer = 0;
  const emit = () => {
    const code = buffer.trim();
    buffer = '';
    if (code) document.dispatchEvent(new CustomEvent('zt:barcode', { detail: code }));
  };
  document.addEventListener('keydown', (event) => {
    const settings = getScannerSettings();
    if (!settings.enabled) return;
    const target = event.target as HTMLElement;
    const inField = target?.matches?.('input, textarea, select') || target?.isContentEditable;
    if (inField && !target.hasAttribute('data-scanner-input')) return;
    if (target?.id === 'q2') return;
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (buffer.length >= settings.minLength) { event.preventDefault(); emit(); }
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    clearTimeout(timer);
    buffer += event.key;
    if (settings.suffix === 'Enter') timer = window.setTimeout(() => { if (buffer.length >= settings.minLength) emit(); }, 120);
  });
  document.addEventListener('zt:barcode', (event) => barcodeHandler?.((event as CustomEvent<string>).detail));
}

function scanBarcode(): Promise<string | null> {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ovl';
    ov.innerHTML = `<div class="card modal-card scanner-card"><h2>Escanear producto</h2><p class="mut">Apuntá la cámara al código de barras o escribilo a mano.</p><video id="scanVideo" autoplay playsinline muted></video><div class="field"><label>Código</label><input id="scanCode" inputmode="numeric" placeholder="Ej: 7791234567890" /></div><div class="row" style="margin-top:.6rem"><button class="btn" id="scanOk">Usar código</button><button class="btn ghost" id="scanCancel">Cancelar</button></div></div>`;
    document.body.appendChild(ov);
    const video = document.getElementById('scanVideo') as HTMLVideoElement;
    const input = document.getElementById('scanCode') as HTMLInputElement;
    let stream: MediaStream | null = null;
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      stream?.getTracks().forEach((track) => track.stop());
      ov.remove();
      resolve(value?.trim() || null);
    };
    (document.getElementById('scanCancel') as HTMLButtonElement).onclick = () => finish(null);
    (document.getElementById('scanOk') as HTMLButtonElement).onclick = () => finish(input.value);
    const Detector = (window as any).BarcodeDetector;
    if (Detector && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }).then(async (s) => {
        stream = s; video.srcObject = s;
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code'] });
        const scan = async () => {
          if (done) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) { input.value = codes[0].rawValue; finish(codes[0].rawValue); return; }
          } catch { /* seguimos con entrada manual */ }
          requestAnimationFrame(scan);
        };
        scan();
      }).catch(() => { /* cámara no disponible: manual */ });
    }
  });
}

document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-install]')) installApp();
});

function statusPills(syncMsg = '') {
  const net = navigator.onLine
    ? '<span class="pill ok"><span class="dot" style="background:#17c964"></span>online</span>'
    : '<span class="pill warn"><span class="dot" style="background:#f5a524"></span>offline — vende igual</span>';
  const cloud = isCloudConfigured()
    ? '<span class="pill ok">nube configurada</span>'
    : '<span class="pill warn">modo local · falta VITE_PB_URL</span>';
  return `${net}${cloud}${syncMsg ? `<span class="pill">${esc(syncMsg)}</span>` : ''}`;
}

function shell(inner: string, tab = '', opts: { orgs?: { id: string; name: string; role?: string }[]; org?: string; email?: string; syncMsg?: string } = {}) {
  const isOwner = opts.orgs?.some((o) => o.id === opts.org && o.role === 'dueno') ?? false;
  const nav = (cls: string) => `
    <div class="side">
      <div class="brand"><i>Z</i> ZT Gestión</div>
      <nav class="nav">
        <a href="#/panel" class="${tab === 'panel' ? 'on' : ''}">◧ Panel</a>
        <a href="#/ventas" class="${tab === 'ventas' ? 'on' : ''}">◉ Vender</a>
        <a href="#/productos" class="${tab === 'productos' ? 'on' : ''}">▤ Stock</a>
        <a href="#/caja" class="${tab === 'caja' ? 'on' : ''}">💵 Caja</a>
        <a href="#/tickets" class="${tab === 'tickets' ? 'on' : ''}">🧾 Tickets</a>
        <a href="#/equipo" class="${tab === 'equipo' ? 'on' : ''}">⛁ Equipo</a>
        ${isOwner ? `<a href="#/admin" class="${tab === 'admin' ? 'on' : ''}">⚙ Admin</a>` : ''}
        <button class="navdl" data-install>⬇ Descargar app</button>
      </nav>
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:.5rem">
        <span class="mut">${esc(opts.email ?? '')}</span>
        <button class="btn ghost small" id="btnOut">Salir</button>
      </div>
    </div>`;
  const orgSel = opts.orgs?.length
    ? `<select class="orgsel" id="orgSel">${opts.orgs.map((o) => `<option value="${o.id}" ${o.id === opts.org ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`
    : '';
  return `<div class="app">${nav(tab)}
    <div class="main">
      <div id="netbar" class="netbar" style="display:none">📴 <b>Sin internet.</b>&nbsp;Seguís vendiendo; las ventas quedan en este equipo y se suben al iniciar sesión.&nbsp;<button class="btn small" id="netRetry">Probar conexión</button></div>
      <div class="topbar">
        <div class="row"><h1>${tab === 'panel' ? 'Panel' : tab === 'ventas' ? 'Vender' : tab === 'productos' ? 'Stock' : tab === 'equipo' ? 'Negocio y equipo' : ''}</h1>${orgSel}</div>
        <div class="row">${statusPills(opts.syncMsg)}</div>
      </div>
      ${inner}
      <nav class="mobnav">
        <a href="#/panel" class="${tab === 'panel' ? 'on' : ''}">Panel</a>
        <a href="#/ventas" class="${tab === 'ventas' ? 'on' : ''}">Vender</a>
        <a href="#/productos" class="${tab === 'productos' ? 'on' : ''}">Stock</a>
        <a href="#/caja" class="${tab === 'caja' ? 'on' : ''}">Caja</a>
        <a href="#/tickets" class="${tab === 'tickets' ? 'on' : ''}">Tickets</a>
        <a href="#/equipo" class="${tab === 'equipo' ? 'on' : ''}">Equipo</a>
        ${isOwner ? `<a href="#/admin" class="${tab === 'admin' ? 'on' : ''}">Admin</a>` : ''}
      </nav>
    </div></div>`;
}

function bindCommon(orgs: { id: string; name: string }[], org: string) {
  const b = document.getElementById('btnOut');
  if (b) b.onclick = async () => {
    await signOut().catch(() => {});
    setLocalSession(null); // se cierra la caja, pero el PIN queda para reabrir offline
    localStorage.removeItem('zt_org'); location.hash = '#/login'; router();
  };
  const s = document.getElementById('orgSel') as HTMLSelectElement | null;
  if (s) s.onchange = () => {
    setOrg(s.value);
    const ls = getLocalSession();
    if (ls) setLocalSession({ ...ls, org: s.value });
    router();
  };
  void orgs; void org;
}

// El PIN se configura desde el panel; no se pide en cada inicio.
function promptPin(uid: string, email: string, org: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ovl';
    ov.innerHTML = `<div class="card modal-card">
      <h2>Abrí tu caja sin internet</h2>
      <p class="mut">Creá un PIN de 6 dígitos para este equipo. Si se corta la luz o el wifi, vendés igual.</p>
      <div class="field"><label>PIN (6 números)</label><input id="newPin" inputmode="numeric" maxlength="12" placeholder="••••" /></div>
      <div class="row" style="margin-top:.6rem"><button class="btn" id="pinSave">Guardar PIN</button><button class="btn ghost" id="pinLater">Después</button></div>
    </div>`;
    document.body.appendChild(ov);
    const done = (v: boolean) => { ov.remove(); resolve(v); };
    (document.getElementById('pinLater') as HTMLButtonElement).onclick = () => done(false);
    (document.getElementById('pinSave') as HTMLButtonElement).onclick = async () => {
      const code = ((document.getElementById('newPin') as HTMLInputElement).value || '').replace(/\D/g, '');
      if (code.length < 6) { toast('El PIN necesita 6 números como mínimo'); return; }
      await db.pins.put({ userId: uid, email, org_id: org, pinHash: await hashPin(email, code), updatedAt: Date.now() });
      setLocalSession({ uid, email, org });
      toast('PIN listo: ya podés vender sin internet');
      done(true);
    };
  });
}

async function requireUser() {
  // Modo local explícito: permite seguir vendiendo aunque la nube esté caída.
  if (sessionStorage.getItem('zt_force_local')) {
    const local = getLocalSession();
    if (local) return { id: local.uid, email: local.email };
  }
  // Offline: vale la sesión local con PIN (la caja no se frena nunca)
  if (!navigator.onLine) {
    const s = getLocalSession();
    if (s) return { id: s.uid, email: s.email };
    if (!isCloudConfigured()) return { id: 'local', email: 'modo local' } as any;
    location.hash = '#/login'; throw new Error('login');
  }
  if (!isCloudConfigured()) return { id: 'local', email: 'modo local' } as any;
  const u = await getUser();
  if (!u) { location.hash = '#/login'; throw new Error('login'); }
  return u;
}

async function loadOrgs(): Promise<{ list: { id: string; name: string; role?: string }[]; cur: string; cloudError: string }> {
  // Sin internet (o modo local forzado): trabajo local directo, sin pedir nada a la nube.
  // Se usa el negocio de la sesión con PIN (no demo-local) para ver su stock real.
  if (!navigator.onLine || !isCloudConfigured() || sessionStorage.getItem('zt_force_local')) {
    const s = getLocalSession();
    const demo = s?.org || getOrg() || 'demo-local';
    setOrg(demo);
    return { list: [{ id: demo, name: s ? 'Mi negocio' : 'Mi negocio (local)', role: '' }], cur: demo, cloudError: '' };
  }
  try {
    const ms = await myOrgs();
    const list = ms.map((m) => ({ id: m.org_id, name: (m.orgs as any)?.name ?? m.org_id, role: m.role }));
    if (!list.length) return { list, cur: '', cloudError: '' };
    let cur = getOrg();
    if (!cur || !list.find((o) => o.id === cur)) { cur = list[0].id; setOrg(cur); }
    return { list, cur, cloudError: '' };
  } catch (e: any) {
    console.error('[ZT loadOrgs]', e);
    const st = e?.status ?? e?.response?.status;
    const msg = e?.response?.data?.message ?? e?.message ?? 'Error de nube';
    const networkFailure = !st || /failed to fetch|network|timeout|load failed/i.test(String(msg));
    if (networkFailure) {
      // El equipo tiene internet pero PocketBase no responde: seguimos local
      // para no dejar al vendedor sin caja.
      const s = getLocalSession();
      const demo = s?.org || getOrg() || 'demo-local';
      setOrg(demo);
      return { list: [{ id: demo, name: s ? 'Mi negocio' : 'Mi negocio (local)', role: '' }], cur: demo, cloudError: '' };
    }
    return { list: [], cur: '', cloudError: (st ? '(http ' + st + ') ' : '') + msg + '. ¿Están las 8 tablas en /_/ → Collections?' };
  }
}

// ---------- Login ----------
function pbErr(e: any): string {
  const d = e?.response?.data ?? e?.data;
  if (d?.data && typeof d.data === 'object') {
    const parts = Object.entries(d.data).map(([f, v]: any) => `${f}: ${v?.message ?? 'inválido'}`);
    if (parts.length) return parts.join(' · ');
  }
  return d?.message || e?.message || String(e);
}

async function vLogin(mode: 'in' | 'up' = 'in') {
  if (isCloudConfigured()) {
    try { const u = await getUser(); if (u && navigator.onLine) { location.hash = '#/panel'; return; } } catch {}
  }
  // ---- Sin internet: entrar con PIN (la caja sigue) ----
  if (!navigator.onLine && isCloudConfigured()) {
    const pins = await db.pins.toArray();
    app.innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <div class="auth-logo"><i>Z</i><div><b>ZT Gestión</b><small>Modo offline</small></div></div>
      <p class="auth-sub">Sin internet igual se vende. Todo se sube solo al volver la red.</p>
      ${pins.length ? `
        <div style="display:flex;flex-direction:column;gap:.7rem">
          <div class="field"><label>Vendedor</label><select id="pinUser">${pins.map((p) => `<option value="${p.userId}">${esc(p.email)}</option>`).join('')}</select></div>
          <div class="field"><label>PIN de 6 dígitos</label><input id="pinCode" type="password" inputmode="numeric" maxlength="12" placeholder="••••" /></div>
          <div id="loginErr" class="auth-err"></div>
          <button class="btn auth-go" id="bPin">Abrir caja →</button>
        </div>` : `
        <div class="auth-err" style="display:block">Todavía nadie entró en este equipo con internet. La primera vez necesitás conexión; después abrís con PIN sin red.</div>`}
      <p class="auth-foot">Las ventas quedan guardadas en este equipo</p>
    </div></div>`;
    const go = document.getElementById('bPin') as HTMLButtonElement | null;
    if (go) go.onclick = async () => {
      const uid = (document.getElementById('pinUser') as HTMLSelectElement).value;
      const code = (document.getElementById('pinCode') as HTMLInputElement).value;
      const rec = await db.pins.get(uid);
      const box = document.getElementById('loginErr') as HTMLElement;
      if (!rec || (await hashPin(rec.email, code)) !== rec.pinHash) {
        box.style.display = 'block'; box.textContent = 'PIN incorrecto, probá de nuevo.';
        return;
      }
      setLocalSession({ uid: rec.userId, email: rec.email, org: rec.org_id });
      setOrg(rec.org_id);
      toast('Caja abierta offline');
      location.hash = '#/panel'; router();
    };
    return;
  }
  const canContinueLocal = !!getLocalSession();
  app.innerHTML = `<div class="auth-wrap"><div class="auth-card">
    <div class="auth-logo"><i>Z</i><div><b>ZT Gestión</b><small>San Vicente · Misiones</small></div></div>
    <p class="auth-sub">${mode === 'in' ? 'Entrá a tu negocio. Tus ventas te esperan.' : 'Creá tu cuenta gratis y empezá a vender hoy.'}</p>
    ${isCloudConfigured() ? `
      <div class="seg">
        <a href="#/login" class="${mode === 'in' ? 'on' : ''}">Entrar</a>
        <a href="#/registro" class="${mode === 'up' ? 'on' : ''}">Crear cuenta</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:.7rem">
        ${mode === 'up' ? `<div class="field"><label>Tipo de cuenta</label><select id="accountType"><option value="negocio" ${getAccountType() === 'negocio' ? 'selected' : ''}>Negocio — quiero vender y gestionar mi stock</option><option value="empleado" ${getAccountType() === 'empleado' ? 'selected' : ''}>Empleado — espero que me agreguen a un negocio</option></select></div>` : ''}
        <div class="field"><label>Email</label><input id="em" placeholder="vos@tunegocio.com" autocomplete="username" /></div>
        ${mode === 'up' ? '<div class="field"><label>WhatsApp</label><input id="ph" placeholder="3755 12-3456" autocomplete="tel" inputmode="tel" /></div>' : ''}
        <div class="field"><label>Contraseña</label>
          <div class="row" style="flex-wrap:nowrap"><input id="pw" type="password" placeholder="8 caracteres como mínimo" autocomplete="current-password" style="flex:1" /><button class="btn ghost small" id="bEye" title="Ver contraseña">👁</button></div>
        </div>
        ${mode === 'up' ? '<div class="field"><label>Repetir contraseña</label><input id="pw2" type="password" placeholder="Escribila igual" autocomplete="new-password" /></div>' : ''}
        <div id="loginErr" class="auth-err"></div>
        ${mode === 'in'
          ? '<button class="btn auth-go" id="bGo">Entrar a mi negocio →</button>'
          : '<button class="btn auth-go" id="bGo">Crear mi cuenta gratis</button>'}
      </div>
      <p class="auth-foot">Funciona sin internet · Tus datos son solo de tu negocio</p>
      ${canContinueLocal && mode === 'in' ? '<div class="row" style="margin-top:.7rem"><button class="btn ghost" id="bOfflineContinue">Continuar sin conexión</button></div>' : ''}` : `
      <p>Sin nube: creá <b>app/.env</b> con <b>VITE_PB_URL=https://app.zonatecno.uno</b> y recargá. Mientras tanto:</p>
      <div class="row"><a class="btn" href="#/panel">Usar en modo local offline</a></div>`}
  </div></div>`;
  if (!isCloudConfigured()) return;
  (document.getElementById('bOfflineContinue') as HTMLButtonElement | null)?.addEventListener('click', () => {
    sessionStorage.setItem('zt_force_local', '1');
    location.hash = '#/panel';
    router();
  });
  const showErr = (m: string) => {
    const box = document.getElementById('loginErr') as HTMLElement;
    box.style.display = 'block'; box.textContent = m;
  };
  const busy = (b: boolean, label: string) => {
    const go = document.getElementById('bGo') as HTMLButtonElement;
    go.disabled = b; go.textContent = b ? 'Un momento…' : label;
  };
  (document.getElementById('bEye') as HTMLButtonElement).onclick = () => {
    for (const id of ['pw', 'pw2']) {
      const i = document.getElementById(id) as HTMLInputElement | null;
      if (i) i.type = i.type === 'password' ? 'text' : 'password';
    }
  };
  (document.getElementById('bGo') as HTMLButtonElement).onclick = async () => {
    const em = (document.getElementById('em') as HTMLInputElement).value.trim();
    const pw = (document.getElementById('pw') as HTMLInputElement).value;
    if (!em.includes('@')) { showErr('Revisá el email, le falta el @'); return; }
    if (pw.length < 8) { showErr('La contraseña necesita 8 caracteres como mínimo'); return; }
    if (!navigator.onLine) { showErr('Sin internet no puedo verificar tu cuenta. Conectate una vez para entrar; después seguís trabajando offline.'); return; }
    const accountType = document.getElementById('accountType') as HTMLSelectElement | null;
    if (accountType) setAccountType(accountType.value);
    if (mode === 'in') {
      busy(true, '');
      try {
        await signIn(em, pw);
        const me: any = await getUser().catch(() => null);
        if (me) {
          setLocalSession({ uid: me.id, email: me.email ?? em, org: getOrg() });
          sessionStorage.removeItem('zt_force_local');
        }
        toast('¡Hola de nuevo!');
        location.hash = '#/panel'; router();
      } catch (e: any) {
        busy(false, 'Entrar a mi negocio →');
        const st = e?.status ?? e?.response?.status;
        showErr(st === 400
          ? 'Ese email o contraseña no coinciden. Fijate bien o andá a "Crear cuenta" si es tu primera vez.'
          : 'No pude entrar (' + (st ?? 'red') + '): ' + pbErr(e));
      }
      return;
    }
    const ph = (document.getElementById('ph') as HTMLInputElement).value.trim();
    const pw2 = (document.getElementById('pw2') as HTMLInputElement).value;
    const digits = ph.replace(/\D/g, '');
    if (digits.length < 8) { showErr('Poné tu WhatsApp para avisarte de tus ventas'); return; }
    if (pw !== pw2) { showErr('Las contraseñas no coinciden, escribilas igual'); return; }
    busy(true, '');
    try {
      await signUp(em, pw, ph);
      const me: any = await getUser().catch(() => null);
      if (me) {
        setLocalSession({ uid: me.id, email: me.email ?? em, org: getOrg() });
        sessionStorage.removeItem('zt_force_local');
      }
      toast('Cuenta lista, entrando…');
      location.hash = '#/panel'; router();
    } catch (e: any) {
      busy(false, 'Crear mi cuenta gratis');
      const st = e?.status ?? e?.response?.status;
      showErr(st === 400
        ? 'No pude crearla: ' + pbErr(e) + ' (¿ese email ya tiene cuenta? Probá Entrar.)'
        : 'No pude crearla (' + (st ?? 'red') + '): ' + pbErr(e));
    }
  };
}

// ---------- Panel bento ----------
async function vPanel() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError) {
    app.innerHTML = shell(`<div class="bento"><div class="card span12">
      <h2>Falta preparar la nube</h2>
      <p class="mut">La dirección de PocketBase responde, pero todavía no tiene las colecciones de ZT Gestión. Por seguridad, la app ya no pide ni recibe la contraseña del administrador.</p>
      <p class="pill bad">${esc(cloudError)}</p>
      <p class="mut">Cargá las colecciones y sus reglas desde el servidor con <b>npm run setup:pocketbase</b>, siguiendo <b>app/pocketbase/collections.md</b>. Después volvé a intentar.</p>
      <div class="row"><button class="btn" id="bReload">Reintentar conexión</button><button class="btn ghost" id="bOut2">Salir</button></div>
    </div></div>`, 'panel', { email: (user as any)?.email });
    bindCommon(list, cur);
    (document.getElementById('bReload') as HTMLButtonElement).onclick = () => router();
    (document.getElementById('bOut2') as HTMLButtonElement).onclick = async () => { await signOut().catch(() => {}); location.hash = '#/login'; };
    return;
  }
  if (!cur) {
    const isEmployee = getAccountType() === 'empleado';
    app.innerHTML = shell(`<div class="bento"><div class="card span12">
      <h2>${isEmployee ? 'Tu cuenta está lista' : 'Creá tu negocio para empezar'}</h2>
      <p class="mut">${isEmployee ? 'Cuando el dueño de un negocio te agregue, vas a ver su stock y podés vender. Por ahora no tenés un negocio asignado.' : 'Cada negocio tiene su stock, ventas y equipo separados.'}</p>
      ${isEmployee ? myIdBlock(user) + '<p class="hint">Mandá este ID al dueño del negocio. Él lo pega en Equipo para agregarte.</p>' : '<div class="field"><label for="orgName">Nombre del negocio</label><div class="row"><input id="orgName" placeholder="Ej: Kiosco El Centro" style="max-width:300px"/><button class="btn" id="bOrg">Crear negocio</button></div></div>'}
    </div></div>`, 'panel', { orgs: list, org: cur, email: (user as any)?.email });
    bindCommon(list, cur);
    bindMyIdCopy();
    const bOrg = document.getElementById('bOrg') as HTMLButtonElement | null;
    if (bOrg) bOrg.onclick = async () => {
      const input = document.getElementById('orgName') as HTMLInputElement;
      const button = document.getElementById('bOrg') as HTMLButtonElement;
      if (input.value.trim().length < 2) { toast('Escribí un nombre de al menos 2 caracteres'); return; }
      button.disabled = true;
      try {
        const o = await createOrg(input.value.trim());
        setOrg(o.id); toast('Negocio creado'); router();
      } catch (e: any) { button.disabled = false; toast(e.message); }
    };
    return;
  }
  const org = cur;
  const orgName = list.find((o) => o.id === org)?.name ?? org.slice(0, 8);
  const role = list.find((o) => o.id === org)?.role ?? 'vendedor';
  const canSeeStats = role === 'dueno' || role === 'admin';
  // Pull nube si hay conexión (no rompe si falla: seguimos con local)
  let syncMsg = '';
  if (navigator.onLine && isCloudConfigured()) {
    try { const r = await withTimeout(syncOutbox(org)); await withTimeout(pullProducts(org)); if (r.synced) syncMsg = `${r.synced} ventas subidas`; else if (r.pending) syncMsg = `${r.pending} venta${r.pending === 1 ? '' : 's'} pendiente${r.pending === 1 ? '' : 's'}`; } catch (e: any) { syncMsg = e?.message ?? 'nube no disponible, sigo offline'; }
  }
  const prods = (await db.products.where('org_id').equals(org).toArray()).filter((p) => !p.deleted);
  const pend = await db.outbox.where('org_id').equals(org).toArray();
  const pendTotal = pend.reduce((a, s) => a + s.total, 0);
  const pendError = pend.find((s) => s.lastError)?.lastError ?? '';
  const low = prods.filter((p) => p.stock <= p.min_stock);
  const stockVal = prods.reduce((a, p) => a + p.price * p.stock, 0);
  const hist = await withTimeout(salesHistoryCloud(org, 50)).catch(() => []);
  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
  const dayKey = (value: unknown) => {
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const chartStart = new Date();
  chartStart.setHours(0, 0, 0, 0);
  chartStart.setDate(chartStart.getDate() - 6);
  const chart = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(chartStart);
    date.setDate(chartStart.getDate() + index);
    const key = dayKey(date);
    const total = [...hist, ...pend].reduce((sum, sale: any) => {
      const saleDate = sale.created_at ?? sale.createdAt;
      return sum + (dayKey(saleDate) === key ? Number(sale.total || 0) : 0);
    }, 0);
    return { label: date.toLocaleDateString('es-AR', { weekday: 'short' }).slice(0, 2), total };
  });
  const todayKey = dayKey(new Date());
  const todayTotal = [...hist, ...pend].reduce((sum, sale: any) => {
    const saleDate = sale.created_at ?? sale.createdAt;
    return sum + (dayKey(saleDate) === todayKey ? Number(sale.total || 0) : 0);
  }, 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const userName = String((user as any)?.email ?? 'bienvenido').split('@')[0];
  const chartMax = Math.max(1, ...chart.map((d) => d.total));
  const chartTotal = chart.reduce((sum, d) => sum + d.total, 0);
  const chartHTML = chart.map((d) => {
    const height = d.total ? Math.max(8, Math.round((d.total / chartMax) * 100)) : 3;
    return `<div class="chart-col" title="${fmt(d.total)}"><div class="chart-bar-wrap"><i class="chart-bar" style="height:${height}%"></i></div><small>${esc(d.label)}</small></div>`;
  }).join('');

  app.innerHTML = shell(`
  <div class="welcome-row">
    <div><div class="eyebrow">Mi negocio · ${esc(today)}</div><h1>${greeting}, ${esc(userName)} 👋</h1><p>Todo simple para vender, reponer y saber cómo va tu negocio.</p></div>
    <div class="welcome-actions"><a class="btn" href="#/ventas">🛒 Vender ahora</a><a class="btn ghost" href="#/productos">📦 Cargar stock</a></div>
  </div>
  ${canSeeStats ? `<div class="metric-grid">
    <a class="metric-card" href="#/ventas"><span>Ventas de hoy</span><strong>${fmt(todayTotal)}</strong><small>${todayTotal ? '¡Buen día de ventas!' : 'Todavía no vendiste hoy'}</small></a>
    <div class="metric-card"><span>Para subir</span><strong>${pend.length}</strong><small>${pendError ? 'Revisá el detalle' : 'Se suben solas'}</small></div>
    <a class="metric-card" href="#/productos"><span>Stock bajo</span><strong class="${low.length ? 'warn-text' : ''}">${low.length}</strong><small>${low.length ? 'Productos por reponer' : 'Todo tranquilo'}</small></a>
    <div class="metric-card"><span>Valor del stock</span><strong>${fmt(stockVal)}</strong><small>${prods.length} productos cargados</small></div>
  </div>` : ''}
  <div class="dash-grid">
    ${canSeeStats ? `<div class="card dash-wide">
      <div class="row" style="justify-content:space-between;align-items:start"><h3 style="margin:0">Cómo vienen las ventas</h3><span class="mut">Últimos 7 días · ${fmt(chartTotal)}</span></div>
      <div class="sales-chart" role="img" aria-label="Ventas de los últimos siete días: ${fmt(chartTotal)}">${chartHTML}</div>
    </div>` : `<div class="card dash-wide employee-banner"><div class="empty-dashboard">🧾<br/><b>Tus ventas</b><p class="mut">Registrá una venta y el dueño la verá en el panel del negocio.</p></div></div>`}
    <div class="card dash-side quick-card"><h3>Hagamos algo</h3><p class="mut">Botones grandes para no buscar nada.</p><div class="quick-actions"><a class="quick-action" href="#/ventas"><b>🛒</b><span>Vender<small>Cobrar una venta</small></span></a><a class="quick-action" href="#/productos"><b>📦</b><span>Reponer<small>Agregar stock</small></span></a><a class="quick-action" href="#/equipo"><b>👥</b><span>Equipo<small>Ver personas</small></span></a><button class="quick-action" data-install><b>⬇</b><span>Instalar app<small>Para el celular</small></span></button></div></div>
    <div class="card dash-wide"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Hay que reponer</h3><a class="text-link" href="#/productos">Ver todo el stock →</a></div>${low.length ? `<div class="reorder-list">${low.slice(0, 5).map((p) => `<div class="reorder-row"><div><b>${esc(p.name)}</b><small>Quedan ${p.stock} ${p.stock === 1 ? 'unidad' : 'unidades'}</small></div><strong>${fmt(p.price)}</strong></div>`).join('')}</div>` : '<div class="empty-dashboard">🌿 Todo está bien. No hay productos por reponer.</div>'}</div>
    <div class="card dash-side"><h3>Últimas ventas</h3>${hist.length ? `<div class="sales-list">${hist.slice(0, 5).map((h: any) => `<div class="sale-row"><span>${new Date(h.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><b>${fmt(h.total)}</b></div>`).join('')}</div>` : '<div class="empty-dashboard">🧾 Todavía no hay ventas cargadas.</div>'}${pend.length ? `<p class="mut pending-note">+ ${pend.length} venta${pend.length === 1 ? '' : 's'} en este equipo · ${fmt(pendTotal)}</p>` : ''}</div>
    <div class="card dash-wide sync-card"><div class="row" style="justify-content:space-between;align-items:center"><div><h3 style="margin:0">Ventas guardadas</h3><p class="${pendError ? 'sync-error' : 'mut'}">${pendError ? `No se pudo subir: ${esc(pendError)}` : 'Tus ventas quedan guardadas en este equipo y se suben cuando hay internet.'}</p></div><div class="row">${pendError ? '<button class="btn ghost small" id="bWhy">Ver detalle</button>' : ''}<button class="btn small" id="bSync">Subir ventas</button></div></div><span class="mut" id="syncMsg"></span></div>
  </div>`, 'panel', { orgs: list, org, email: (user as any)?.email, syncMsg });
  bindCommon(list, org);
  (document.getElementById('bWhy') as HTMLButtonElement | null)?.addEventListener('click', () => {
    alert(pendError || 'La venta sigue pendiente. Volvé a iniciar sesión y presioná Sincronizar.');
  });
  (document.getElementById('bSetupPin') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    const uid = (user as any)?.id;
    const email = (user as any)?.email;
    if (!uid || !email || uid === 'local') { toast('Entrá con tu cuenta para configurar el PIN'); return; }
    await promptPin(uid, email, org);
  });
  (document.getElementById('bSync') as HTMLButtonElement).onclick = async () => {
    (document.getElementById('syncMsg') as HTMLElement).textContent = 'sincronizando…';
    try {
      const r = await withTimeout(syncOutbox(org));
      await withTimeout(pullProducts(org));
      toast(r.pending ? `${r.synced} subidas, ${r.pending} quedan` : 'Todo sincronizado');
      router();
    } catch (e: any) { (document.getElementById('syncMsg') as HTMLElement).textContent = e.message; }
  };
}

// ---------- Stock ----------
async function vProductos(q = '') {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError || !cur) { location.hash = '#/panel'; return; }
  const org = cur;
  const role = list.find((o) => o.id === org)?.role ?? 'vendedor';
  const canManageProducts = role === 'dueno' || role === 'admin';
  let productAuthUntil = 0;
  const ensureProductAuth = async () => {
    if (!canManageProducts) { toast('Solo el dueño o un administrador puede modificar productos'); return false; }
    if (Date.now() < productAuthUntil) return true;
    const ok = await confirmActionPassword((user as any)?.email ?? '');
    if (ok) productAuthUntil = Date.now() + 5 * 60 * 1000;
    return ok;
  };
  let rows = (await db.products.where('org_id').equals(org).toArray()).filter((p) => !p.deleted);
  if (!rows.length && navigator.onLine) { try { rows = await withTimeout(pullProducts(org)); } catch {} }
  if (!rows.length && !isCloudConfigured()) {
    for (const s of [{ name: 'Kit Salvavidas', price: 25000, stock: 25 }, { name: 'Galaxy A14 128GB', price: 329999, stock: 6 }, { name: 'Tinta Epson x4', price: 34999, stock: 18 }]) {
      const p = newLocalProduct(org); p.name = s.name; p.price = s.price; p.stock = s.stock; p.dirty = 1; await db.products.add(p);
    }
    rows = await db.products.where('org_id').equals(org).toArray();
  }
  const ql = q.toLowerCase();
  const scanner = getScannerSettings();
  const view = rows.filter((p) => !ql || `${p.name} ${p.barcode ?? ''}`.toLowerCase().includes(ql)).sort((a, b) => a.name.localeCompare(b.name));
  app.innerHTML = shell(`
  <div class="card"><div class="row" style="justify-content:space-between">
    <div class="row"><input id="q" placeholder="Buscar producto…" value="${esc(q)}" style="max-width:260px"/></div>
    ${canManageProducts ? '<button class="btn small" id="bNew">+ Producto</button>' : '<span class="pill">Solo lectura para vendedores</span>'}
  </div>
  <div style="margin-top:.7rem"><table><tr><th>Producto</th><th>Precio</th><th>Stock</th><th></th></tr>
  <tbody id="productRows">${view.map((p) => `<tr data-name="${esc(`${p.name} ${p.barcode ?? ''}`.toLowerCase())}"><td><b>${esc(p.name || '(sin nombre)')}</b>${p.dirty ? ' <span class="pill warn">sin subir</span>' : ''}${p.lastError ? ' <span class="pill bad">revisar</span>' : ''}<br/><span class="mut">${esc(p.category)}${p.lastError ? ' · ' + esc(p.lastError) : ''}</span></td>
    <td>${fmt(p.price)}</td><td class="${p.stock <= p.min_stock ? 'low' : ''}">${p.stock}</td>
    <td style="white-space:nowrap">${canManageProducts ? `<button class="btn ghost small" data-edit="${p.id}">Editar</button> <button class="btn ghost small" data-del="${p.id}">Borrar</button>` : '<span class="mut">—</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="mut">Sin productos. Creá el primero con + Producto.</td></tr>'}
  </tbody></table></div></div>
  <div class="card" id="editor" style="display:none"><h2 id="edT">Producto</h2>
    <div class="grid2"><input id="fName" placeholder="Nombre *" /><input id="fCat" placeholder="Categoría" />
    <input id="fPrice" type="number" min="0" placeholder="Precio" /><input id="fStock" type="number" min="0" placeholder="Stock" />
    <input id="fMin" type="number" min="0" placeholder="Alerta mínimo (ej 3)" /><div class="field"><label>Código de barras</label><div class="row" style="flex-wrap:nowrap"><input id="fBarcode" inputmode="numeric" placeholder="Opcional" style="flex:1"/><button class="btn ghost small" id="bScanBarcode" title="Escanear">📷</button></div></div></div>
    <div class="row" style="margin-top:.6rem"><button class="btn small" id="bSave">Guardar (offline OK)</button><button class="btn ghost small" id="bCancel">Cancelar</button></div>
  </div>
  <div class="card scanner-settings"><div class="row" style="justify-content:space-between"><div><h3>⌨ Lector LED / código de barras</h3><p class="mut">Configurá cómo termina el lector. La mayoría usa Enter.</p></div><span id="scannerStatus" class="pill ${scanner.enabled ? 'ok' : 'warn'}">${scanner.enabled ? 'Activado' : 'Desactivado'}</span></div><div class="grid2"><div class="field"><label>Activar lector</label><select id="scannerEnabled"><option value="1" ${scanner.enabled ? 'selected' : ''}>Sí</option><option value="0" ${!scanner.enabled ? 'selected' : ''}>No</option></select></div><div class="field"><label>Termina con</label><select id="scannerSuffix"><option value="Enter" ${scanner.suffix === 'Enter' ? 'selected' : ''}>Enter</option><option value="Tab" ${scanner.suffix === 'Tab' ? 'selected' : ''}>Tab</option></select></div></div><div class="row" style="margin-top:.6rem"><button class="btn small" id="bSaveScanner">Guardar configuración</button></div></div>`, 'productos', { orgs: list, org, email: (user as any)?.email });
  bindCommon(list, org);
  (document.getElementById('q') as HTMLInputElement).oninput = (e) => {
    const query = (e.target as HTMLInputElement).value.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('#productRows tr[data-name]').forEach((row) => {
      row.style.display = row.dataset.name!.includes(query) ? '' : 'none';
    });
  };
  let editing: string | null = null;
  const openEd = (title: string) => { (document.getElementById('editor') as HTMLElement).style.display = 'block'; (document.getElementById('edT') as HTMLElement).textContent = title; };
  (document.getElementById('bNew') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    if (!await ensureProductAuth()) return;
    editing = null; openEd('Nuevo producto');
    (document.getElementById('fName') as HTMLInputElement).value = ''; (document.getElementById('fCat') as HTMLInputElement).value = 'general';
    (document.getElementById('fPrice') as HTMLInputElement).value = ''; (document.getElementById('fStock') as HTMLInputElement).value = ''; (document.getElementById('fMin') as HTMLInputElement).value = '3';
    (document.getElementById('fBarcode') as HTMLInputElement).value = '';
  });
  (document.getElementById('bSaveScanner') as HTMLButtonElement).onclick = () => {
    setScannerSettings({ enabled: (document.getElementById('scannerEnabled') as HTMLSelectElement).value === '1', suffix: (document.getElementById('scannerSuffix') as HTMLSelectElement).value as 'Enter' | 'Tab', minLength: 6 });
    toast('Configuración del lector guardada'); router();
  };
  (document.getElementById('bCancel') as HTMLButtonElement).onclick = () => ((document.getElementById('editor') as HTMLElement).style.display = 'none');
  (document.getElementById('bScanBarcode') as HTMLButtonElement).onclick = async () => {
    const code = await scanBarcode();
    if (code) (document.getElementById('fBarcode') as HTMLInputElement).value = code;
  };
  document.querySelectorAll('[data-edit]').forEach((b) => (b as HTMLButtonElement).onclick = async () => {
    if (!await ensureProductAuth()) return;
    editing = (b as HTMLButtonElement).dataset.edit!;
    const p = await db.products.get(editing); if (!p) return;
    openEd('Editar');
    (document.getElementById('fName') as HTMLInputElement).value = p.name;
    (document.getElementById('fCat') as HTMLInputElement).value = p.category;
    (document.getElementById('fPrice') as HTMLInputElement).value = String(p.price);
    (document.getElementById('fStock') as HTMLInputElement).value = String(p.stock);
    (document.getElementById('fMin') as HTMLInputElement).value = String(p.min_stock);
    (document.getElementById('fBarcode') as HTMLInputElement).value = p.barcode ?? '';
  });
  document.querySelectorAll('[data-del]').forEach((b) => (b as HTMLButtonElement).onclick = async () => {
    if (!await ensureProductAuth()) return;
    if (!confirm('¿Borrar de este equipo? (En nube se desactiva al sincronizar)')) return;
    await deleteProductLocal((b as HTMLButtonElement).dataset.del!);
    toast('Borrado local'); router();
  });
  (document.getElementById('bSave') as HTMLButtonElement).onclick = async () => {
    if (!await ensureProductAuth()) return;
    const name = (document.getElementById('fName') as HTMLInputElement).value.trim();
    if (!name) { toast('Poné un nombre'); return; }
    const base = editing ? await db.products.get(editing) : newLocalProduct(org);
    if (!base) return;
    base.name = name;
    base.category = (document.getElementById('fCat') as HTMLInputElement).value.trim() || 'general';
    base.price = Number((document.getElementById('fPrice') as HTMLInputElement).value || 0);
    base.stock = Number((document.getElementById('fStock') as HTMLInputElement).value || 0);
    base.min_stock = Number((document.getElementById('fMin') as HTMLInputElement).value || 3);
    base.barcode = (document.getElementById('fBarcode') as HTMLInputElement).value.trim();
    await saveProductLocal(base);
    toast('Guardado' + (navigator.onLine ? '' : ' offline'));
    router();
  };
}

// ---------- Vender (POS) ----------
async function vVentas() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError || !cur) { location.hash = '#/panel'; return; }
  const org = cur;
  const prods = (await db.products.where('org_id').equals(org).toArray()).filter((p) => !p.deleted).sort((a, b) => a.name.localeCompare(b.name));
  const cart = new Map<string, number>();
  barcodeHandler = (code) => {
    const p = prods.find((x) => x.barcode === code || x.id === code);
    if (!p) { toast('No encontré ese código en el stock'); return; }
    if (p.stock <= 0) { toast('Ese producto no tiene stock'); return; }
    cart.set(p.id, Math.min(p.stock, (cart.get(p.id) ?? 0) + 1));
    toast(`${p.name} agregado`);
    render();
  };
  let payMethod = 'efectivo';
  app.innerHTML = shell(`
  <div class="pos-page">
    <div class="pos-head-compact"><div><h1>Vender</h1><p>Tocá un producto o escaneá su código.</p></div><span class="pos-tip">⌨ Lector LED · 📷 Cámara</span></div>
    <div class="pos-layout">
      <section class="card pos-products"><div class="pos-search"><input id="q2" data-scanner-input placeholder="⌨ Escaneá o buscá un producto…" /><button class="btn ghost" id="bScanPos">📷 Cámara</button></div><div class="prod-grid" id="pg">${prods.map((p) => `
        <div class="card prod" data-name="${esc(`${p.name} ${p.barcode ?? ''}`.toLowerCase())}"><div class="prod-info"><b>${esc(p.name)}</b><span class="mut">${fmt(p.price)} · ${p.stock > 0 ? `${p.stock} disponibles` : 'Sin stock'}</span></div><button class="add-round" data-add="${p.id}" ${p.stock <= 0 ? 'disabled' : ''} aria-label="Agregar ${esc(p.name)}">+</button></div>`).join('') || '<div class="empty-dashboard">🧺 Todavía no hay productos. Pedile al dueño que cargue el stock.</div>'}</div></section>
      <aside class="card pos-cart"><div class="cart-head"><div><div class="eyebrow">Pedido actual</div><h2>🧾 Tu venta</h2></div><button class="btn ghost small" id="bClearCart">Vaciar</button></div><div id="cartBox" class="cart-scroll"></div><div class="pos-cart-foot"><div class="pay-label">¿Cómo paga?</div><div class="pay-grid"><button class="pay-btn ${payMethod === 'efectivo' ? 'on' : ''}" data-pay="efectivo">💵 Efectivo</button><button class="pay-btn ${payMethod === 'transferencia' ? 'on' : ''}" data-pay="transferencia">📱 Transferencia</button><button class="pay-btn ${payMethod === 'mercadopago' ? 'on' : ''}" data-pay="mercadopago">🏦 MercadoPago</button><button class="pay-btn ${payMethod === 'tarjeta' ? 'on' : ''}" data-pay="tarjeta">💳 Tarjeta</button></div><button class="btn charge-btn" id="bSell">Cobrar</button><p class="pos-note">${navigator.onLine ? 'La venta se sube sola.' : 'Sin internet: queda guardada en este equipo.'}</p></div></aside>
    </div>
  </div>`, 'ventas', { orgs: list, org, email: (user as any)?.email });
  bindCommon(list, org);
  const render = () => {
    const items = [...cart.entries()].map(([id, qty]) => {
      const p = prods.find((x) => x.id === id)!;
      return { product_id: id, name: p.name, qty, price: p.price };
    });
    const total = items.reduce((a, i) => a + i.price * i.qty, 0);
    const box = document.getElementById('cartBox') as HTMLElement;
    box.innerHTML = items.length ? `<div class="cart-lines">${items.map((i) => `<div class="cart-line"><div class="cart-line-name"><b>${esc(i.name)}</b><small>${fmt(i.price)} c/u</small></div><div class="cart-qty"><button data-dec="${i.product_id}">−</button><b>${i.qty}</b><button data-inc="${i.product_id}">+</button></div><strong>${fmt(i.price * i.qty)}</strong></div>`).join('')}</div><div class="cart-total"><span>Total</span><strong>${fmt(total)}</strong></div>` : '<div class="empty-cart">🛒<br/><b>Tu venta está vacía</b><p class="mut">Tocá un producto para agregarlo.</p></div>';
    box.querySelectorAll('[data-dec]').forEach((b) => (b as HTMLButtonElement).onclick = () => { const id = (b as HTMLButtonElement).dataset.dec!; cart.set(id, Math.max(0, (cart.get(id) ?? 1) - 1)); if (!cart.get(id)) cart.delete(id); render(); });
    box.querySelectorAll('[data-inc]').forEach((b) => (b as HTMLButtonElement).onclick = () => { const id = (b as HTMLButtonElement).dataset.inc!; const p = prods.find((x) => x.id === id); if (p && (cart.get(id) ?? 0) < p.stock) cart.set(id, (cart.get(id) ?? 0) + 1); render(); });
    const invalid = items.some((i) => { const p = prods.find((x) => x.id === i.product_id); return !p || p.stock < i.qty; });
    const sell = document.getElementById('bSell') as HTMLButtonElement;
    sell.disabled = !items.length || invalid;
    sell.textContent = items.length ? `Cobrar ${fmt(total)}` : 'Cobrar';
  };
  (document.getElementById('bSell') as HTMLButtonElement).onclick = async () => {
    const items = [...cart.entries()].map(([id, qty]) => {
      const p = prods.find((x) => x.id === id)!;
      return { product_id: id, name: p.name, qty, price: p.price };
    });
    if (!items.length) return;
    const pm = payMethod;
    const sell = document.getElementById('bSell') as HTMLButtonElement;
    sell.disabled = true;
    try {
      await createSaleOffline(org, items, pm);
      toast(navigator.onLine ? 'Venta guardada y sincronizando' : 'Venta guardada OFFLINE, se sube sola');
      cart.clear();
      router();
    } catch (e: any) {
      sell.disabled = false;
      toast(e?.message ?? 'No pude guardar la venta');
    }
  };
  document.querySelectorAll('[data-pay]').forEach((b) => (b as HTMLButtonElement).onclick = () => {
    payMethod = (b as HTMLButtonElement).dataset.pay ?? 'efectivo';
    document.querySelectorAll('[data-pay]').forEach((x) => x.classList.toggle('on', x === b));
  });
  (document.getElementById('bClearCart') as HTMLButtonElement).onclick = () => { cart.clear(); render(); };
  document.querySelectorAll('[data-add]').forEach((b) => (b as HTMLButtonElement).onclick = () => {
    const id = (b as HTMLButtonElement).dataset.add!;
    const p = prods.find((x) => x.id === id);
    const next = (cart.get(id) ?? 0) + 1;
    if (!p || next > p.stock) { toast(`Stock máximo: ${p?.stock ?? 0}`); return; }
    cart.set(id, next); render();
  });
  (document.getElementById('bScanPos') as HTMLButtonElement).onclick = async () => {
    const code = await scanBarcode();
    if (!code) return;
    const p = prods.find((x) => x.barcode === code || x.id === code);
    if (!p) { toast('No encontré ese código en el stock'); return; }
    if (p.stock <= 0) { toast('Ese producto no tiene stock'); return; }
    cart.set(p.id, Math.min(p.stock, (cart.get(p.id) ?? 0) + 1));
    toast(`${p.name} agregado`); render();
  };
  (document.getElementById('q2') as HTMLInputElement).oninput = (e) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    document.querySelectorAll('#pg .prod').forEach((el) => {
      (el as HTMLElement).style.display = (el as HTMLElement).dataset.name!.includes(q) ? '' : 'none';
    });
  };
  (document.getElementById('q2') as HTMLInputElement).onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    const code = (e.target as HTMLInputElement).value.trim();
    const p = prods.find((x) => x.barcode === code || x.id === code);
    if (!p) { toast('No encontré ese código en el stock'); return; }
    if (p.stock <= 0) { toast('Ese producto no tiene stock'); return; }
    cart.set(p.id, Math.min(p.stock, (cart.get(p.id) ?? 0) + 1));
    (e.target as HTMLInputElement).value = '';
    toast(`${p.name} agregado`); render();
  };
  render();
}

function confirmActionPassword(email: string): Promise<boolean> {
  if (!navigator.onLine) return Promise.resolve(true);
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ovl';
    ov.innerHTML = `<div class="card modal-card">
      <h2>Confirmá tu identidad</h2>
      <p class="mut">Esta acción cambia datos del negocio. Escribí tu contraseña para continuar.</p>
      <div class="field"><label>Contraseña</label><input id="confirmPw" type="password" autocomplete="current-password" placeholder="Tu contraseña" /></div>
      <p id="confirmErr" class="auth-err" style="display:none"></p>
      <div class="row" style="margin-top:.6rem"><button class="btn" id="confirmOk">Continuar</button><button class="btn ghost" id="confirmCancel">Cancelar</button></div>
    </div>`;
    document.body.appendChild(ov);
    const finish = (ok: boolean) => { ov.remove(); resolve(ok); };
    (document.getElementById('confirmCancel') as HTMLButtonElement).onclick = () => finish(false);
    (document.getElementById('confirmOk') as HTMLButtonElement).onclick = async () => {
      const input = document.getElementById('confirmPw') as HTMLInputElement;
      const error = document.getElementById('confirmErr') as HTMLElement;
      if (!input.value) { error.style.display = 'block'; error.textContent = 'Escribí tu contraseña.'; return; }
      const ok = await verifyAccountPassword(email, input.value);
      if (!ok) { error.style.display = 'block'; error.textContent = 'Contraseña incorrecta.'; return; }
      finish(true);
    };
    (document.getElementById('confirmPw') as HTMLInputElement).focus();
  });
}

// ---------- Caja diaria ----------
async function vCaja() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError || !cur) { location.hash = '#/panel'; return; }
  const org = cur;
  const role = list.find((o) => o.id === org)?.role ?? 'vendedor';
  const canManageCash = role === 'dueno' || role === 'admin';
  const day = new Date().toISOString().slice(0, 10);
  const cash = await getCashDay(org, day);
  const pend = await db.outbox.where('org_id').equals(org).toArray();
  const hist = await salesHistoryCloud(org, 50).catch(() => []);
  const sameDay = (value: unknown) => new Date(value as string).toDateString() === new Date().toDateString();
  const cashSales = [...pend, ...hist].filter((s: any) => s.pay_method === 'efectivo' && sameDay(s.created_at ?? s.createdAt)).reduce((sum, s: any) => sum + Number(s.total || 0), 0);
  const expected = (cash?.open_amount ?? 0) + cashSales;
  const openAmount = cash?.open_amount ?? 0;
  app.innerHTML = shell(`<div class="bento">
    <div class="card span8"><h2>Caja de hoy</h2><p class="mut">${cash ? (cash.closed_at ? 'Caja cerrada por hoy.' : 'Caja abierta. Podés seguir vendiendo.') : 'Todavía no abriste la caja de hoy.'}</p>${cash ? `<div class="cash-summary"><div><span>Apertura</span><b>${fmt(openAmount)}</b></div><div><span>Efectivo esperado</span><b>${fmt(expected)}</b></div><div><span>${cash.closed_at ? 'Cierre' : 'Diferencia'}</span><b>${cash.closed_at ? fmt(cash.close_amount ?? 0) : '—'}</b></div></div>` : ''}</div>
    <div class="card span4"><h3>${cash?.closed_at ? 'Abrir mañana' : 'Abrir caja'}</h3>${!cash || cash.closed_at ? `<div class="field"><label>Monto inicial</label><input id="openAmount" type="number" min="0" placeholder="Ej: 5000" /></div><button class="btn small" id="bOpenCash">Abrir caja</button>` : cash.closed_at ? '<p class="mut">La caja de hoy ya está cerrada.</p>' : `<p class="mut">Caja abierta desde ${new Date(cash.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.</p>`}</div>
    ${cash && !cash.closed_at ? `<div class="card span12"><h3>Cerrar caja</h3><div class="grid2"><div class="field"><label>Con cuánto dinero cerrás</label><input id="closeAmount" type="number" min="0" value="${expected}" /></div><div class="field"><label>Nota (opcional)</label><input id="cashNote" placeholder="Ej: conté con Ana" /></div></div><p class="mut">Esperado: <b>${fmt(expected)}</b>. Diferencia: se calcula al cerrar.</p><button class="btn small" id="bCloseCash">Cerrar caja</button></div>` : ''}
  </div>`, 'caja', { orgs: list, org, email: (user as any)?.email });
  bindCommon(list, org);
  (document.getElementById('bOpenCash') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    if (!canManageCash || !await confirmActionPassword((user as any)?.email ?? '')) return;
    const amount = Number((document.getElementById('openAmount') as HTMLInputElement).value || 0);
    await openCashDay(org, amount); toast('Caja abierta'); router();
  });
  (document.getElementById('bCloseCash') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    if (!canManageCash || !await confirmActionPassword((user as any)?.email ?? '')) return;
    const amount = Number((document.getElementById('closeAmount') as HTMLInputElement).value || 0);
    const note = (document.getElementById('cashNote') as HTMLInputElement).value.trim();
    await closeCashDay(org, cash!.id, amount, expected, note); toast('Caja cerrada'); router();
  });
}

// ---------- Tickets de taller ----------
async function vTickets() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError || !cur) { location.hash = '#/panel'; return; }
  const org = cur;
  const tickets = await pullTickets(org);
  app.innerHTML = shell(`<div class="bento">
    <div class="card span12"><div class="row" style="justify-content:space-between"><div><h2>Tickets de taller</h2><p class="mut">Anotá el equipo, el problema y cambiá el estado cuando advances.</p></div><button class="btn small" id="bNewTicket">+ Nuevo ticket</button></div></div>
    <div class="card span12" id="ticketEditor" style="display:none"><h3>Nuevo ticket</h3><div class="grid2"><div class="field"><label>Cliente</label><input id="tClient" placeholder="Nombre del cliente" /></div><div class="field"><label>WhatsApp</label><input id="tPhone" inputmode="tel" placeholder="3755 00-0000" /></div><div class="field"><label>Equipo</label><input id="tDevice" placeholder="Ej: Samsung A12" /></div><div class="field"><label>Precio</label><input id="tPrice" type="number" min="0" placeholder="0" /></div></div><div class="field" style="margin-top:.6rem"><label>Problema</label><textarea id="tProblem" rows="2" placeholder="Contá brevemente qué le pasa"></textarea></div><div class="row" style="margin-top:.6rem"><button class="btn small" id="bSaveTicket">Guardar ticket</button><button class="btn ghost small" id="bCancelTicket">Cancelar</button></div></div>
    <div class="card span12"><div class="ticket-list">${tickets.length ? tickets.map((t) => `<div class="ticket-row"><div class="ticket-code"><b>${esc(t.code)}</b><small>${esc(t.client_name)} · ${esc(t.device)}</small></div><div><small>${esc(t.problem || 'Sin detalle')}</small><strong>${fmt(t.price)}</strong></div><select data-ticket-status="${t.id}">${TICKET_STATUSES.map((s) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('') : '<div class="empty-dashboard">🧾 Todavía no hay tickets. Creá el primero.</div>'}</div></div>
  </div>`, 'tickets', { orgs: list, org, email: (user as any)?.email });
  bindCommon(list, org);
  (document.getElementById('bNewTicket') as HTMLButtonElement).onclick = () => ((document.getElementById('ticketEditor') as HTMLElement).style.display = 'block');
  (document.getElementById('bCancelTicket') as HTMLButtonElement).onclick = () => ((document.getElementById('ticketEditor') as HTMLElement).style.display = 'none');
  (document.getElementById('bSaveTicket') as HTMLButtonElement).onclick = async () => {
    const client = (document.getElementById('tClient') as HTMLInputElement).value.trim();
    const device = (document.getElementById('tDevice') as HTMLInputElement).value.trim();
    if (!client || !device) { toast('Cargá cliente y equipo'); return; }
    await createTicket(org, { client_name: client, phone: (document.getElementById('tPhone') as HTMLInputElement).value.trim(), device, problem: (document.getElementById('tProblem') as HTMLInputElement).value.trim(), status: 'recibido', price: Number((document.getElementById('tPrice') as HTMLInputElement).value || 0) });
    toast('Ticket creado'); router();
  };
  document.querySelectorAll('[data-ticket-status]').forEach((el) => (el as HTMLSelectElement).onchange = async (e) => {
    await updateTicketStatus(org, (e.target as HTMLSelectElement).dataset.ticketStatus!, (e.target as HTMLSelectElement).value as any);
    toast('Estado actualizado');
  });
}

// ---------- Admin (solo dueño) ----------
async function vAdmin() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (!cur) { location.hash = '#/panel'; return; }
  const owner = list.find((o) => o.id === cur)?.role === 'dueno';
  if (!owner) {
    app.innerHTML = shell(`<div class="bento"><div class="card span12"><h2>Acceso restringido</h2><p class="mut">El panel de administración solo puede verlo el dueño del negocio.</p><div class="row"><a class="btn small" href="#/panel">Volver al panel</a></div></div></div>`, 'admin', { orgs: list, org: cur, email: (user as any)?.email });
    bindCommon(list, cur);
    return;
  }

  const [products, pending, pins, members] = await Promise.all([
    db.products.where('org_id').equals(cur).toArray(),
    db.outbox.where('org_id').equals(cur).toArray(),
    db.pins.toArray(),
    listMembers(cur).catch(() => [])
  ]);
  const visibleProducts = products.filter((p) => !p.deleted);
  const pendingTotal = pending.reduce((sum, sale) => sum + sale.total, 0);
  const lastError = pending.find((sale) => sale.lastError)?.lastError ?? 'sin errores';
  const orgName = list.find((o) => o.id === cur)?.name ?? cur;
  const report = [
    `ZT Gestión · ${orgName}`,
    `Fecha: ${new Date().toLocaleString('es-AR')}`,
    `Usuario: ${(user as any)?.email ?? 'local'}`,
    `Nube: ${isCloudConfigured() ? (navigator.onLine ? 'configurada' : 'sin internet') : 'no configurada'}`,
    `Productos locales: ${visibleProducts.length}`,
    `Ventas pendientes: ${pending.length} (${fmt(pendingTotal)})`,
    `PINs guardados: ${pins.length}`,
    `Equipo: ${members.length}`,
    `Último error: ${lastError}`,
    `Diagnóstico: ${cloudError || 'sin errores de conexión'}`
  ].join('\n');

  app.innerHTML = shell(`<div class="bento">
    <div class="card span12 admin-banner"><div><h2>Panel de administración</h2><p class="mut">Solo el dueño puede ver esta pantalla y los datos sensibles del negocio.</p></div><span class="pill ok">${esc(orgName)}</span></div>
    <div class="card span6"><h3>Estado local</h3><div class="admin-stats"><div><b>${visibleProducts.length}</b><small>productos</small></div><div><b>${pending.length}</b><small>ventas pendientes</small></div><div><b>${pins.length}</b><small>PINs</small></div></div><p class="mut">La data local vive en este dispositivo (IndexedDB).</p></div>
    <div class="card span6"><h3>Estado de la nube</h3><div id="cloudState" class="diag-list"><div class="diag-row"><span>${navigator.onLine ? 'Internet' : 'Sin internet'}</span><b>${navigator.onLine ? '✓' : '—'}</b></div><div class="diag-row"><span>PocketBase</span><b>${isCloudConfigured() ? 'configurado' : 'no'}</b></div><div class="diag-row"><span>Sesión</span><b>${isLoggedIn() ? 'activa' : 'local'}</b></div></div></div>
    <div class="card span6"><h3>Equipo</h3><div class="admin-team">${members.map((m) => `<div><b>${esc(m.name)}</b><small>${esc(m.email || m.id)} · ${esc(m.role)}</small></div>`).join('') || '<p class="mut">Sin miembros cargados.</p>'}</div></div>
    <div class="card span6"><h3>Diagnóstico</h3><p class="mut">${esc(lastError)}</p><div class="row"><button class="btn small" id="bDiag">Probar conexión</button><button class="btn ghost small" id="bAdminSync">Sincronizar ahora</button><button class="btn ghost small" id="bCopyReport">Copiar informe</button></div><pre id="diagResult" class="diag-result">Presioná Probar conexión para verificar el servidor.</pre></div>
    <div class="card span12 danger-zone"><h3>Zona sensible</h3><p class="mut">Borrar los datos locales elimina stock, ventas pendientes y PINs de este dispositivo. La nube no se borra.</p><button class="btn ghost small" id="bResetLocal">Borrar datos locales</button></div>
  </div>`, 'admin', { orgs: list, org: cur, email: (user as any)?.email, syncMsg: cloudError });
  bindCommon(list, cur);

  const diag = (text: string, ok = true) => { const el = document.getElementById('diagResult'); if (el) el.textContent = text; return ok; };
  (document.getElementById('bDiag') as HTMLButtonElement).onclick = async () => {
    const button = document.getElementById('bDiag') as HTMLButtonElement;
    button.disabled = true;
    try {
      const health = await withTimeout(fetch(pbUrl() + '/api/health'));
      if (!health.ok) throw new Error('HTTP ' + health.status);
      const checkOrgs = await withTimeout(myOrgs());
      diag(`PocketBase: OK\nOrganizaciones visibles: ${checkOrgs.length}\nSin errores de red.`);
      toast('Diagnóstico correcto');
    } catch (e: any) { diag(`Error: ${e?.message ?? e}`); toast('La nube no responde'); }
    finally { button.disabled = false; }
  };
  (document.getElementById('bAdminSync') as HTMLButtonElement).onclick = async () => {
    const button = document.getElementById('bAdminSync') as HTMLButtonElement;
    button.disabled = true;
    try { const r = await withTimeout(syncOutbox(cur)); await withTimeout(pullProducts(cur)); toast(`${r.synced} subidas, ${r.pending} pendientes`); router(); }
    catch (e: any) { toast(e?.message ?? 'No pude sincronizar'); }
    finally { button.disabled = false; }
  };
  (document.getElementById('bCopyReport') as HTMLButtonElement).onclick = async () => {
    try { await navigator.clipboard.writeText(report); toast('Informe copiado'); } catch { window.alert(report); }
  };
  (document.getElementById('bResetLocal') as HTMLButtonElement).onclick = async () => {
    if (!confirm('Esto borra productos, ventas pendientes y PINs de este dispositivo. ¿Continuar?')) return;
    await db.delete();
    toast('Datos locales borrados');
    location.reload();
  };
}

// ---------- Equipo ----------
async function vEquipo() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError) {
    app.innerHTML = shell(`<div class="bento"><div class="card span12"><h2>Equipo no disponible</h2><p class="pill bad">${esc(cloudError)}</p><p class="mut">Revisá la nube o seguí usando el modo local desde el login.</p><div class="row"><a class="btn small" href="#/panel">Ir al panel</a></div></div></div>`, 'equipo', { orgs: list, org: cur, email: (user as any)?.email });
    bindCommon(list, cur);
    return;
  }
  const currentName = list.find((o) => o.id === cur)?.name ?? (cur ? 'tu negocio' : '');
  const teamRole = list.find((o) => o.id === cur)?.role ?? '';
  const canManageTeam = teamRole === 'dueno';
  let teamAuthUntil = 0;
  const ensureTeamAuth = async () => {
    if (!canManageTeam) { toast('Solo el dueño puede administrar el equipo'); return false; }
    if (Date.now() < teamAuthUntil) return true;
    const ok = await confirmActionPassword((user as any)?.email ?? '');
    if (ok) teamAuthUntil = Date.now() + 5 * 60 * 1000;
    return ok;
  };
  const members = cur && isCloudConfigured() ? await listMembers(cur).catch(() => []) : [];
  const roleLabel = (role: string) => role === 'dueno' ? 'Dueño' : role === 'admin' ? 'Administrador' : 'Vendedor';
  const teamList = members.length
    ? `<div class="team-list">${members.map((m) => `<div class="team-row"><i class="team-avatar">${esc((m.name || '?').charAt(0).toUpperCase())}</i><div><b>${esc(m.name)}</b><small>${esc(m.email || m.id)}</small></div><span class="role-tag ${m.role === 'vendedor' ? 'seller' : 'admin'}">${roleLabel(m.role)}</span></div>`).join('')}</div>`
    : '<p class="mut">Todavía no hay personas cargadas en este negocio.</p>';
  const teamContent = !cur
    ? (getAccountType() === 'empleado'
      ? `<p class="mut">Tu cuenta está esperando que un dueño te agregue a un negocio.</p>${myIdBlock(user)}<p class="hint">Mandá este ID al dueño. Él lo pega en Equipo para agregarte.</p>`
      : '<p class="mut">Primero creá un negocio. Después vas a poder invitar vendedores y administradores.</p><a class="btn small" href="#/panel">Ir al panel</a>')
    : !isCloudConfigured()
      ? '<p class="mut">Estás en modo local. El equipo multiusuario necesita la nube configurada.</p>'
      : `<p class="mut">Negocio: <b>${esc(currentName)}</b> · Sesión: ${esc((user as any)?.email ?? '')}</p>
        ${myIdBlock(user)}
        <ol class="team-steps">
          <li><b>1.</b> Pedile al vendedor que elija <b>Empleado</b> al crear su cuenta.</li>
          <li><b>2.</b> Que te copie su ID desde <b>Equipo → Mi ID</b>.</li>
          <li><b>3.</b> Pegalo acá y elegí qué puede hacer.</li>
        </ol>
        <div id="mManageTools"><div class="field"><label for="mId">ID del usuario</label><input id="mId" autocomplete="off" placeholder="Ej: 8fj2k1abcde" /><small class="hint">No es el email: es el identificador que aparece en la cuenta del vendedor.</small></div>
        <div class="grid2"><div class="field"><label for="mName">Nombre (opcional)</label><input id="mName" placeholder="Ej: Ana" /></div><div class="field"><label for="mEmail">Email (opcional)</label><input id="mEmail" type="email" placeholder="ana@correo.com" /></div></div>
        <div class="field"><label for="mRole">Permiso</label><select id="mRole"><option value="vendedor">Vendedor — puede vender y consultar stock</option><option value="admin">Administrador — puede administrar stock y ventas</option></select></div>
        <div class="row" style="margin-top:.6rem"><button class="btn small" id="bAdd">Agregar al equipo</button></div>
        <p class="mut">Por seguridad, solo el dueño del negocio puede agregar o quitar personas.</p></div>
        <p class="mut" id="teamLocked" style="display:${canManageTeam ? 'none' : 'block'}">Solo el dueño puede invitar o quitar personas del equipo.</p>
        <h3 class="team-subtitle">Personas con acceso</h3>${teamList}`;

  app.innerHTML = shell(`<div class="bento">
    <div class="card span6"><h2>Nuevo negocio</h2><p class="mut">Cada negocio tiene su propio stock, ventas y equipo.</p>
      <div class="field"><label for="orgName">Nombre del negocio</label><div class="row"><input id="orgName" placeholder="Ej: Kiosco El Centro" style="max-width:280px"/><button class="btn small" id="bOrg">Crear negocio</button></div></div>
    </div>
    <div class="card span6"><h2>Equipo</h2>${teamContent}</div>
    <div class="card span12"><h2>Abrir la caja sin internet</h2>
      <p class="mut" id="pinState">Reviso este equipo…</p>
      <div class="field"><label for="pinNew">PIN de este vendedor</label><div class="row"><input id="pinNew" inputmode="numeric" maxlength="12" placeholder="6 números" style="max-width:220px"/><button class="btn small" id="bPinSave">Guardar o cambiar PIN</button></div><small class="hint">El PIN queda guardado solamente en este dispositivo. Sirve para vender cuando se corta internet.</small></div>
    </div></div>`, 'equipo', { orgs: list, org: cur, email: (user as any)?.email });
  bindCommon(list, cur);
  if (!canManageTeam) (document.getElementById('mManageTools') as HTMLElement | null)?.setAttribute('hidden', 'true');
  bindMyIdCopy();
  // Estado del PIN en este equipo
  try {
    const uid = (user as any)?.id;
    const rec = uid ? await db.pins.get(uid) : undefined;
    (document.getElementById('pinState') as HTMLElement).textContent = rec
      ? '✓ Este equipo ya tiene PIN para ' + rec.email + '. Podés cambiarlo acá.'
      : 'Este equipo aún no tiene PIN. Guardá uno para vender sin internet.';
  } catch {}
  (document.getElementById('bPinSave') as HTMLButtonElement).onclick = async () => {
    const uid = (user as any)?.id;
    const email = (user as any)?.email;
    if (!uid || !email || uid === 'local') { toast('Entrá con tu cuenta primero'); return; }
    const orgForPin = cur || getOrg();
    if (!orgForPin) { toast('Elegí o creá un negocio antes de guardar el PIN'); return; }
    const code = ((document.getElementById('pinNew') as HTMLInputElement).value || '').replace(/\D/g, '');
    if (code.length < 6) { toast('El PIN necesita 6 números como mínimo'); return; }
    await db.pins.put({ userId: uid, email, org_id: orgForPin, pinHash: await hashPin(email, code), updatedAt: Date.now() });
    setLocalSession({ uid, email, org: orgForPin });
    toast('PIN guardado ✓');
    router();
  };
  const bO = document.getElementById('bOrg') as HTMLButtonElement | null;
  if (bO) bO.onclick = async () => {
    const name = (document.getElementById('orgName') as HTMLInputElement).value.trim();
    if (name.length < 2) { toast('Escribí un nombre de al menos 2 caracteres'); return; }
    bO.disabled = true;
    try {
      const o = await createOrg(name);
      setOrg(o.id); toast('Negocio creado'); router();
    } catch (e: any) { bO.disabled = false; toast(e.message); }
  };
  const bA = document.getElementById('bAdd') as HTMLButtonElement | null;
  if (bA) bA.onclick = async () => {
    if (!cur) { toast('Primero creá un negocio'); return; }
    if (!await ensureTeamAuth()) return;
    const memberId = (document.getElementById('mId') as HTMLInputElement).value.trim();
    if (memberId.length < 8) { toast('Revisá el ID del usuario'); return; }
    bA.disabled = true;
    try {
      await addMemberById(
        cur,
        memberId,
        (document.getElementById('mRole') as HTMLSelectElement).value,
        (document.getElementById('mEmail') as HTMLInputElement | null)?.value ?? '',
        (document.getElementById('mName') as HTMLInputElement | null)?.value ?? ''
      );
      (document.getElementById('mId') as HTMLInputElement).value = '';
      (document.getElementById('mName') as HTMLInputElement | null)!.value = '';
      (document.getElementById('mEmail') as HTMLInputElement | null)!.value = '';
      toast('Persona agregada al equipo');
    } catch (e: any) { toast(e.message); }
    finally { bA.disabled = false; }
  };
}

export async function router() {
  const h = location.hash || '#/panel';
  try {
    if (h.startsWith('#/registro')) await vLogin('up');
    else if (h.startsWith('#/login')) await vLogin('in');
    else if (h.startsWith('#/productos')) await vProductos();
    else if (h.startsWith('#/ventas')) await vVentas();
    else if (h.startsWith('#/equipo')) await vEquipo();
    else if (h.startsWith('#/caja')) await vCaja();
    else if (h.startsWith('#/tickets')) await vTickets();
    else if (h.startsWith('#/admin')) await vAdmin();
    else await vPanel();
  } catch (e: any) {
    if (String(e?.message) === 'login') { location.hash = '#/login'; await vLogin('in'); return; }
    app.innerHTML = shell(`<div class="card"><h2>Algo falló</h2><p class="mut">${esc(e?.message ?? String(e))}</p><div class="row"><a class="btn small" href="#/panel">Reintentar</a></div></div>`, 'panel');
    bindCommon([], '');
  }
  refreshInstallUI();
}

initScanner();
addEventListener('hashchange', router);

// ---- Vigía de conexión: barra offline, recarga sola y botón reintentar ----
let lastNet = navigator.onLine;
function refreshNet() {
  const now = navigator.onLine;
  const bar = document.getElementById('netbar');
  if (bar) bar.style.display = now ? 'none' : 'flex';
  if (now !== lastNet) {
    lastNet = now;
    if (now) {
      toast('Volvió internet, sincronizando…');
      (async () => {
        const hadLocalSession = !!getLocalSession();
        const refreshed = await refreshSession().catch(() => false);
        if (!refreshed && hadLocalSession) {
          toast('Volvió internet; iniciá sesión para subir las ventas pendientes');
          router();
          return;
        }
        const o = getOrg();
        if (o) {
          try { await withTimeout(syncOutbox(o)); await withTimeout(pullProducts(o)); } catch { /* seguimos local */ }
        }
        await router();
      })();
    } else {
      toast('Sin internet: sigo vendiendo offline');
    }
  }
}
async function retryCloud() {
  toast('Probando conexión…');
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(pbUrl() + '/api/health', { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) { toast('Hay internet ✓'); router(); }
    else toast('Todavía sin conexión, sigo local');
  } catch { toast('Todavía sin conexión, sigo local'); }
}
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#netRetry')) retryCloud();
});
addEventListener('online', refreshNet);
addEventListener('offline', refreshNet);
setInterval(refreshNet, 15000);
router();
// Pinta la barra en la primera carga si arranca offline
setTimeout(refreshNet, 300);
