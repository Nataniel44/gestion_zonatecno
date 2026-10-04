import { TICKET_STATUSES, pullTickets, createTicket, updateTicketStatus } from '../lib/store';
import { app, esc, toast, fmt } from '../ui';
import { shell, bindCommon, navigate } from '../chrome';
import { requireUser, loadOrgs } from '../session';

// ---------- Tickets de taller ----------
export async function vTickets() {
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
    toast('Ticket creado'); navigate();
  };
  document.querySelectorAll('[data-ticket-status]').forEach((el) => (el as HTMLSelectElement).onchange = async (e) => {
    await updateTicketStatus(org, (e.target as HTMLSelectElement).dataset.ticketStatus!, (e.target as HTMLSelectElement).value as any);
    toast('Estado actualizado');
  });
}
