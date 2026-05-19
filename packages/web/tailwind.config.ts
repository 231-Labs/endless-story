import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1a1614',
        parchment: '#f5efe4',
        cinnabar: '#b04a3c',
        jade: '#6c8a6f',
      },
      fontFamily: {
        serif: ['"Noto Serif TC"', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
