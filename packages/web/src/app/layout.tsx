import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Endless Story',
  description: 'A living troupe on Walrus.',
};

// Inline boot script — runs before React hydrates to avoid theme flash.
// Reads localStorage('endless-theme') or falls back to system preference.
const themeBoot = `
(function() {
  try {
    var stored = localStorage.getItem('endless-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = stored === 'dark' || (!stored && prefersDark);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (_) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
