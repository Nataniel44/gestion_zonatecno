import { refreshInstallUI } from './pwa';
import { setNavigator, shell, bindCommon } from './chrome';
import { initScanner, setBarcodeHandler } from './scanner';
import { getOrg, app, esc, toast, withTimeout } from './ui';
import { refreshSession, syncOutbox, pullProducts, getLocalSession } from './lib/store';
import { pbUrl, isLoggedIn } from './lib/pb';
import { vLogin } from './views/login';
import { vPanel } from './views/panel';
import { vProductos } from './views/productos';
import { vVentas } from './views/ventas';
import { vCaja } from './views/caja';
import { vTickets } from './views/tickets';
import { vRecibos } from './views/recibos';
import { vEquipo } from './views/equipo';
import { vAdmin } from './views/admin';

export async function router() {
  setBarcodeHandler(null);
  const h = location.hash || '#/panel';
  try {
    if (h.startsWith('#/registro')) await vLogin('up');
    else if (h.startsWith('#/login')) await vLogin('in');
    else if (h.startsWith('#/productos')) await vProductos();
    else if (h.startsWith('#/ventas')) await vVentas();
    else if (h.startsWith('#/equipo')) await vEquipo();
    else if (h.startsWith('#/caja')) await vCaja();
    else if (h.startsWith('#/tickets')) await vTickets();
    else if (h.startsWith('#/recibos')) await vRecibos();
    else if (h.startsWith('#/admin')) await vAdmin();
    else await vPanel();
  } catch (e: any) {
    if (String(e?.message) === 'login') { location.hash = '#/login'; await vLogin('in'); return; }
    app.innerHTML = shell(`<div class="card"><h2>Algo falló</h2><p class="mut">${esc(e?.message ?? String(e))}</p><div class="row"><a class="btn small" href="#/panel">Reintentar</a></div></div>`, 'panel');
    bindCommon([], '');
  }
  refreshInstallUI();
  document.querySelectorAll('.mobnav a.on, .nav a.on').forEach((a) => a.setAttribute('aria-current', 'page'));
}

initScanner();
addEventListener('hashchange', router);

// ---- Vigía de conexión: barra offline, recarga sola y botón reintentar ----
export let lastNet = navigator.onLine;
export function refreshNet() {
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
export async function retryCloud() {
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
// Renueva el token cada 10 minutos para que la sesión no venza en turnos largos.
setInterval(() => {
  if (navigator.onLine && isLoggedIn()) void refreshSession().catch(() => undefined);
}, 10 * 60 * 1000);
router();
// Pinta la barra en la primera carga si arranca offline
setTimeout(refreshNet, 300);

setNavigator(router);
