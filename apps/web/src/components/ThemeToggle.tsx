'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

// Light/dark switch. Starts from the saved choice, else the phone or computer's setting (see the inline script in layout.tsx).
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  function flip() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('kavi-theme', next); } catch {}
    setTheme(next);
  }

  const dark = theme === 'dark';
  return (
    <button className="toggle" type="button" onClick={flip} role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <span className="toggle-track" data-on={dark}>
        <svg className="toggle-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></svg>
        <svg className="toggle-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" /></svg>
        <span className="toggle-knob" />
      </span>
    </button>
  );
}
