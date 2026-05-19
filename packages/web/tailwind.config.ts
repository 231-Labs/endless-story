import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#faf8f3',
        ink: '#18181b',
        mute: '#71717a',
        hairline: '#e5e5e0',
        cinnabar: '#b04a3c',
        jade: '#6c8a6f',
        seal: '#a3392a',
      },
      fontFamily: {
        serif: ['"Noto Serif TC"', '"Songti TC"', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
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
