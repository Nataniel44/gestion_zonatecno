import { db } from '../lib/localdb';
import { createSaleOffline } from '../lib/store';
import { app, esc, toast, fmt } from '../ui';
import { shell, bindCommon, navigate } from '../chrome';
import { requireUser, loadOrgs } from '../session';
import { setBarcodeHandler, scanBarcode } from '../scanner';

// ---------- Vender (POS) ----------
export async function vVentas() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError || !cur) { location.hash = '#/panel'; return; }
  const org = cur;
  const prods = (await db.products.where('org_id').equals(org).toArray()).filter((p) => !p.deleted).sort((a, b) => a.name.localeCompare(b.name));
  const cart = new Map<string, number>();
  setBarcodeHandler((code) => {
    const p = prods.find((x) => x.barcode === code || x.id === code);
    if (!p) { toast('No encontré ese código en el stock'); return; }
    if (p.stock <= 0) { toast('Ese producto no tiene stock'); return; }
    cart.set(p.id, Math.min(p.stock, (cart.get(p.id) ?? 0) + 1));
    toast(`${p.name} agregado`);
    render();
  });
  let payMethod = 'efectivo';
  app.innerHTML = shell(`
  <div class="pos-page">
    <div class="pos-subhead"><p>Buscá un producto o ingresá su código.</p><span class="pos-tip">Lector LED · Cámara</span></div>
    <div class="pos-layout">
      <section class="card pos-products"><div class="pos-search"><input id="q2" data-scanner-input placeholder="Buscar producto o código…" aria-label="Buscar producto o código" /><button class="btn ghost" id="bScanPos">Cámara</button></div><div class="prod-list" id="pg">${prods.map((p) => `
        <div class="prod-row" data-name="${esc(`${p.name} ${p.barcode ?? ''}`.toLowerCase())}"><div class="prod-info"><b>${esc(p.name)}</b><span class="mut">${fmt(p.price)} · ${p.stock > 0 ? `Stock ${p.stock}` : 'Sin stock'}</span></div><button class="add-btn" data-add="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Sin stock' : 'Agregar'}</button></div>`).join('') || '<div class="empty-dashboard">Todavía no hay productos. Pedile al dueño que cargue el stock.</div>'}</div></section>
      <aside class="card pos-cart"><div class="cart-head"><div><div class="eyebrow">Pedido actual</div><h2>Venta</h2></div><button class="btn ghost small" id="bClearCart">Vaciar</button></div><div id="cartBox" class="cart-scroll"></div><div class="pos-cart-foot"><div class="pay-label">Medio de pago</div><div class="pay-seg" role="radiogroup" aria-label="Medio de pago"><button class="pay-opt ${payMethod === 'efectivo' ? 'on' : ''}" data-pay="efectivo">Efectivo</button><button class="pay-opt ${payMethod === 'transferencia' ? 'on' : ''}" data-pay="transferencia">Transferencia</button><button class="pay-opt ${payMethod === 'mercadopago' ? 'on' : ''}" data-pay="mercadopago">MercadoPago</button><button class="pay-opt ${payMethod === 'tarjeta' ? 'on' : ''}" data-pay="tarjeta">Tarjeta</button></div><button class="btn charge-btn" id="bSell">Cobrar</button><p class="pos-note">${navigator.onLine ? 'La venta se sube sola.' : 'Sin internet: queda guardada en este equipo.'}</p></div></aside>
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
    box.innerHTML = items.length ? `<div class="cart-lines">${items.map((i) => `<div class="cart-line"><div class="cart-line-name"><b>${esc(i.name)}</b><small>${fmt(i.price)} c/u</small></div><div class="cart-qty"><button data-dec="${i.product_id}" aria-label="Quitar uno">−</button><b>${i.qty}</b><button data-inc="${i.product_id}" aria-label="Agregar uno">+</button></div><strong>${fmt(i.price * i.qty)}</strong></div>`).join('')}</div><div class="cart-total"><span>Total</span><strong>${fmt(total)}</strong></div>` : '<div class="empty-cart"><b>Venta vacía</b><p class="mut">Agregá un producto para empezar.</p></div>';
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
      navigate();
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
    document.querySelectorAll('#pg .prod-row').forEach((el) => {
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
