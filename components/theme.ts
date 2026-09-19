export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'nightshift-theme';

// Runs in the document head before the body is painted. Storage can be blocked.
export const THEME_INIT_SCRIPT = `(() => {
  let theme = 'dark';
  try { theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch {}
  try {
    const saved = window.localStorage.getItem('nightshift-theme');
    if (saved === 'dark' || saved === 'light') theme = saved;
  } catch {}
  document.documentElement.setAttribute('data-theme', theme);
})();`;

export function toggleTheme(root: Pick<HTMLElement, 'getAttribute' | 'setAttribute'>, save: (theme: Theme) => void): Theme {
  const theme = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  try { save(theme); } catch { /* The current page still switches when storage is unavailable. */ }
  return theme;
}
