import { db } from '../lib/localdb';
import { syncOutbox, pullProducts, salesHistoryCloud, createOrg, setLocalSession, getLocalSession } from '../lib/store';
import { isCloudConfigured } from '../lib/pb';
import { app, esc, toast, fmt, withTimeout, getAccountType, myIdBlock, bindMyIdCopy, setOrg, infoModal } from '../ui';
import { shell, bindCommon, navigate } from '../chrome';
import { requireUser, loadOrgs, promptPin } from '../session';

// ---------- Panel bento ----------
export async function vPanel() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError) {
    app.innerHTML = shell(`<div class="bento"><div class="card span12">
      <h2>Falta preparar la nube</h2>
      <p class="mut">La dirección de PocketBase responde, pero todavía no tiene las colecciones de ZT Gestión. Por seguridad, la app ya no pide ni recibe la contraseña del administrador.</p>
      <p class="pill bad">${esc(cloudError)}</p>
      <p class="mut">Cargá las colecciones y sus reglas desde el servidor con <b>npm run setup:pocketbase</b>, siguiendo <b>app/pocketbase/collections.md</b>. Después volvé a intentar.</p>
      <div class="row"><button class="btn" id="bReload">Reintentar conexión</button></div>
    </div></div>`, 'panel', { email: (user as any)?.email });
    bindCommon(list, cur);
    (document.getElementById('bReload') as HTMLButtonElement).onclick = () => navigate();
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
        setOrg(o.id); toast('Negocio creado'); navigate();
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
    infoModal('Ventas sin subir', pendError || 'La venta sigue pendiente. Volvé a iniciar sesión y presioná Sincronizar.');
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
      navigate();
    } catch (e: any) {
      (document.getElementById('syncMsg') as HTMLElement).textContent = e.message;
      if (/sesi.n vencida/i.test(e?.message ?? '')) { location.hash = '#/login'; navigate(); }
    }
  };
}
