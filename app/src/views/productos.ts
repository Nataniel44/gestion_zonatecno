import { db } from '../lib/localdb';
import { pullProducts, saveProductLocal, deleteProductLocal, newLocalProduct } from '../lib/store';
import { isCloudConfigured } from '../lib/pb';
import { app, esc, toast, fmt, confirmActionPassword, withTimeout, confirmModal } from '../ui';
import { shell, bindCommon, navigate } from '../chrome';
import { requireUser, loadOrgs, isLocalContext } from '../session';
import { getScannerSettings, setScannerSettings, scanBarcode } from '../scanner';

// ---------- Stock ----------
export async function vProductos(q = '') {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError || !cur) { location.hash = '#/panel'; return; }
  const org = cur;
  const role = list.find((o) => o.id === org)?.role ?? 'vendedor';
  const canManageProducts = role === 'dueno' || role === 'admin' || isLocalContext(role, user);
  const permLabel = role === '' || (user as any)?.id === 'local' ? 'Local' : role === 'dueno' ? 'Dueño' : role === 'admin' ? 'Administrador' : 'Vendedor';
  let productAuthUntil = 0;
  const ensureProductAuth = async (action = 'modificar un producto') => {
    if (!canManageProducts) { toast('Solo el dueño o un administrador puede modificar productos'); return false; }
    if (Date.now() < productAuthUntil) return true;
    const ok = await confirmActionPassword((user as any)?.email ?? '', action);
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
  <div class="card"><div class="row stock-head" style="justify-content:space-between">
    <div class="row" style="flex:1;min-width:min(100%,240px)"><input id="q" placeholder="Buscar producto…" value="${esc(q)}" style="max-width:260px;flex:1"/></div>
    ${canManageProducts ? '<button class="btn small" id="bNew">+ Producto</button>' : '<span class="pill">Solo lectura para vendedores</span>'}<span class="pill">Tu permiso: ${permLabel}</span>
  </div>
  <div class="table-wrap"><table><tr><th>Producto</th><th>Precio</th><th>Stock</th><th></th></tr>
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
    if (!await ensureProductAuth('crear un producto')) return;
    editing = null; openEd('Nuevo producto');
    (document.getElementById('fName') as HTMLInputElement).value = ''; (document.getElementById('fCat') as HTMLInputElement).value = 'general';
    (document.getElementById('fPrice') as HTMLInputElement).value = ''; (document.getElementById('fStock') as HTMLInputElement).value = ''; (document.getElementById('fMin') as HTMLInputElement).value = '3';
    (document.getElementById('fBarcode') as HTMLInputElement).value = '';
  });
  (document.getElementById('bSaveScanner') as HTMLButtonElement).onclick = () => {
    setScannerSettings({ enabled: (document.getElementById('scannerEnabled') as HTMLSelectElement).value === '1', suffix: (document.getElementById('scannerSuffix') as HTMLSelectElement).value as 'Enter' | 'Tab', minLength: 6 });
    toast('Configuración del lector guardada'); navigate();
  };
  (document.getElementById('bCancel') as HTMLButtonElement).onclick = () => ((document.getElementById('editor') as HTMLElement).style.display = 'none');
  (document.getElementById('bScanBarcode') as HTMLButtonElement).onclick = async () => {
    const code = await scanBarcode();
    if (code) (document.getElementById('fBarcode') as HTMLInputElement).value = code;
  };
  document.querySelectorAll('[data-edit]').forEach((b) => (b as HTMLButtonElement).onclick = async () => {
    if (!await ensureProductAuth('editar este producto')) return;
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
    if (!await ensureProductAuth('borrar este producto')) return;
    if (!await confirmModal('¿Borrar de este equipo? En la nube se desactiva al sincronizar.', 'Borrar', 'Borrar producto')) return;
    await deleteProductLocal((b as HTMLButtonElement).dataset.del!);
    toast('Borrado local'); navigate();
  });
  (document.getElementById('bSave') as HTMLButtonElement).onclick = async () => {
    if (!await ensureProductAuth(editing ? 'guardar los cambios del producto' : 'crear este producto')) return;
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
    navigate();
  };
}
