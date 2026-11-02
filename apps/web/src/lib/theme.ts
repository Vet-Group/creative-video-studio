// The colour theme from Settings > Preferences, per device in localStorage: light, dark, or the system's (no html[data-theme], so globals.css follows the media query).

export type Theme = 'light' | 'dark' | 'system';
export const THEME_KEY = 'cvs.theme';

/** The stored choice; anything else (nothing stored, an old value, blocked storage) is the system's. */
export const themeOf = (stored: string | null): Theme => (stored === 'light' || stored === 'dark' ? stored : 'system');

export function readTheme(): Theme {
  try {
    return themeOf(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

/** Applies the choice at once and keeps it; blocked storage keeps it for this page only. */
export function saveTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

/** Inlined in the root layout's <head>, so the stored theme is on <html> before the first paint (no light flash); the same rule as themeOf. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}})()`;
