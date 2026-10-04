import { db } from '../lib/localdb';
import { signIn, signUp, getUser, setLocalSession, getLocalSession, hashPin, requestPasswordReset } from '../lib/store';
import { isCloudConfigured } from '../lib/pb';
import { app, esc, toast, getAccountType, setAccountType, setOrg, getOrg } from '../ui';
import { bindCommon, navigate } from '../chrome';

// ---------- Login ----------
export function pbErr(e: any): string {
  const d = e?.response?.data ?? e?.data;
  if (d?.data && typeof d.data === 'object') {
    const parts = Object.entries(d.data).map(([f, v]: any) => `${f}: ${v?.message ?? 'inválido'}`);
    if (parts.length) return parts.join(' · ');
  }
  return d?.message || e?.message || String(e);
}

export async function vLogin(mode: 'in' | 'up' = 'in') {
  if (isCloudConfigured()) {
    try { const u = await getUser(); if (u && navigator.onLine) { location.hash = '#/panel'; return; } } catch {}
  }
  // ---- Sin internet: entrar con PIN (la caja sigue) ----
  if (!navigator.onLine && isCloudConfigured()) {
    const pins = await db.pins.toArray();
    app.innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <div class="auth-logo"><i>Z</i><div><b>ZT Gestión</b><small>Modo offline</small></div></div>
      <p class="auth-sub">Sin internet igual se vende. Todo se sube solo al volver la red.</p>
      ${pins.length ? `
        <div style="display:flex;flex-direction:column;gap:.7rem">
          <div class="field"><label>Vendedor</label><select id="pinUser">${pins.map((p) => `<option value="${p.userId}">${esc(p.email)}</option>`).join('')}</select></div>
          <div class="field"><label>PIN de 6 dígitos</label><input id="pinCode" type="password" inputmode="numeric" maxlength="12" placeholder="••••" /></div>
          <div id="loginErr" class="auth-err"></div>
          <button class="btn auth-go" id="bPin">Abrir caja →</button>
        </div>` : `
        <div class="auth-err" style="display:block">Todavía nadie entró en este equipo con internet. La primera vez necesitás conexión; después abrís con PIN sin red.</div>`}
      <p class="auth-foot">Las ventas quedan guardadas en este equipo</p>
    </div></div>`;
    const go = document.getElementById('bPin') as HTMLButtonElement | null;
    if (go) go.onclick = async () => {
      const uid = (document.getElementById('pinUser') as HTMLSelectElement).value;
      const code = (document.getElementById('pinCode') as HTMLInputElement).value;
      const rec = await db.pins.get(uid);
      const box = document.getElementById('loginErr') as HTMLElement;
      if (!rec || (await hashPin(rec.email, code)) !== rec.pinHash) {
        box.style.display = 'block'; box.textContent = 'PIN incorrecto, probá de nuevo.';
        return;
      }
      setLocalSession({ uid: rec.userId, email: rec.email, org: rec.org_id });
      setOrg(rec.org_id);
      toast('Caja abierta offline');
      location.hash = '#/panel'; navigate();
    };
    return;
  }
  const canContinueLocal = !!getLocalSession();
  app.innerHTML = `<div class="auth-wrap"><div class="auth-card">
    <div class="auth-logo"><i>Z</i><div><b>ZT Gestión</b><small>San Vicente · Misiones</small></div></div>
    <p class="auth-sub">${mode === 'in' ? 'Entrá a tu negocio. Tus ventas te esperan.' : 'Creá tu cuenta gratis y empezá a vender hoy.'}</p>
    ${isCloudConfigured() ? `
      <div class="seg">
        <a href="#/login" class="${mode === 'in' ? 'on' : ''}">Entrar</a>
        <a href="#/registro" class="${mode === 'up' ? 'on' : ''}">Crear cuenta</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:.7rem">
        ${mode === 'up' ? `<div class="field"><label>Tipo de cuenta</label><select id="accountType"><option value="negocio" ${getAccountType() === 'negocio' ? 'selected' : ''}>Negocio — quiero vender y gestionar mi stock</option><option value="empleado" ${getAccountType() === 'empleado' ? 'selected' : ''}>Empleado — espero que me agreguen a un negocio</option></select></div>` : ''}
        <div class="field"><label>Email</label><input id="em" placeholder="vos@tunegocio.com" autocomplete="username" /></div>
        ${mode === 'up' ? '<div class="field"><label>WhatsApp</label><input id="ph" placeholder="3755 12-3456" autocomplete="tel" inputmode="tel" /></div>' : ''}
        <div class="field"><label>Contraseña</label>
          <div class="row" style="flex-wrap:nowrap"><input id="pw" type="password" placeholder="8 caracteres como mínimo" autocomplete="current-password" style="flex:1" /><button class="btn ghost small" id="bEye" title="Ver contraseña">👁</button></div>
        </div>
        ${mode === 'up' ? '<div class="field"><label>Repetir contraseña</label><input id="pw2" type="password" placeholder="Escribila igual" autocomplete="new-password" /></div>' : ''}
        <div id="loginErr" class="auth-err"></div>
        ${mode === 'in'
          ? '<button class="btn auth-go" id="bGo">Entrar a mi negocio →</button><button class="btn ghost small" id="bForgot">¿Olvidaste tu contraseña?</button>'
          : '<button class="btn auth-go" id="bGo">Crear mi cuenta gratis</button>'}
      </div>
      <p class="auth-foot">Funciona sin internet · Tus datos son solo de tu negocio</p>
      ${canContinueLocal && mode === 'in' ? '<div class="row" style="margin-top:.7rem"><button class="btn ghost" id="bOfflineContinue">Continuar sin conexión</button></div>' : ''}` : `
      <p>Sin nube: creá <b>app/.env</b> con <b>VITE_PB_URL=https://app.zonatecno.uno</b> y recargá. Mientras tanto:</p>
      <div class="row"><a class="btn" href="#/panel">Usar en modo local offline</a></div>`}
  </div></div>`;
  if (!isCloudConfigured()) return;
  (document.getElementById('bOfflineContinue') as HTMLButtonElement | null)?.addEventListener('click', () => {
    sessionStorage.setItem('zt_force_local', '1');
    location.hash = '#/panel';
    navigate();
  });
  const showErr = (m: string) => {
    const box = document.getElementById('loginErr') as HTMLElement;
    box.style.display = 'block'; box.textContent = m;
  };
  const busy = (b: boolean, label: string) => {
    const go = document.getElementById('bGo') as HTMLButtonElement;
    go.disabled = b; go.textContent = b ? 'Un momento…' : label;
  };
  (document.getElementById('bEye') as HTMLButtonElement).onclick = () => {
    for (const id of ['pw', 'pw2']) {
      const i = document.getElementById(id) as HTMLInputElement | null;
      if (i) i.type = i.type === 'password' ? 'text' : 'password';
    }
  };
  (document.getElementById('bForgot') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    const em = ((document.getElementById('em') as HTMLInputElement | null)?.value ?? '').trim();
    if (!em.includes('@')) { showErr('Escribí tu email arriba y tocá de nuevo ¿Olvidaste tu contraseña?'); return; }
    if (!navigator.onLine) { showErr('Sin internet no puedo enviar el correo de recupero.'); return; }
    try {
      await requestPasswordReset(em);
      toast('Si esa cuenta existe, te enviamos el correo para cambiar la clave');
    } catch { showErr('No pude enviar el correo. Revisá el email e intentá de nuevo.'); }
  });
  (document.getElementById('bGo') as HTMLButtonElement).onclick = async () => {
    const em = (document.getElementById('em') as HTMLInputElement).value.trim();
    const pw = (document.getElementById('pw') as HTMLInputElement).value;
    if (!em.includes('@')) { showErr('Revisá el email, le falta el @'); return; }
    if (pw.length < 8) { showErr('La contraseña necesita 8 caracteres como mínimo'); return; }
    if (!navigator.onLine) { showErr('Sin internet no puedo verificar tu cuenta. Conectate una vez para entrar; después seguís trabajando offline.'); return; }
    const accountType = document.getElementById('accountType') as HTMLSelectElement | null;
    if (accountType) setAccountType(accountType.value);
    if (mode === 'in') {
      busy(true, '');
      try {
        await signIn(em, pw);
        const me: any = await getUser().catch(() => null);
        if (me) {
          setLocalSession({ uid: me.id, email: me.email ?? em, org: getOrg() });
          sessionStorage.removeItem('zt_force_local');
        }
        toast('¡Hola de nuevo!');
        location.hash = '#/panel'; navigate();
      } catch (e: any) {
        busy(false, 'Entrar a mi negocio →');
        const st = e?.status ?? e?.response?.status;
        showErr(st === 400
          ? 'Ese email o contraseña no coinciden. Fijate bien o andá a "Crear cuenta" si es tu primera vez.'
          : 'No pude entrar (' + (st ?? 'red') + '): ' + pbErr(e));
      }
      return;
    }
    const ph = (document.getElementById('ph') as HTMLInputElement).value.trim();
    const pw2 = (document.getElementById('pw2') as HTMLInputElement).value;
    const digits = ph.replace(/\D/g, '');
    if (digits.length < 8) { showErr('Poné tu WhatsApp para avisarte de tus ventas'); return; }
    if (pw !== pw2) { showErr('Las contraseñas no coinciden, escribilas igual'); return; }
    busy(true, '');
    try {
      await signUp(em, pw, ph);
      const me: any = await getUser().catch(() => null);
      if (me) {
        setLocalSession({ uid: me.id, email: me.email ?? em, org: getOrg() });
        sessionStorage.removeItem('zt_force_local');
      }
      toast('Cuenta lista, entrando…');
      location.hash = '#/panel'; navigate();
    } catch (e: any) {
      busy(false, 'Crear mi cuenta gratis');
      const st = e?.status ?? e?.response?.status;
      showErr(st === 400
        ? 'No pude crearla: ' + pbErr(e) + ' (¿ese email ya tiene cuenta? Probá Entrar.)'
        : 'No pude crearla (' + (st ?? 'red') + '): ' + pbErr(e));
    }
  };
}
