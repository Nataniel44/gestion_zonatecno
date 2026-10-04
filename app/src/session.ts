import { db } from './lib/localdb';
import { hashPin, setLocalSession, getLocalSession, getUser, myOrgs } from './lib/store';
import { isCloudConfigured } from './lib/pb';
import { getOrg, setOrg, toast, esc } from './ui';

// El PIN se configura desde el panel; no se pide en cada inicio.
export function promptPin(uid: string, email: string, org: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ovl';
    ov.innerHTML = `<div class="card modal-card">
      <h2>Abrí tu caja sin internet</h2>
      <p class="mut">Creá un PIN de 6 dígitos para este equipo. Si se corta la luz o el wifi, vendés igual.</p>
      <div class="field"><label>PIN (6 números)</label><input id="newPin" inputmode="numeric" maxlength="12" placeholder="••••" /></div>
      <div class="row" style="margin-top:.6rem"><button class="btn" id="pinSave">Guardar PIN</button><button class="btn ghost" id="pinLater">Después</button></div>
    </div>`;
    document.body.appendChild(ov);
    const done = (v: boolean) => { ov.remove(); resolve(v); };
    (document.getElementById('pinLater') as HTMLButtonElement).onclick = () => done(false);
    (document.getElementById('pinSave') as HTMLButtonElement).onclick = async () => {
      const code = ((document.getElementById('newPin') as HTMLInputElement).value || '').replace(/\D/g, '');
      if (code.length < 6) { toast('El PIN necesita 6 números como mínimo'); return; }
      await db.pins.put({ userId: uid, email, org_id: org, pinHash: await hashPin(email, code), updatedAt: Date.now() });
      setLocalSession({ uid, email, org });
      toast('PIN listo: ya podés vender sin internet');
      done(true);
    };
  });
}

export async function requireUser() {
  // Modo local explícito: permite seguir vendiendo aunque la nube esté caída.
  if (sessionStorage.getItem('zt_force_local')) {
    const local = getLocalSession();
    if (local) return { id: local.uid, email: local.email };
  }
  // Offline: vale la sesión local con PIN (la caja no se frena nunca)
  if (!navigator.onLine) {
    const s = getLocalSession();
    if (s) return { id: s.uid, email: s.email };
    if (!isCloudConfigured()) return { id: 'local', email: 'modo local' } as any;
    location.hash = '#/login'; throw new Error('login');
  }
  if (!isCloudConfigured()) return { id: 'local', email: 'modo local' } as any;
  const u = await getUser();
  if (!u) { location.hash = '#/login'; throw new Error('login'); }
  return u;
}

export async function loadOrgs(): Promise<{ list: { id: string; name: string; role?: string }[]; cur: string; cloudError: string }> {
  // Sin internet (o modo local forzado): trabajo local directo, sin pedir nada a la nube.
  // Se usa el negocio de la sesión con PIN (no demo-local) para ver su stock real.
  if (!navigator.onLine || !isCloudConfigured() || sessionStorage.getItem('zt_force_local')) {
    const s = getLocalSession();
    const demo = s?.org || getOrg() || 'demo-local';
    setOrg(demo);
    return { list: [{ id: demo, name: s ? 'Mi negocio' : 'Mi negocio (local)', role: '' }], cur: demo, cloudError: '' };
  }
  try {
    const ms = await myOrgs();
    const list = ms.map((m) => ({ id: m.org_id, name: (m.orgs as any)?.name ?? m.org_id, role: m.role }));
    if (!list.length) return { list, cur: '', cloudError: '' };
    let cur = getOrg();
    if (!cur || !list.find((o) => o.id === cur)) { cur = list[0].id; setOrg(cur); }
    return { list, cur, cloudError: '' };
  } catch (e: any) {
    console.error('[ZT loadOrgs]', e);
    const st = e?.status ?? e?.response?.status;
    const msg = e?.response?.data?.message ?? e?.message ?? 'Error de nube';
    const networkFailure = !st || /failed to fetch|network|timeout|load failed/i.test(String(msg));
    if (networkFailure) {
      // El equipo tiene internet pero PocketBase no responde: seguimos local
      // para no dejar al vendedor sin caja.
      const s = getLocalSession();
      const demo = s?.org || getOrg() || 'demo-local';
      setOrg(demo);
      return { list: [{ id: demo, name: s ? 'Mi negocio' : 'Mi negocio (local)', role: '' }], cur: demo, cloudError: '' };
    }
    return { list: [], cur: '', cloudError: (st ? '(http ' + st + ') ' : '') + msg + '. ¿Están las 8 tablas en /_/ → Collections?' };
  }
}
