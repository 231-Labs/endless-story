import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        mute: 'rgb(var(--color-mute) / <alpha-value>)',
        hairline: 'rgb(var(--color-hairline) / <alpha-value>)',
        cinnabar: 'rgb(var(--color-cinnabar) / <alpha-value>)',
        jade: 'rgb(var(--color-jade) / <alpha-value>)',
        seal: 'rgb(var(--color-seal) / <alpha-value>)',
      },
      fontFamily: {
        // var(--font-serif) 由 next/font (Noto Serif TC) 提供；Songti TC 是
        // macOS/iOS 的本機後備，最後才退到通用 serif。
        serif: ['var(--font-serif)', '"Noto Serif TC"', '"Songti TC"', 'serif'],
        sans: ['system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.6' }],
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [],
};

export default config;
