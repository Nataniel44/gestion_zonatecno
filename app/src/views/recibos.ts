import { db } from '../lib/localdb';
import { getBusinessProfile, saveBusinessProfile, listReceipts, createReceipt, deleteReceipt, receiptTotals, RECEIPT_TITLES, RECEIPT_STATUS } from '../lib/store';
import { app, esc, toast, fmt, pickProductFromStock, confirmModal } from '../ui';
import { shell, bindCommon, navigate } from '../chrome';
import { requireUser, loadOrgs } from '../session';
import { setBarcodeHandler } from '../scanner';

// ---------- Recibos universales (cualquier rubro, imprimible) ----------
export function printReceiptHTML(r: any): string {
  const date = new Date(r.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const rows = (r.items || []).map((i: any) => `<tr><td>${esc(i.desc)}<br/><small>${i.qty} x ${fmt(i.price)}</small></td><td style="text-align:right">${fmt(i.qty * i.price)}</td></tr>`).join('');
  return `<div class="rc-print">
    <div class="rc-head"><div class="rc-logo">${esc((r.biz_name || 'Mi negocio').charAt(0).toUpperCase())}</div>
      <div><h2>${esc(r.biz_name || 'Mi negocio')}</h2><p>${esc(r.biz_address || '')}${r.biz_phone ? ' · ' + esc(r.biz_phone) : ''}${r.biz_cuit ? '<br/>CUIT: ' + esc(r.biz_cuit) : ''}</p></div></div>
    <div class="rc-title"><b>${esc(r.title || 'Recibo')}</b><span>N° ${esc(r.number)}</span></div>
    <p class="rc-date">Fecha: ${date}${r.seller ? ' · Vendedor: ' + esc(r.seller) : ''}</p>
    <div class="rc-client"><b>Cliente:</b> ${esc(r.client_name)}${r.client_doc ? ' · DNI/CUIT: ' + esc(r.client_doc) : ''}${r.client_phone ? '<br/>Tel: ' + esc(r.client_phone) : ''}</div>
    ${r.device ? `<div class="rc-client"><b>Equipo:</b> ${esc(r.device)}${r.device_detail ? ' · ' + esc(r.device_detail) : ''}${r.problem ? '<br/><b>Falla:</b> ' + esc(r.problem) : ''}</div>` : ''}
    <table class="rc-table"><tbody>${rows}</tbody></table>
    <div class="rc-totals"><div><span>Subtotal</span><b>${fmt(r.subtotal)}</b></div>${r.discount ? `<div><span>Descuento</span><b>− ${fmt(r.discount)}</b></div>` : ''}<div class="rc-grand"><span>TOTAL</span><b>${fmt(r.total)}</b></div>
    <div><span>Paga con / Recibido</span><b>${fmt(r.received)}</b></div><div><span>Vuelto</span><b>${fmt(r.change)}</b></div></div>
    <p class="rc-meta">Pago: ${esc(r.pay_method)} · Estado: ${esc(r.status)}</p>
    ${r.notes ? `<p class="rc-notes"><b>Notas:</b> ${esc(r.notes)}</p>` : ''}
    ${r.warranty_text ? `<p class="rc-notes"><b>Garantía:</b> ${esc(r.warranty_text)}</p>` : ''}
    <p class="rc-foot">${esc(r.biz_footer || '')}</p>
    <div class="rc-sign"><div>Firma comercio</div><div>Firma cliente</div></div>
  </div>`;
}

export function doPrintReceipt(r: any) {
  // iframe oculto en vez de window.open: los navegadores móviles y las PWA
  // suelen bloquear las ventanas nuevas, pero permiten imprimir el iframe.
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0'; frame.style.bottom = '0';
  frame.style.width = '0'; frame.style.height = '0';
  frame.style.border = '0';
  frame.title = `Imprimir ${r.number}`;
  document.body.appendChild(frame);
  const doc = frame.contentDocument ?? frame.contentWindow?.document;
  if (!doc) { frame.remove(); toast('No pude abrir la impresión'); return; }
  const win = frame.contentWindow;
  win?.addEventListener('afterprint', () => frame.remove());
  setTimeout(() => frame.remove(), 60000); // seguridad por si afterprint no dispara
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>${esc(r.title)} ${esc(r.number)}</title><style>
    *{box-sizing:border-box} body{font-family:monospace,system-ui,sans-serif;margin:0;padding:12px;color:#111}
    .rc-print{max-width:300px;margin:0 auto} .rc-head{display:flex;gap:10px;align-items:center;border-bottom:2px dashed #111;padding-bottom:8px}
    .rc-logo{width:42px;height:42px;border-radius:10px;background:#111;color:#fff;display:grid;place-items:center;font-weight:900;font-size:1.3rem}
    h2{margin:0;font-size:1.05rem} p{margin:2px 0;font-size:.78rem} .rc-title{display:flex;justify-content:space-between;align-items:center;margin:8px 0;font-size:.9rem;border-bottom:1px dashed #111;padding-bottom:6px}
    .rc-date,.rc-meta{font-size:.75rem} .rc-client{font-size:.78rem;border:1px dashed #111;border-radius:8px;padding:6px;margin:6px 0}
    .rc-table{width:100%;border-collapse:collapse;font-size:.78rem;margin:6px 0} .rc-table td{border-bottom:1px dotted #999;padding:4px 0}
    .rc-totals{font-size:.8rem;margin-top:6px} .rc-totals>div{display:flex;justify-content:space-between;padding:2px 0}
    .rc-grand{font-size:1rem;font-weight:900;border-top:2px solid #111;border-bottom:2px solid #111;margin:4px 0;padding:4px 0 !important}
    .rc-notes{font-size:.72rem} .rc-foot{text-align:center;font-size:.72rem;margin-top:8px} .rc-sign{display:flex;justify-content:space-between;margin-top:26px;font-size:.7rem}
    .rc-sign div{border-top:1px solid #111;padding-top:4px;width:45%;text-align:center}
    @media print{body{padding:0}}</style></head><body>${printReceiptHTML(r)}<script>onload=()=>{setTimeout(()=>{print();},300)}<\/script></body></html>`);
  doc.close();
  // El foco va al iframe para que el diálogo de impresión salga del recibo.
  setTimeout(() => { try { win?.focus(); } catch { /* sin foco: igual imprime */ } }, 100);
}

export async function vRecibos() {
  setBarcodeHandler(null);
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError || !cur) { location.hash = '#/panel'; return; }
  const org = cur;
  const orgName = list.find((o) => o.id === org)?.name ?? 'Mi negocio';
  const profile = await getBusinessProfile(org, orgName);
  const receipts = await listReceipts(org);

  app.innerHTML = shell(`<div class="bento">
    <div class="card span8">
      <div class="row" style="justify-content:space-between"><div><h2>Recibos · cualquier rubro</h2><p class="mut">Emití un comprobante digital con el nombre de tu local e imprimilo. Sirve para tienda de celulares, taller, kiosco, peluquería, etc.</p></div><button class="btn small" id="bNewRc">+ Nuevo recibo</button></div>
      <div class="row" style="margin:.6rem 0"><input id="rcQ" placeholder="Buscar por cliente, número o equipo…" style="max-width:320px"/></div>
      <div class="rc-list" id="rcList">${receipts.map((r) => `
        <div class="rc-row" data-name="${esc(`${r.client_name} ${r.number} ${r.device} ${r.title}`.toLowerCase())}"><div><b>${esc(r.number)} · ${esc(r.title)}</b><small>${esc(r.client_name)} · ${fmt(r.total)} · ${new Date(r.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(r.status)}</small></div>
        <div class="row"><button class="btn ghost small" data-view="${r.id}">Ver / Imprimir</button><button class="btn ghost small" data-del-rc="${r.id}">Borrar</button></div></div>`).join('') || '<div class="empty-dashboard">🧷 Todavía no hay recibos. Creá el primero con + Nuevo recibo.</div>'}</div>
    </div>
    <div class="card span4">
      <h2>Datos de tu local</h2><p class="mut">Esto sale impreso grande en cada recibo.</p>
      <div class="field"><label>Nombre del local *</label><input id="bizName" value="${esc(profile.name)}" placeholder="Ej: ZonaTecno Celulares"/></div>
      <div class="grid2" style="margin-top:.5rem"><div class="field"><label>Teléfono / WhatsApp</label><input id="bizPhone" value="${esc(profile.phone)}" placeholder="3755 00-0000"/></div><div class="field"><label>CUIT (opcional)</label><input id="bizCuit" value="${esc(profile.cuit)}" placeholder="20-..."/></div></div>
      <div class="field" style="margin-top:.5rem"><label>Dirección</label><input id="bizAddr" value="${esc(profile.address)}" placeholder="Av. Libertador 123, San Vicente"/></div>
      <div class="grid2" style="margin-top:.5rem"><div class="field"><label>Prefijo</label><input id="bizPrefix" value="${esc(profile.prefix)}" maxlength="4"/></div><div class="field"><label>Próximo N°</label><input id="bizNext" type="number" min="1" value="${profile.next_number}"/></div></div>
      <div class="field" style="margin-top:.5rem"><label>Pie del recibo</label><input id="bizFooter" value="${esc(profile.footer)}"/></div>
      <div class="field" style="margin-top:.5rem"><label>Garantía por defecto</label><input id="bizWarranty" value="${esc(profile.warranty_text)}"/></div>
      <div class="row" style="margin-top:.6rem"><button class="btn small" id="bSaveBiz">Guardar datos</button></div>
      <p class="mut" style="margin-top:.6rem">Próximo comprobante: <b>${esc(profile.prefix)}-${String(profile.next_number).padStart(6, '0')}</b></p>
    </div>
    <div class="card span12" id="rcEditor" style="display:none">
      <h2 id="rcEdTitle">Nuevo recibo</h2>
      <div class="grid2">
        <div class="field"><label>Tipo de comprobante</label><select id="rcTitle">${RECEIPT_TITLES.map((t) => `<option>${t}</option>`).join('')}</select></div>
        <div class="grid2"><div class="field"><label>Medio de pago</label><select id="rcPay"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="mercadopago">MercadoPago</option><option value="tarjeta">Tarjeta</option><option value="cuenta corriente">Cuenta corriente</option></select></div>
        <div class="field"><label>Estado</label><select id="rcStatus">${RECEIPT_STATUS.map((s) => `<option value="${s}">${s}</option>`).join('')}</select></div></div>
      </div>
      <div class="grid2" style="margin-top:.6rem">
        <div class="field"><label>Cliente *</label><input id="rcClient" placeholder="Nombre y apellido"/></div>
        <div class="grid2"><div class="field"><label>Teléfono</label><input id="rcPhone" placeholder="3755 00-0000"/></div><div class="field"><label>DNI / CUIT</label><input id="rcDoc" placeholder="Opcional"/></div></div>
      </div>
      <details class="rc-details"><summary>📱 Datos del equipo (opcional · taller / celulares)</summary>
        <div class="grid2" style="margin-top:.5rem"><div class="field"><label>Equipo</label><input id="rcDevice" placeholder="Ej: Samsung A12 / iPhone 11"/></div><div class="field"><label>IMEI / Serie / Color</label><input id="rcDeviceDetail" placeholder="Ej: IMEI 35000... · Negro"/></div></div>
        <div class="field" style="margin-top:.5rem"><label>Falla / Servicio</label><input id="rcProblem" placeholder="Ej: no enciende, cambio de pantalla"/></div>
      </details>
      <h3 style="margin-top:.8rem">Conceptos (cualquier rubro)</h3>
      <div id="rcItems"></div>
      <div class="row" style="margin:.4rem 0"><button class="btn ghost small" id="bAddItem">+ Agregar línea</button><button class="btn ghost small" id="bFromStock">Traer del stock</button></div>
      <div class="grid2"><div class="field"><label>Descuento ($)</label><input id="rcDiscount" type="number" min="0" value="0"/></div><div class="field"><label>Recibido ($)</label><input id="rcReceived" type="number" min="0" value="0"/></div></div>
      <div class="field" style="margin-top:.5rem"><label>Notas (opcional)</label><input id="rcNotes" placeholder="Ej: se entrega en 48hs, señó $10.000"/></div>
      <div class="field" style="margin-top:.5rem"><label>Garantía de este recibo</label><input id="rcWarranty" value="${esc(profile.warranty_text)}"/></div>
      <div class="rc-total-line"><span>Total</span><strong id="rcTotalPreview">$0</strong></div>
      <div class="row" style="margin-top:.6rem"><button class="btn" id="bSaveRc">Guardar e imprimir</button><button class="btn ghost" id="bCancelRc">Cancelar</button></div>
    </div>
    <div class="card span12" id="rcView" style="display:none"></div>
  </div>`, 'recibos', { orgs: list, org, email: (user as any)?.email });
  bindCommon(list, org);

  (document.getElementById('bSaveBiz') as HTMLButtonElement).onclick = async () => {
    const name = (document.getElementById('bizName') as HTMLInputElement).value.trim();
    if (name.length < 2) { toast('Poné el nombre de tu local'); return; }
    profile.name = name;
    profile.phone = (document.getElementById('bizPhone') as HTMLInputElement).value.trim();
    profile.cuit = (document.getElementById('bizCuit') as HTMLInputElement).value.trim();
    profile.address = (document.getElementById('bizAddr') as HTMLInputElement).value.trim();
    profile.prefix = ((document.getElementById('bizPrefix') as HTMLInputElement).value.trim() || 'R').slice(0, 4);
    profile.next_number = Math.max(1, Number((document.getElementById('bizNext') as HTMLInputElement).value || 1));
    profile.footer = (document.getElementById('bizFooter') as HTMLInputElement).value.trim();
    profile.warranty_text = (document.getElementById('bizWarranty') as HTMLInputElement).value.trim();
    await saveBusinessProfile(profile);
    toast('Datos del local guardados ✓');
    navigate();
  };

  (document.getElementById('rcQ') as HTMLInputElement).oninput = (e) => {
    const v = (e.target as HTMLInputElement).value.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('#rcList .rc-row').forEach((row) => {
      row.style.display = !v || (row.dataset.name ?? '').includes(v) ? '' : 'none';
    });
  };

  const itemsEl = document.getElementById('rcItems') as HTMLElement;
  type Row = { desc: string; qty: number; price: number };
  let rows: Row[] = [{ desc: '', qty: 1, price: 0 }];
  const drawRows = () => {
    itemsEl.innerHTML = rows.map((r, i) => `<div class="rc-item-row">
      <input data-desc="${i}" placeholder="Descripción · Ej: Cambio de pantalla Samsung A12" value="${esc(r.desc)}"/>
      <input data-qty="${i}" type="number" min="1" value="${r.qty}" title="Cantidad"/>
      <input data-price="${i}" type="number" min="0" value="${r.price}" title="Precio"/>
      <button class="btn ghost small" data-rm="${i}">✕</button></div>`).join('');
    itemsEl.querySelectorAll('[data-desc]').forEach((el) => (el as HTMLInputElement).oninput = (e) => { rows[Number((e.target as HTMLInputElement).dataset.desc)].desc = (e.target as HTMLInputElement).value; preview(); });
    itemsEl.querySelectorAll('[data-qty]').forEach((el) => (el as HTMLInputElement).oninput = (e) => { rows[Number((e.target as HTMLInputElement).dataset.qty)].qty = Number((e.target as HTMLInputElement).value || 0); preview(); });
    itemsEl.querySelectorAll('[data-price]').forEach((el) => (el as HTMLInputElement).oninput = (e) => { rows[Number((e.target as HTMLInputElement).dataset.price)].price = Number((e.target as HTMLInputElement).value || 0); preview(); });
    itemsEl.querySelectorAll('[data-rm]').forEach((b) => (b as HTMLButtonElement).onclick = () => { if (rows.length > 1) rows.splice(Number((b as HTMLButtonElement).dataset.rm), 1); drawRows(); preview(); });
  };
  const preview = () => {
    const d = Number((document.getElementById('rcDiscount') as HTMLInputElement)?.value || 0);
    const { total } = receiptTotals(rows, d);
    (document.getElementById('rcTotalPreview') as HTMLElement).textContent = fmt(total);
    const rec = document.getElementById('rcReceived') as HTMLInputElement;
    if (rec && !rec.dataset.touched) rec.value = String(total);
  };
  (document.getElementById('rcDiscount') as HTMLInputElement).oninput = preview;
  (document.getElementById('rcReceived') as HTMLInputElement).oninput = (e) => { (e.target as HTMLInputElement).dataset.touched = '1'; };
  drawRows(); preview();

  (document.getElementById('bAddItem') as HTMLButtonElement).onclick = () => { rows.push({ desc: '', qty: 1, price: 0 }); drawRows(); };
  (document.getElementById('bFromStock') as HTMLButtonElement).onclick = async () => {
    const picked = await pickProductFromStock(org);
    if (picked) { rows.push(picked); drawRows(); preview(); }
  };
  (document.getElementById('bNewRc') as HTMLButtonElement).onclick = () => {
    (document.getElementById('rcEditor') as HTMLElement).style.display = 'block';
    (document.getElementById('rcView') as HTMLElement).style.display = 'none';
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };
  (document.getElementById('bCancelRc') as HTMLButtonElement).onclick = () => ((document.getElementById('rcEditor') as HTMLElement).style.display = 'none');

  (document.getElementById('bSaveRc') as HTMLButtonElement).onclick = async () => {
    const btn = document.getElementById('bSaveRc') as HTMLButtonElement;
    btn.disabled = true;
    try {
      const fresh = await getBusinessProfile(org, orgName);
      const r = await createReceipt(org, {
        title: (document.getElementById('rcTitle') as HTMLSelectElement).value,
        client_name: (document.getElementById('rcClient') as HTMLInputElement).value,
        client_phone: (document.getElementById('rcPhone') as HTMLInputElement).value,
        client_doc: (document.getElementById('rcDoc') as HTMLInputElement).value,
        device: (document.getElementById('rcDevice') as HTMLInputElement).value,
        device_detail: (document.getElementById('rcDeviceDetail') as HTMLInputElement).value,
        problem: (document.getElementById('rcProblem') as HTMLInputElement).value,
        items: rows.map((x) => ({ desc: x.desc.trim(), qty: Math.max(1, Math.round(Number(x.qty) || 1)), price: Number(x.price) || 0 })),
        discount: Number((document.getElementById('rcDiscount') as HTMLInputElement).value || 0),
        received: Number((document.getElementById('rcReceived') as HTMLInputElement).value || 0),
        pay_method: (document.getElementById('rcPay') as HTMLSelectElement).value,
        status: (document.getElementById('rcStatus') as HTMLSelectElement).value as any,
        notes: (document.getElementById('rcNotes') as HTMLInputElement).value,
        warranty_text: (document.getElementById('rcWarranty') as HTMLInputElement).value
      }, fresh, (user as any)?.email ?? '');
      toast(`Recibo ${r.number} guardado ✓`);
      doPrintReceipt(r);
      navigate();
    } catch (e: any) { toast(e?.message ?? 'No pude guardar el recibo'); btn.disabled = false; }
  };

  document.querySelectorAll('[data-view]').forEach((b) => (b as HTMLButtonElement).onclick = async () => {
    const r = receipts.find((x) => x.id === (b as HTMLButtonElement).dataset.view);
    if (!r) return;
    const box = document.getElementById('rcView') as HTMLElement;
    box.style.display = 'block';
    box.innerHTML = `<div class="row" style="justify-content:space-between"><h2>${esc(r.title)} ${esc(r.number)}</h2><div class="row"><button class="btn small" id="rcPrint">🖨 Imprimir</button><button class="btn ghost small" id="rcWA">WhatsApp</button><button class="btn ghost small" id="rcClose">Cerrar</button></div></div>${printReceiptHTML(r)}`;
    (document.getElementById('rcClose') as HTMLButtonElement).onclick = () => (box.style.display = 'none');
    (document.getElementById('rcPrint') as HTMLButtonElement).onclick = () => doPrintReceipt(r);
    (document.getElementById('rcWA') as HTMLButtonElement).onclick = () => {
      const msg = `${r.title} ${r.number} · ${r.biz_name}%0ATotal: ${fmt(r.total)} (${r.status})%0ACliente: ${r.client_name}%0AGracias por su compra!`;
      window.open(`https://wa.me/${(r.client_phone || '').replace(/\D/g, '')}?text=${msg}`, '_blank');
    };
    box.scrollIntoView({ behavior: 'smooth' });
  });
  document.querySelectorAll('[data-del-rc]').forEach((b) => (b as HTMLButtonElement).onclick = async () => {
    if (!await confirmModal('¿Borrar este recibo de este equipo?', 'Borrar', 'Borrar recibo')) return;
    await deleteReceipt((b as HTMLButtonElement).dataset.delRc!);
    toast('Recibo borrado'); navigate();
  });
}
