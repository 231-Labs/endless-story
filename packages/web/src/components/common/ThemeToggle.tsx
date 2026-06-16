'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  // Hydrate from DOM (the inline boot script sets the class before React mounts)
  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const apply = () => {
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem('endless-theme', next);
      setTheme(next);
    };
    // 墨韻：以 View Transitions 讓整頁日↔夜交融，而非硬切。不支援或使用者偏好
    // 減弱動效時，直接套用（CSS 端的 ::view-transition 規則亦已做 reduce 守門）。
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof doc.startViewTransition === 'function' && !reduce) {
      doc.startViewTransition(apply);
    } else {
      apply();
    }
  };

  if (theme == null) {
    // Pre-hydration placeholder to avoid layout shift
    return <span className="inline-block h-8 w-8" aria-hidden />;
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '切換為日間模式' : '切換為夜間模式'}
      className="es-icon-button h-8 w-8"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}


function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1M17.4 17.4l1 1M5.6 18.4l1-1M17.4 6.6l1-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 13.5A9 9 0 0 1 10.5 3a7.5 7.5 0 1 0 10.5 10.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
