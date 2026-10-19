import { app, esc, toast } from '../ui';
import { shell, bindCommon } from '../chrome';
import { requireUser, loadOrgs, isLocalContext } from '../session';
import { isCloudConfigured } from '../lib/pb';
import { getScaleSettings, setScaleSettings, normalizeWeight, formatKg, type ScaleSettings } from '../lib/scale';

// ---------- Ajustes del punto de venta (solo dueño) ----------
export async function vAjustes() {
  const user = await requireUser();
  const { list, cur, cloudError } = await loadOrgs();
  if (cloudError || !cur) { location.hash = '#/panel'; return; }
  const org = cur;
  const role = list.find((o) => o.id === org)?.role ?? '';
  const owner = role === 'dueno' || isLocalContext(role, user);
  const orgName = list.find((o) => o.id === org)?.name ?? 'tu negocio';
  if (!owner) {
    app.innerHTML = shell(`<div class="bento"><div class="card span12">
      <h2>Ajustes solo para el dueño</h2>
      <p class="mut">Esta sección configura cómo cobra ${esc(orgName)}. Pedile al dueño que entre con su cuenta.</p>
      <div class="row"><a class="btn small" href="#/panel">Volver al panel</a></div>
    </div></div>`, 'ajustes', { orgs: list, org, email: (user as any)?.email });
    bindCommon(list, org);
    return;
  }

  const scale = getScaleSettings(org);
  app.innerHTML = shell(`<div class="bento">
    <div class="card span12 settings-hero">
      <div class="settings-hero-top">
        <b class="metric-icon big">🛠</b>
        <div>
          <div class="eyebrow">${esc(orgName)}</div>
          <h2>Ajustes del punto de venta</h2>
          <p class="mut">Configurá cómo cobrás. Los cambios se guardan en este dispositivo.</p>
        </div>
      </div>
    </div>

    <div class="card span8">
      <div class="card-head">
        <div>
          <h2>Cobro por peso</h2>
          <p class="mut">Para fiambres, carnes, granel o cualquier producto que se venda por kg.</p>
        </div>
        <label class="switch" for="sEnabled">
          <input id="sEnabled" type="checkbox" ${scale.enabled ? 'checked' : ''} />
          <i aria-hidden="true"></i>
          <span id="sEnabledLabel">${scale.enabled ? 'Activado' : 'Desactivado'}</span>
        </label>
      </div>

      <div id="scaleFields" ${scale.enabled ? '' : 'hidden'}>
        <div class="grid2">
          <div class="field">
            <label for="sUnit">La balanza envía el peso en</label>
            <select id="sUnit">
              <option value="kg" ${scale.unit === 'kg' ? 'selected' : ''}>Kilogramos — 0,750</option>
              <option value="g" ${scale.unit === 'g' ? 'selected' : ''}>Gramos — 750</option>
            </select>
          </div>
          <div class="field">
            <label for="sDecimals">Decimales en pantalla</label>
            <select id="sDecimals">
              <option value="2" ${scale.decimals === 2 ? 'selected' : ''}>2 — 0,75 kg</option>
              <option value="3" ${scale.decimals === 3 ? 'selected' : ''}>3 — 0,750 kg</option>
            </select>
          </div>
        </div>
        <div class="field" style="margin-top:.7rem">
          <label for="sSuffix">La balanza termina con</label>
          <select id="sSuffix">
            <option value="Enter" ${scale.suffix === 'Enter' ? 'selected' : ''}>Enter</option>
            <option value="Tab" ${scale.suffix === 'Tab' ? 'selected' : ''}>Tab</option>
          </select>
        </div>
        <div class="field" style="margin-top:.7rem">
          <label for="sTest">Probar balanza</label>
          <input id="sTest" inputmode="decimal" autocomplete="off" placeholder="Enfocá acá y usá la balanza" />
          <small class="hint" id="sTestOut">Todavía no probaste. El peso detectado aparece acá.</small>
        </div>
      </div>

      <div class="row" style="margin-top:.9rem">
        <button class="btn" id="bSaveScale" type="button">Guardar ajustes</button>
        <a class="btn ghost" href="#/productos">Marcar productos por peso</a>
      </div>
    </div>

    <div class="card span4">
      <h3>Cómo funciona</h3>
      <ol class="team-steps">
        <li><b>1.</b> Activá el cobro por peso y guardá.</li>
        <li><b>2.</b> En <b>Stock</b>, editá el producto y marcá <b>“Se vende por peso”</b>. El precio pasa a ser por kg y el stock se mide en kg.</li>
        <li><b>3.</b> En <b>Vender</b>, tocá <b>Pesar</b> (o escaneá el producto) y la balanza escribe el peso.</li>
      </ol>
      <p class="hint">Funciona con balanzas que se conectan como teclado y escriben el peso terminando en Enter o Tab. Si no tenés balanza, podés cargar el peso a mano.</p>
      <p class="pill ${scale.enabled ? 'ok' : ''}" id="scaleStatusPill">${scale.enabled ? '⚖ Balanza activada' : 'Balanza desactivada'}</p>
      ${isCloudConfigured() ? '<p class="hint">Si usás la nube y el campo nuevo no sincroniza, volvé a correr <b>npm run setup:pocketbase</b> en el servidor.</p>' : ''}
    </div>
  </div>`, 'ajustes', { orgs: list, org, email: (user as any)?.email });
  bindCommon(list, org);

  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const read = (): ScaleSettings => ({
    enabled: el<HTMLInputElement>('sEnabled').checked,
    unit: el<HTMLSelectElement>('sUnit').value === 'g' ? 'g' : 'kg',
    decimals: Number(el<HTMLSelectElement>('sDecimals').value) === 2 ? 2 : 3,
    suffix: el<HTMLSelectElement>('sSuffix').value === 'Tab' ? 'Tab' : 'Enter',
  });

  const fields = el<HTMLElement>('scaleFields');
  const enable = el<HTMLInputElement>('sEnabled');
  const enableLabel = el<HTMLElement>('sEnabledLabel');
  const paintEnabled = () => {
    fields.hidden = !enable.checked;
    enableLabel.textContent = enable.checked ? 'Activado' : 'Desactivado';
  };
  enable.addEventListener('change', paintEnabled);

  const testInput = el<HTMLInputElement>('sTest');
  const testOut = el<HTMLElement>('sTestOut');
  const paintTest = () => {
    if (!testInput.value) {
      testOut.textContent = 'Todavía no probaste. El peso detectado aparece acá.';
      testOut.classList.remove('ok', 'warn-text');
      return;
    }
    const kg = normalizeWeight(testInput.value, read());
    if (kg) {
      testOut.textContent = `✓ Peso detectado: ${formatKg(kg, read().decimals)}`;
      testOut.classList.add('ok');
      testOut.classList.remove('warn-text');
    } else {
      testOut.textContent = 'No pude leer ese peso. Revisá la unidad configurada.';
      testOut.classList.add('warn-text');
      testOut.classList.remove('ok');
    }
  };
  testInput.addEventListener('input', paintTest);
  testInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || (read().suffix === 'Tab' && e.key === 'Tab')) {
      e.preventDefault();
      paintTest();
    }
  });

  el<HTMLButtonElement>('bSaveScale').addEventListener('click', () => {
    const next = read();
    setScaleSettings(org, next);
    paintEnabled();
    const pill = el<HTMLElement>('scaleStatusPill');
    pill.textContent = next.enabled ? '⚖ Balanza activada' : 'Balanza desactivada';
    pill.classList.toggle('ok', next.enabled);
    toast(next.enabled ? 'Balanza activada ✓' : 'Ajustes guardados');
  });
}
