import { db } from '../lib/localdb';
import { myOrgs, syncOutbox, pullProducts, listMembers } from '../lib/store';
import { pbUrl, isLoggedIn, isCloudConfigured } from '../lib/pb';
import { app, esc, toast, fmt, withTimeout, confirmModal } from '../ui';
import { shell, bindCommon, navigate } from '../chrome';
import { requireUser, loadOrgs, isLocalContext } from '../session';

// ---------- Admin (solo dueño) ----------
export async function vAdmin() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (!cur) { location.hash = '#/panel'; return; }
  const myRole = list.find((o) => o.id === cur)?.role ?? '';
  const owner = myRole === 'dueno' || isLocalContext(myRole, user);
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
    try { const r = await withTimeout(syncOutbox(cur)); await withTimeout(pullProducts(cur)); toast(`${r.synced} subidas, ${r.pending} pendientes`); navigate(); }
    catch (e: any) {
      toast(e?.message ?? 'No pude sincronizar');
      if (/sesi.n vencida/i.test(e?.message ?? '')) { location.hash = '#/login'; navigate(); }
    }
    finally { button.disabled = false; }
  };
  (document.getElementById('bCopyReport') as HTMLButtonElement).onclick = async () => {
    try { await navigator.clipboard.writeText(report); toast('Informe copiado'); } catch { window.alert(report); }
  };
  (document.getElementById('bResetLocal') as HTMLButtonElement).onclick = async () => {
    if (!await confirmModal('Esto borra productos, ventas pendientes y PINs de este dispositivo. ¿Continuar?', 'Borrar todo')) return;
    await db.delete();
    toast('Datos locales borrados');
    location.reload();
  };
}
