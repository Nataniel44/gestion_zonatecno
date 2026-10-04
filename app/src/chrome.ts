import { confirmModal, esc, OUT_ICON, statusPills, setOrg } from './ui';
import { signOut, setLocalSession, getLocalSession } from './lib/store';

export function shell(inner: string, tab = '', opts: { orgs?: { id: string; name: string; role?: string }[]; org?: string; email?: string; syncMsg?: string } = {}) {
  const isOwner = opts.orgs?.some((o) => o.id === opts.org && o.role === 'dueno') ?? false;
  const titles: Record<string, string> = { panel: 'Panel', ventas: 'Vender', productos: 'Stock', caja: 'Caja', tickets: 'Tickets', recibos: 'Recibos', equipo: 'Negocio y equipo', admin: 'Admin' };
  const nav = (cls: string) => `
    <div class="side">
      <div class="brand"><i>Z</i> ZT Gestión</div>
      <nav class="nav">
        <a href="#/panel" class="${tab === 'panel' ? 'on' : ''}">◧ Panel</a>
        <a href="#/ventas" class="${tab === 'ventas' ? 'on' : ''}">◉ Vender</a>
        <a href="#/productos" class="${tab === 'productos' ? 'on' : ''}">▤ Stock</a>
        <a href="#/caja" class="${tab === 'caja' ? 'on' : ''}">💵 Caja</a>
        <a href="#/tickets" class="${tab === 'tickets' ? 'on' : ''}">🧾 Tickets</a>
        <a href="#/recibos" class="${tab === 'recibos' ? 'on' : ''}">🧷 Recibos</a>
        <a href="#/equipo" class="${tab === 'equipo' ? 'on' : ''}">⛁ Equipo</a>
        ${isOwner ? `<a href="#/admin" class="${tab === 'admin' ? 'on' : ''}">⚙ Admin</a>` : ''}
        <button class="navdl" data-install>⬇ Descargar app</button>
      </nav>
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:.5rem">
        <span class="mut">${esc(opts.email ?? '')}</span>
      </div>
    </div>`;
  const orgSel = opts.orgs?.length
    ? `<select class="orgsel" id="orgSel">${opts.orgs.map((o) => `<option value="${o.id}" ${o.id === opts.org ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`
    : '';
  return `<div class="app">${nav(tab)}
    <div class="main">
      <div id="netbar" class="netbar" style="display:none">📴 <b>Sin internet.</b>&nbsp;Seguís vendiendo; las ventas quedan en este equipo y se suben al iniciar sesión.&nbsp;<button class="btn small" id="netRetry">Probar conexión</button></div>
      <div class="topbar">
        <div class="row"><h1>${titles[tab] ?? ''}</h1>${orgSel}</div>
        <div class="row">${statusPills(opts.syncMsg)}<button class="btn ghost small topbar-out" id="btnOutTop" data-logout title="Cerrar sesión">${OUT_ICON} Salir</button></div>
      </div>
      ${inner}
      <nav class="mobnav">
        <a href="#/panel" class="${tab === 'panel' ? 'on' : ''}">Panel</a>
        <a href="#/ventas" class="${tab === 'ventas' ? 'on' : ''}">Vender</a>
        <a href="#/productos" class="${tab === 'productos' ? 'on' : ''}">Stock</a>
        <a href="#/caja" class="${tab === 'caja' ? 'on' : ''}">Caja</a>
        <a href="#/tickets" class="${tab === 'tickets' ? 'on' : ''}">Tickets</a>
        <a href="#/recibos" class="${tab === 'recibos' ? 'on' : ''}">Recibos</a>
        <a href="#/equipo" class="${tab === 'equipo' ? 'on' : ''}">Equipo</a>
        ${isOwner ? `<a href="#/admin" class="${tab === 'admin' ? 'on' : ''}">Admin</a>` : ''}
      </nav>
    </div></div>`;
}

export async function doSignOut() {
  if (!await confirmModal('¿Cerrar sesión en este equipo? Las ventas pendientes quedan guardadas y se suben al volver a entrar.', 'Cerrar sesión', 'Cerrar sesión')) return;
  try { await signOut(); } catch { /* seguimos con limpieza local igual */ }
  setLocalSession(null); // se cierra la caja, pero el PIN queda para reabrir offline
  localStorage.removeItem('zt_org');
  sessionStorage.removeItem('zt_force_local');
  location.hash = '#/login';
  await navigate();
}

export function bindCommon(orgs: { id: string; name: string }[], org: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-logout]').forEach((b) => {
    b.onclick = () => { void doSignOut(); };
  });
  const s = document.getElementById('orgSel') as HTMLSelectElement | null;
  if (s) s.onchange = () => {
    setOrg(s.value);
    const ls = getLocalSession();
    if (ls) setLocalSession({ ...ls, org: s.value });
    navigate();
  };
  void orgs; void org;
}

let _navigate: () => Promise<void> = async () => {};
export function setNavigator(fn: () => Promise<void>) { _navigate = fn; }
export function navigate(): Promise<void> { return _navigate(); }
