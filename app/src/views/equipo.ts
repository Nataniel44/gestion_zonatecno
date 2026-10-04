import { db } from '../lib/localdb';
import { listMembers, createOrg, addMemberById, updateMemberRole, removeMember, hashPin, setLocalSession, getLocalSession } from '../lib/store';
import { isCloudConfigured } from '../lib/pb';
import { app, esc, toast, getAccountType, myIdBlock, bindMyIdCopy, confirmActionPassword, confirmModal, getOrg, setOrg } from '../ui';
import { shell, bindCommon, navigate } from '../chrome';
import { requireUser, loadOrgs } from '../session';

// ---------- Equipo ----------
export async function vEquipo() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError) {
    app.innerHTML = shell(`<div class="bento"><div class="card span12"><h2>Equipo no disponible</h2><p class="pill bad">${esc(cloudError)}</p><p class="mut">Revisá la nube o seguí usando el modo local desde el login.</p><div class="row"><a class="btn small" href="#/panel">Ir al panel</a></div></div></div>`, 'equipo', { orgs: list, org: cur, email: (user as any)?.email });
    bindCommon(list, cur);
    return;
  }
  const currentName = list.find((o) => o.id === cur)?.name ?? (cur ? 'tu negocio' : '');
  const teamRole = list.find((o) => o.id === cur)?.role ?? '';
  const canManageTeam = teamRole === 'dueno';
  let teamAuthUntil = 0;
  const ensureTeamAuth = async () => {
    if (!canManageTeam) { toast('Solo el dueño puede administrar el equipo'); return false; }
    if (Date.now() < teamAuthUntil) return true;
    const ok = await confirmActionPassword((user as any)?.email ?? '');
    if (ok) teamAuthUntil = Date.now() + 5 * 60 * 1000;
    return ok;
  };
  const members = cur && isCloudConfigured() ? await listMembers(cur).catch(() => []) : [];
  const roleLabel = (role: string) => role === 'dueno' ? 'Dueño' : role === 'admin' ? 'Administrador' : 'Vendedor';
  const teamList = members.length
    ? `<div class="team-list">${members.map((m) => `<div class="team-row"><i class="team-avatar">${esc((m.name || '?').charAt(0).toUpperCase())}</i><div><b>${esc(m.name)}</b><small>${esc(m.email || m.id)}</small></div><span class="role-tag ${m.role === 'vendedor' ? 'seller' : 'admin'}">${roleLabel(m.role)}</span>${canManageTeam && m.role !== 'dueno' ? `<div class="team-manage row"><select data-mrole="${m.id}" title="Cambiar permiso" style="max-width:170px"><option value="vendedor" ${m.role === 'vendedor' ? 'selected' : ''}>Vendedor</option><option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Administrador</option></select><button class="btn ghost small" data-mrm="${m.id}">Quitar</button></div>` : ''}</div>`).join('')}</div>`
    : '<p class="mut">Todavía no hay personas cargadas en este negocio.</p>';
  const teamContent = !cur
    ? (getAccountType() === 'empleado'
      ? `<p class="mut">Tu cuenta está esperando que un dueño te agregue a un negocio.</p>${myIdBlock(user)}<p class="hint">Mandá este ID al dueño. Él lo pega en Equipo para agregarte.</p>`
      : '<p class="mut">Primero creá un negocio. Después vas a poder invitar vendedores y administradores.</p><a class="btn small" href="#/panel">Ir al panel</a>')
    : !isCloudConfigured()
      ? '<p class="mut">Estás en modo local. El equipo multiusuario necesita la nube configurada.</p>'
      : `<p class="mut">Negocio: <b>${esc(currentName)}</b> · Sesión: ${esc((user as any)?.email ?? '')}</p>
        ${myIdBlock(user)}
        <ol class="team-steps">
          <li><b>1.</b> Pedile al vendedor que elija <b>Empleado</b> al crear su cuenta.</li>
          <li><b>2.</b> Que te copie su ID desde <b>Equipo → Mi ID</b>.</li>
          <li><b>3.</b> Pegalo acá y elegí qué puede hacer.</li>
        </ol>
        <div id="mManageTools"><div class="field"><label for="mId">ID del usuario</label><input id="mId" autocomplete="off" placeholder="Ej: 8fj2k1abcde" /><small class="hint">No es el email: es el identificador que aparece en la cuenta del vendedor.</small></div>
        <div class="grid2"><div class="field"><label for="mName">Nombre (opcional)</label><input id="mName" placeholder="Ej: Ana" /></div><div class="field"><label for="mEmail">Email (opcional)</label><input id="mEmail" type="email" placeholder="ana@correo.com" /></div></div>
        <div class="field"><label for="mRole">Permiso</label><select id="mRole"><option value="vendedor">Vendedor — puede vender y consultar stock</option><option value="admin">Administrador — puede administrar stock y ventas</option></select></div>
        <div class="row" style="margin-top:.6rem"><button class="btn small" id="bAdd">Agregar al equipo</button></div>
        <p class="mut">Por seguridad, solo el dueño del negocio puede agregar o quitar personas.</p></div>
        <p class="mut" id="teamLocked" style="display:${canManageTeam ? 'none' : 'block'}">Solo el dueño puede invitar o quitar personas del equipo.</p>
        <h3 class="team-subtitle">Personas con acceso</h3>${teamList}`;

  app.innerHTML = shell(`<div class="bento">
    <div class="card span6"><h2>Nuevo negocio</h2><p class="mut">Cada negocio tiene su propio stock, ventas y equipo.</p>
      <div class="field"><label for="orgName">Nombre del negocio</label><div class="row"><input id="orgName" placeholder="Ej: Kiosco El Centro" style="max-width:280px"/><button class="btn small" id="bOrg">Crear negocio</button></div></div>
    </div>
    <div class="card span6"><h2>Equipo</h2>${teamContent}</div>
    <div class="card span12"><h2>Abrir la caja sin internet</h2>
      <p class="mut" id="pinState">Reviso este equipo…</p>
      <div class="field"><label for="pinNew">PIN de este vendedor</label><div class="row"><input id="pinNew" inputmode="numeric" maxlength="12" placeholder="6 números" style="max-width:220px"/><button class="btn small" id="bPinSave">Guardar o cambiar PIN</button></div><small class="hint">El PIN queda guardado solamente en este dispositivo. Sirve para vender cuando se corta internet.</small></div>
    </div>`, 'equipo', { orgs: list, org: cur, email: (user as any)?.email });
  bindCommon(list, cur);
  if (!canManageTeam) (document.getElementById('mManageTools') as HTMLElement | null)?.setAttribute('hidden', 'true');
  bindMyIdCopy();
  // Estado del PIN en este equipo
  try {
    const uid = (user as any)?.id;
    const rec = uid ? await db.pins.get(uid) : undefined;
    (document.getElementById('pinState') as HTMLElement).textContent = rec
      ? '✓ Este equipo ya tiene PIN para ' + rec.email + '. Podés cambiarlo acá.'
      : 'Este equipo aún no tiene PIN. Guardá uno para vender sin internet.';
  } catch {}
  (document.getElementById('bPinSave') as HTMLButtonElement).onclick = async () => {
    const uid = (user as any)?.id;
    const email = (user as any)?.email;
    if (!uid || !email || uid === 'local') { toast('Entrá con tu cuenta primero'); return; }
    const orgForPin = cur || getOrg();
    if (!orgForPin) { toast('Elegí o creá un negocio antes de guardar el PIN'); return; }
    const code = ((document.getElementById('pinNew') as HTMLInputElement).value || '').replace(/\D/g, '');
    if (code.length < 6) { toast('El PIN necesita 6 números como mínimo'); return; }
    await db.pins.put({ userId: uid, email, org_id: orgForPin, pinHash: await hashPin(email, code), updatedAt: Date.now() });
    setLocalSession({ uid, email, org: orgForPin });
    toast('PIN guardado ✓');
    navigate();
  };
  const bO = document.getElementById('bOrg') as HTMLButtonElement | null;
  if (bO) bO.onclick = async () => {
    const name = (document.getElementById('orgName') as HTMLInputElement).value.trim();
    if (name.length < 2) { toast('Escribí un nombre de al menos 2 caracteres'); return; }
    bO.disabled = true;
    try {
      const o = await createOrg(name);
      setOrg(o.id); toast('Negocio creado'); navigate();
    } catch (e: any) { bO.disabled = false; toast(e.message); }
  };
  const bA = document.getElementById('bAdd') as HTMLButtonElement | null;
  if (bA) bA.onclick = async () => {
    if (!cur) { toast('Primero creá un negocio'); return; }
    if (!await ensureTeamAuth()) return;
    const memberId = (document.getElementById('mId') as HTMLInputElement).value.trim();
    if (memberId.length < 8) { toast('Revisá el ID del usuario'); return; }
    bA.disabled = true;
    try {
      await addMemberById(
        cur,
        memberId,
        (document.getElementById('mRole') as HTMLSelectElement).value,
        (document.getElementById('mEmail') as HTMLInputElement | null)?.value ?? '',
        (document.getElementById('mName') as HTMLInputElement | null)?.value ?? ''
      );
      (document.getElementById('mId') as HTMLInputElement).value = '';
      (document.getElementById('mName') as HTMLInputElement | null)!.value = '';
      (document.getElementById('mEmail') as HTMLInputElement | null)!.value = '';
      toast('Persona agregada al equipo');
    } catch (e: any) { toast(e.message); }
    finally { bA.disabled = false; }
  };
  document.querySelectorAll('[data-mrole]').forEach((el) => (el as HTMLSelectElement).onchange = async (e) => {
    const sel = e.target as HTMLSelectElement;
    if (!cur || !await ensureTeamAuth()) { navigate(); return; }
    sel.disabled = true;
    try { await updateMemberRole(cur, sel.dataset.mrole!, sel.value); toast('Permiso actualizado'); navigate(); }
    catch (err: any) { toast(err?.message ?? 'No pude actualizar el permiso'); sel.disabled = false; }
  });
  document.querySelectorAll('[data-mrm]').forEach((b) => (b as HTMLButtonElement).onclick = async () => {
    const btn = b as HTMLButtonElement;
    if (!cur || !await ensureTeamAuth()) return;
    if (!await confirmModal('¿Quitar a esta persona del negocio? Ya no verá el stock ni podrá vender.', 'Quitar')) return;
    btn.disabled = true;
    try { await removeMember(cur, btn.dataset.mrm!); toast('Persona quitada del equipo'); navigate(); }
    catch (err: any) { toast(err?.message ?? 'No pude quitar a la persona'); btn.disabled = false; }
  });
}
