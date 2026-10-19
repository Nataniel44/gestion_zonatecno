import { confirmModal, esc, OUT_ICON, statusPills, setOrg } from './ui';
import { signOut, setLocalSession, getLocalSession } from './lib/store';

export function shell(inner: string, tab = '', opts: { orgs?: { id: string; name: string; role?: string }[]; org?: string; email?: string; syncMsg?: string } = {}) {
  const isOwner = (opts.orgs?.some((o) => o.id === opts.org && o.role === 'dueno') ?? false)
    || ((opts.orgs?.some((o) => (o.role ?? '') === '') ?? false) && !!getLocalSession());
  const titles: Record<string, string> = { panel: 'Panel', ventas: 'Vender', productos: 'Stock', caja: 'Caja', tickets: 'Tickets', recibos: 'Recibos', equipo: 'Negocio y equipo', ajustes: 'Ajustes', admin: 'Admin' };
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
        ${isOwner ? `<a href="#/ajustes" class="${tab === 'ajustes' ? 'on' : ''}">🛠 Ajustes</a><a href="#/admin" class="${tab === 'admin' ? 'on' : ''}">⚙ Admin</a>` : ''}
        <button class="navdl" data-install>⬇ Descargar app</button>
      </nav>
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:.5rem">
        <span class="mut">${esc(opts.email ?? '')}</span>
      </div>
    </div>`;
  const moreTabs = ['tickets', 'recibos', 'equipo', 'ajustes', 'admin'];
  const moreOn = moreTabs.includes(tab);
  const moreLinks = [
    { href: '#/tickets', icon: '🧾', label: 'Tickets', sub: 'Taller y reparaciones', tab: 'tickets' },
    { href: '#/recibos', icon: '🧷', label: 'Recibos', sub: 'Presupuestos y comprobantes', tab: 'recibos' },
    { href: '#/equipo', icon: '👥', label: 'Equipo', sub: 'Personas y permisos', tab: 'equipo' },
    ...(isOwner ? [
      { href: '#/ajustes', icon: '🛠', label: 'Ajustes', sub: 'Balanza y punto de venta', tab: 'ajustes' },
      { href: '#/admin', icon: '⚙', label: 'Admin', sub: 'Diagnóstico y datos', tab: 'admin' },
    ] : []),
  ].map((a) => `<a class="more-link ${tab === a.tab ? 'on' : ''}" href="${a.href}"><i>${a.icon}</i><span><b>${a.label}</b><small>${a.sub}</small></span></a>`).join('');
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
      <nav class="mobnav" aria-label="Navegación principal">
        <a href="#/panel" class="${tab === 'panel' ? 'on' : ''}"><i>◧</i>Panel</a>
        <a href="#/ventas" class="${tab === 'ventas' ? 'on' : ''}"><i>◉</i>Vender</a>
        <a href="#/productos" class="${tab === 'productos' ? 'on' : ''}"><i>▤</i>Stock</a>
        <a href="#/caja" class="${tab === 'caja' ? 'on' : ''}"><i>💵</i>Caja</a>
        <button class="mobnav-more ${moreOn ? 'on' : ''}" type="button" data-more aria-haspopup="dialog"><i>⋯</i>Más</button>
      </nav>
      <div class="more-sheet" id="moreSheet" hidden>
        <div class="more-backdrop" data-close-more></div>
        <div class="more-panel" role="dialog" aria-modal="true" aria-label="Más opciones">
          <div class="more-grab"></div>
          <div class="more-head"><div><div class="eyebrow">ZT Gestión</div><h2>Más opciones</h2></div><button class="btn ghost small" type="button" data-close-more>Cerrar</button></div>
          <div class="more-grid">${moreLinks}</div>
          <button class="more-install" type="button" data-install>⬇ Instalar la app en este equipo</button>
          <button class="more-logout" type="button" data-logout>Cerrar sesión</button>
        </div>
      </div>
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
  const sheet = document.getElementById('moreSheet');
  if (sheet) {
    const close = () => {
      sheet.classList.remove('show');
      setTimeout(() => { sheet.hidden = true; }, 180);
    };
    document.querySelectorAll('[data-more]').forEach((b) => (b as HTMLButtonElement).onclick = () => {
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add('show'));
    });
    sheet.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === sheet || target.closest('[data-close-more]') || target.closest('a') || target.closest('[data-install]') || target.closest('[data-logout]')) close();
    });
  }
  void orgs; void org;
}

let _navigate: () => Promise<void> = async () => {};
export function setNavigator(fn: () => Promise<void>) { _navigate = fn; }
export function navigate(): Promise<void> { return _navigate(); }
