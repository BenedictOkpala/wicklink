'use client';

import { THEME_STORAGE_KEY, toggleTheme } from './theme';

export default function ThemeToggle() {
  return <button className="theme-toggle" title="Switch colour theme" onClick={() => toggleTheme(document.documentElement, theme => window.localStorage.setItem(THEME_STORAGE_KEY, theme))}>
    <span className="theme-dark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg><span>Dark</span><span className="sr-only"> mode active. Switch to light mode.</span></span>
    <span className="theme-light"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span>Light</span><span className="sr-only"> mode active. Switch to dark mode.</span></span>
  </button>;
}
