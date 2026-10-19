import { esc, fmt } from '../ui';

// Configuración de balanza por negocio. Se guarda en este dispositivo.
// La v1 está pensada para balanzas que "tipean" el peso y terminan con Enter
// (también sirve para cargar el peso a mano).
export interface ScaleSettings {
  enabled: boolean;
  unit: 'kg' | 'g'; // unidad en la que la balanza envía el número
  decimals: number; // decimales para mostrar el peso en kg
  suffix: 'Enter' | 'Tab';
}

export const defaultScaleSettings = (): ScaleSettings => ({
  enabled: false,
  unit: 'kg',
  decimals: 3,
  suffix: 'Enter',
});

const scaleKey = (org: string) => `zt_scale_${org || 'local'}`;

export function getScaleSettings(org: string): ScaleSettings {
  try {
    return { ...defaultScaleSettings(), ...JSON.parse(localStorage.getItem(scaleKey(org)) || '{}') };
  } catch {
    return defaultScaleSettings();
  }
}

export function setScaleSettings(org: string, settings: ScaleSettings) {
  try { localStorage.setItem(scaleKey(org), JSON.stringify(settings)); } catch { /* sin storage */ }
}

// Acepta "0,750", "0.750" o "750" (según la unidad configurada) y devuelve kg.
export function normalizeWeight(value: string | number, settings: ScaleSettings): number | null {
  const raw = String(value ?? '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number <= 0) return null;
  const kg = settings.unit === 'g' ? number / 1000 : number;
  return Math.round(kg * 1000) / 1000;
}

export function formatWeight(kg: number, decimals = 3): string {
  return Number(kg || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.max(0, Math.min(3, decimals)),
  });
}

export const formatKg = (kg: number, decimals = 3) => `${formatWeight(kg, decimals)} kg`;

// Modal para pesar un producto. La balanza escribe en el input enfocado y
// termina con Enter/Tab; también se puede escribir el peso a mano.
export function promptWeight(
  product: { name: string; price: number },
  settings: ScaleSettings,
  initial = 0,
): Promise<number | null> {
  return new Promise((resolve) => {
    const unitLabel = settings.unit === 'g' ? 'gramos' : 'kg';
    const initialRaw = initial > 0
      ? (settings.unit === 'g' ? String(Math.round(initial * 1000)) : String(initial))
      : '';
    const ov = document.createElement('div');
    ov.className = 'ovl';
    ov.innerHTML = `<form class="card modal-card weight-card" id="weightForm">
      <div class="eyebrow">Balanza</div>
      <h2>¿Cuánto pesa?</h2>
      <p class="mut">${esc(product.name)} · ${fmt(product.price)} por kg</p>
      <div class="weight-display">
        <strong id="wTotal">${fmt(0)}</strong>
        <span id="wKg">0 kg</span>
      </div>
      <div class="field">
        <label for="weightInput">Peso en ${unitLabel}</label>
        <input id="weightInput" class="weight-input" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(initialRaw)}" />
      </div>
      <p class="hint" id="wHint">Apoyá el producto y dejá que la balanza escriba el peso. También podés cargarlo a mano.</p>
      <div class="row" style="margin-top:.7rem"><button class="btn" type="submit" id="wOk">Agregar</button><button class="btn ghost" type="button" id="wCancel">Cancelar</button></div>
    </form>`;
    document.body.appendChild(ov);
    const input = document.getElementById('weightInput') as HTMLInputElement;
    const total = document.getElementById('wTotal') as HTMLElement;
    const kgLabel = document.getElementById('wKg') as HTMLElement;
    const hint = document.getElementById('wHint') as HTMLElement;
    const ok = document.getElementById('wOk') as HTMLButtonElement;

    const read = () => normalizeWeight(input.value, settings);
    const paint = () => {
      const kg = read() ?? 0;
      total.textContent = fmt(kg * product.price);
      kgLabel.textContent = formatKg(kg, settings.decimals);
      ok.disabled = !(kg > 0);
      ok.textContent = kg > 0 ? `Agregar ${fmt(kg * product.price)}` : 'Agregar';
    };
    const finish = () => {
      const kg = read();
      if (!kg) {
        hint.textContent = 'Ingresá un peso mayor a 0.';
        hint.classList.add('warn-text');
        input.focus();
        return;
      }
      ov.remove();
      resolve(kg);
    };
    const cancel = () => { ov.remove(); resolve(null); };

    input.addEventListener('input', paint);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || (settings.suffix === 'Tab' && e.key === 'Tab')) {
        e.preventDefault();
        finish();
      }
    });
    (document.getElementById('weightForm') as HTMLFormElement).onsubmit = (e) => { e.preventDefault(); finish(); };
    (document.getElementById('wCancel') as HTMLButtonElement).onclick = cancel;
    ov.addEventListener('click', (e) => { if (e.target === ov) cancel(); });
    paint();
    input.focus();
    input.select();
  });
}
