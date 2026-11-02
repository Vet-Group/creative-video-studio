// Per-device preferences from Settings > Tuỳ chọn, in localStorage, and what they do when a job finishes (components/jobs.tsx).

const KEYS = { notify: 'cvs.pref.notify', chime: 'cvs.pref.chime' } as const;
export type Pref = keyof typeof KEYS;

/** Off unless switched on here; storage can be blocked (private windows, site data off), which reads as off. */
export function readPref(pref: Pref): boolean {
  try {
    return localStorage.getItem(KEYS[pref]) === '1';
  } catch {
    return false;
  }
}

export function writePref(pref: Pref, on: boolean): void {
  try {
    localStorage.setItem(KEYS[pref], on ? '1' : '0');
  } catch {
    // Storage is blocked: the switch works until the page is closed.
  }
}

/** 'unsupported' where the browser has no Notification API (iOS Safari outside a home-screen app), else the page's permission. */
export const notificationState = (): NotificationPermission | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

let audio: AudioContext | undefined;

/** A soft two-note chime of about 250 ms, made with an oscillator so no sound file is loaded. */
export function chime(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, t);
    osc.frequency.setValueAtTime(1175, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.26);
  } catch {
    // No audio here (or not allowed yet): the toast still says it.
  }
}

/** Finished jobs, beyond the toast: a system notification while the tab is hidden, and the chime, each if switched on. */
export function announce(texts: string[]): void {
  if (texts.length === 0) return;
  if (readPref('notify') && document.visibilityState === 'hidden' && notificationState() === 'granted') {
    try {
      new Notification('Creative Video Studio', { body: texts.length === 1 ? texts[0] : `${texts.length} job đã xong`, tag: 'cvs-jobs' });
    } catch {
      // Android Chrome allows notifications only from a service worker; the toast and the tab title still say it.
    }
  }
  if (readPref('chime')) chime();
}
