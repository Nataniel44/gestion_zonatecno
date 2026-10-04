export const SCANNER_KEY = 'zt_scanner_settings';
export type ScannerSettings = { enabled: boolean; suffix: 'Enter' | 'Tab'; minLength: number };
export const defaultScanner = (): ScannerSettings => ({ enabled: true, suffix: 'Enter', minLength: 6 });
export const getScannerSettings = (): ScannerSettings => {
  try { return { ...defaultScanner(), ...JSON.parse(localStorage.getItem(SCANNER_KEY) || '{}') }; }
  catch { return defaultScanner(); }
};
export const setScannerSettings = (value: ScannerSettings) => localStorage.setItem(SCANNER_KEY, JSON.stringify(value));
export let barcodeHandler: ((code: string) => void) | null = null;

export function initScanner() {
  let buffer = '';
  let timer = 0;
  const emit = () => {
    const code = buffer.trim();
    buffer = '';
    if (code) document.dispatchEvent(new CustomEvent('zt:barcode', { detail: code }));
  };
  document.addEventListener('keydown', (event) => {
    const settings = getScannerSettings();
    if (!settings.enabled) return;
    const target = event.target as HTMLElement;
    const inField = target?.matches?.('input, textarea, select') || target?.isContentEditable;
    if (inField && !target.hasAttribute('data-scanner-input')) return;
    if (target?.id === 'q2') return;
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (buffer.length >= settings.minLength) { event.preventDefault(); emit(); }
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    clearTimeout(timer);
    buffer += event.key;
    if (settings.suffix === 'Enter') timer = window.setTimeout(() => { if (buffer.length >= settings.minLength) emit(); }, 120);
  });
  document.addEventListener('zt:barcode', (event) => barcodeHandler?.((event as CustomEvent<string>).detail));
}

export function scanBarcode(): Promise<string | null> {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ovl';
    ov.innerHTML = `<div class="card modal-card scanner-card"><h2>Escanear producto</h2><p class="mut">Apuntá la cámara al código de barras o escribilo a mano.</p><video id="scanVideo" autoplay playsinline muted></video><div class="field"><label>Código</label><input id="scanCode" inputmode="numeric" placeholder="Ej: 7791234567890" /></div><div class="row" style="margin-top:.6rem"><button class="btn" id="scanOk">Usar código</button><button class="btn ghost" id="scanCancel">Cancelar</button></div></div>`;
    document.body.appendChild(ov);
    const video = document.getElementById('scanVideo') as HTMLVideoElement;
    const input = document.getElementById('scanCode') as HTMLInputElement;
    let stream: MediaStream | null = null;
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      stream?.getTracks().forEach((track) => track.stop());
      ov.remove();
      resolve(value?.trim() || null);
    };
    (document.getElementById('scanCancel') as HTMLButtonElement).onclick = () => finish(null);
    (document.getElementById('scanOk') as HTMLButtonElement).onclick = () => finish(input.value);
    const Detector = (window as any).BarcodeDetector;
    if (Detector && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }).then(async (s) => {
        stream = s; video.srcObject = s;
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code'] });
        const scan = async () => {
          if (done) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) { input.value = codes[0].rawValue; finish(codes[0].rawValue); return; }
          } catch { /* seguimos con entrada manual */ }
          requestAnimationFrame(scan);
        };
        scan();
      }).catch(() => { /* cámara no disponible: manual */ });
    }
  });
}

export function setBarcodeHandler(fn: ((code: string) => void) | null) { barcodeHandler = fn; }
