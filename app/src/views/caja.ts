import { db } from '../lib/localdb';
import { getCashDay, openCashDay, closeCashDay, salesHistoryCloud } from '../lib/store';
import { app, esc, toast, fmt, confirmActionPassword } from '../ui';
import { shell, bindCommon, navigate } from '../chrome';
import { requireUser, loadOrgs } from '../session';

// ---------- Caja diaria ----------
export async function vCaja() {
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
    await openCashDay(org, amount); toast('Caja abierta'); navigate();
  });
  (document.getElementById('bCloseCash') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    if (!canManageCash || !await confirmActionPassword((user as any)?.email ?? '')) return;
    const amount = Number((document.getElementById('closeAmount') as HTMLInputElement).value || 0);
    const note = (document.getElementById('cashNote') as HTMLInputElement).value.trim();
    await closeCashDay(org, cash!.id, amount, expected, note); toast('Caja cerrada'); navigate();
  });
}
