// Pequeños incentivos para que usar la app sea más divertido:
// meta diaria, festejo, logros y compartir resúmenes por WhatsApp.

const todayStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const goalKey = (org: string) => `zt_goal_${org || 'local'}`;
const goalOkKey = (org: string) => `zt_goal_ok_${org || 'local'}_${todayStamp()}`;
const onbHideKey = (org: string) => `zt_onb_hide_${org || 'local'}`;
const onbDoneKey = (org: string) => `zt_onb_done_${org || 'local'}`;

export function getDailyGoal(org: string): number {
  try {
    const raw = localStorage.getItem(goalKey(org));
    return Math.max(0, Math.round(Number(raw ?? 0)) || 0);
  } catch { return 0; }
}

export function setDailyGoal(org: string, amount: number) {
  try { localStorage.setItem(goalKey(org), String(Math.max(0, Math.round(Number(amount) || 0)))); } catch { /* sin storage */ }
}

export const wasGoalCelebratedToday = (org: string) => {
  try { return localStorage.getItem(goalOkKey(org)) === '1'; } catch { return false; }
};

export const markGoalCelebratedToday = (org: string) => {
  try { localStorage.setItem(goalOkKey(org), '1'); } catch { /* sin storage */ }
};

export const isOnboardingHidden = (org: string) => {
  try { return localStorage.getItem(onbHideKey(org)) === '1'; } catch { return false; }
};

export const hideOnboarding = (org: string) => {
  try { localStorage.setItem(onbHideKey(org), '1'); } catch { /* sin storage */ }
};

export const wasOnboardingCompleted = (org: string) => {
  try { return localStorage.getItem(onbDoneKey(org)) === '1'; } catch { return false; }
};

export const markOnboardingCompleted = (org: string) => {
  try { localStorage.setItem(onbDoneKey(org), '1'); } catch { /* sin storage */ }
};

// Confeti liviano, sin librerías. Respeta "reducir movimiento".
export function confetti(count = 70) {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch { /* sin matchMedia */ }
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  const colors = ['#17c964', '#2bdc78', '#0ea5e9', '#f5a524', '#f31260', '#a78bfa', '#ffffff'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 220)}px`);
    piece.style.animationDelay = `${(Math.random() * 0.35).toFixed(2)}s`;
    piece.style.animationDuration = `${(1.7 + Math.random() * 1.1).toFixed(2)}s`;
    piece.style.width = `${6 + Math.round(Math.random() * 5)}px`;
    piece.style.height = `${9 + Math.round(Math.random() * 7)}px`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3400);
}

export type ShareResult = 'shared' | 'copied' | 'cancelled';

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

// Comparte con el menú nativo del celular y, si no hay, copia al portapapeles.
export async function shareText(title: string, text: string): Promise<ShareResult> {
  const nav = navigator as any;
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, text });
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return legacyCopy(text) ? 'copied' : 'cancelled';
  }
}
