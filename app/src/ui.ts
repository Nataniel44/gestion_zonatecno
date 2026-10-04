import { db } from './lib/localdb';
import { verifyAccountPassword } from './lib/store';
import { isCloudConfigured } from './lib/pb';

export const app = document.getElementById('app')!;
export const fmt = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR');
export const getOrg = () => localStorage.getItem('zt_org') ?? '';
export const setOrg = (id: string) => localStorage.setItem('zt_org', id);
export const esc = (s: string) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const withTimeout = <T,>(promise: Promise<T>, ms = 12000): Promise<T> => Promise.race([
  promise,
  new Promise<T>((_, reject) => setTimeout(() => reject(new Error('La nube tardó demasiado. Sigo con los datos locales.')), ms))
]);

export function toast(msg: string) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// Reemplazo de confirm()/alert(): funciona en PWA, iOS y Android.
export function confirmModal(msg: string, okLabel = 'Confirmar', title = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ovl';
    ov.innerHTML = `<div class="card modal-card"><h2>${esc(title)}</h2><p class="mut">${esc(msg)}</p><div class="row" style="margin-top:.6rem"><button class="btn" id="cfOk">${esc(okLabel)}</button><button class="btn ghost" id="cfCancel">Cancelar</button></div></div>`;
    document.body.appendChild(ov);
    const done = (v: boolean) => { ov.remove(); resolve(v); };
    (document.getElementById('cfCancel') as HTMLButtonElement).onclick = () => done(false);
    (document.getElementById('cfOk') as HTMLButtonElement).onclick = () => done(true);
    ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
  });
}

export function infoModal(title: string, body: string) {
  const ov = document.createElement('div');
  ov.className = 'ovl';
  ov.innerHTML = `<div class="card modal-card"><h2>${esc(title)}</h2><p class="mut">${esc(body)}</p><div class="row" style="margin-top:.6rem"><button class="btn" id="ifOk">Entendido</button></div></div>`;
  document.body.appendChild(ov);
  (document.getElementById('ifOk') as HTMLButtonElement).onclick = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
}

export const getAccountType = () => (localStorage.getItem('zt_account_type') === 'empleado' ? 'empleado' : 'negocio');
export const setAccountType = (type: string) => localStorage.setItem('zt_account_type', type === 'empleado' ? 'empleado' : 'negocio');
export const myIdBlock = (user: any) => (user?.id ? `<div class="my-id"><small>Tu ID para que te inviten</small><code id="myId">${esc(user.id)}</code><button class="btn ghost small" id="bCopyId">Copiar</button></div>` : '');
export function bindMyIdCopy() {
  (document.getElementById('bCopyId') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    const id = (document.getElementById('myId') as HTMLElement | null)?.textContent ?? '';
    try { await navigator.clipboard.writeText(id); toast('ID copiado'); }
    catch { toast(id); }
  });
}

// Modal para elegir un producto del stock (reemplaza window.prompt).
export function pickProductFromStock(org: string): Promise<{ desc: string; qty: number; price: number } | null> {
  return new Promise((resolve) => {
    const done = (v: { desc: string; qty: number; price: number } | null) => { ov.remove(); resolve(v); };
    const ov = document.createElement('div');
    ov.className = 'ovl';
    ov.innerHTML = `<div class="card modal-card"><h2>Traer del stock</h2>
      <div class="field"><label>Buscar</label><input id="pkQ" placeholder="Escribí para filtrar…" /></div>
      <div class="rc-list" id="pkList" style="max-height:40dvh;overflow-y:auto"></div>
      <div class="row" style="margin-top:.6rem"><button class="btn ghost" id="pkCancel">Cancelar</button></div></div>`;
    document.body.appendChild(ov);
    const paint = (q: string) => {
      const ql = q.trim().toLowerCase();
      const run = async () => {
        const prods = (await db.products.where('org_id').equals(org).toArray())
          .filter((p) => !p.deleted && (!ql || `${p.name} ${p.barcode ?? ''}`.toLowerCase().includes(ql)))
          .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
        (document.getElementById('pkList') as HTMLElement).innerHTML = prods.map((p) => `
          <div class="rc-row" style="cursor:pointer" data-pk="${p.id}"><div><b>${esc(p.name)}</b><small>${fmt(p.price)} · Stock ${p.stock}</small></div></div>`).join('')
          || '<div class="empty-dashboard">Sin coincidencias.</div>';
        ov.querySelectorAll('[data-pk]').forEach((el) => (el as HTMLElement).onclick = async () => {
          const p = await db.products.get((el as HTMLElement).dataset.pk!);
          if (p) done({ desc: p.name, qty: 1, price: p.price });
        });
      };
      void run();
    };
    (document.getElementById('pkCancel') as HTMLButtonElement).onclick = () => done(null);
    ov.addEventListener('click', (e) => { if (e.target === ov) done(null); });
    (document.getElementById('pkQ') as HTMLInputElement).oninput = (e) => paint((e.target as HTMLInputElement).value);
    paint('');
  });
}

export function statusPills(syncMsg = '') {
  const net = navigator.onLine
    ? '<span class="pill ok"><span class="dot" style="background:#17c964"></span>online</span>'
    : '<span class="pill warn"><span class="dot" style="background:#f5a524"></span>offline — vende igual</span>';
  const cloud = isCloudConfigured()
    ? '<span class="pill ok">nube configurada</span>'
    : '<span class="pill warn">modo local · falta VITE_PB_URL</span>';
  return `${net}${cloud}${syncMsg ? `<span class="pill">${esc(syncMsg)}</span>` : ''}`;
}

export const OUT_ICON = '<svg class="out-ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';

export function confirmActionPassword(email: string, action = ''): Promise<boolean> {
  if (!navigator.onLine) return Promise.resolve(true);
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ovl';
    ov.innerHTML = `<div class="card modal-card">
      <h2>Confirmá tu identidad</h2>
      ${action ? `<p class="mut">Vas a <b>${esc(action)}</b>.</p>` : ''}
      <p class="mut">Escribí tu contraseña para continuar.</p>
      <div class="field"><label>Contraseña</label><input id="confirmPw" type="password" autocomplete="current-password" placeholder="Tu contraseña" /></div>
      <p id="confirmErr" class="auth-err" style="display:none"></p>
      <div class="row" style="margin-top:.6rem"><button class="btn" id="confirmOk">Continuar</button><button class="btn ghost" id="confirmCancel">Cancelar</button></div>
    </div>`;
    document.body.appendChild(ov);
    const finish = (ok: boolean) => { ov.remove(); resolve(ok); };
    const submit = async () => {
      const input = document.getElementById('confirmPw') as HTMLInputElement;
      const error = document.getElementById('confirmErr') as HTMLElement;
      if (!input.value) { error.style.display = 'block'; error.textContent = 'Escribí tu contraseña.'; return; }
      const ok = await verifyAccountPassword(email, input.value);
      if (!ok) { error.style.display = 'block'; error.textContent = 'Contraseña incorrecta.'; return; }
      finish(true);
    };
    (document.getElementById('confirmCancel') as HTMLButtonElement).onclick = () => finish(false);
    (document.getElementById('confirmOk') as HTMLButtonElement).onclick = () => { void submit(); };
    (document.getElementById('confirmPw') as HTMLInputElement).onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); void submit(); }
    };
    (document.getElementById('confirmPw') as HTMLInputElement).focus();
  });
}
