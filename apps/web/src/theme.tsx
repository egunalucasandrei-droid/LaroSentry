import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
const key = 'larosentry-theme';
function initialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* Storage may be disabled. The current tab still works. */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function initializeTheme() {
  document.documentElement.dataset.theme = initialTheme();
}
export function ThemeToggle() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(key, theme);
    } catch {
      /* Keep the tab preference. */
    }
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === key && (event.newValue === 'light' || event.newValue === 'dark'))
        setTheme(event.newValue);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label="Dark mode"
      aria-pressed={theme === 'dark'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}
