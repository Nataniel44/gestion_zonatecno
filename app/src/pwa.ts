import { toast } from './ui';

// ---- Instalar app (PWA) ----
export let deferredPrompt: any = null;
addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  deferredPrompt = e;
});
export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export function refreshInstallUI() {
  const installed = isInstalled();
  document.querySelectorAll<HTMLElement>('[data-install]').forEach((el) => {
    el.hidden = installed;
    el.style.display = installed ? 'none' : '';
  });
}

matchMedia('(display-mode: standalone)').addEventListener?.('change', refreshInstallUI);

export async function installApp() {
  if (isInstalled()) { refreshInstallUI(); toast('La app ya está instalada ✓'); return; }
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    if (r?.outcome === 'accepted') { refreshInstallUI(); toast('Instalando… buscala en tu inicio'); }
    return;
  }
  const ov = document.createElement('div');
  ov.className = 'ovl';
  ov.innerHTML = `<div class="card modal-card">
    <h2>Descargar la app</h2>
    <p class="mut">Es esta misma página, instalada como app. Anda sin internet.</p>
    <p><b>Android / Chrome:</b> menú ⋮ → <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</p>
    <p><b>iPhone:</b> Compartir <b>⎙</b> → <b>Agregar a inicio</b>.</p>
    <p><b>PC:</b> ícono <b>⊕ Instalar</b> en la barra de dirección.</p>
    <div class="row"><button class="btn" id="mClose">Entendido</button></div>
  </div>`;
  ov.onclick = (e) => { if ((e.target as HTMLElement).id === 'mClose' || e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-install]')) installApp();
});
