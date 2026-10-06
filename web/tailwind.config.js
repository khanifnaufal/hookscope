/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'IBM Plex Sans',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          'IBM Plex Mono',
          'Cascadia Code',
          'Fira Code',
          'monospace',
        ],
      },
      colors: {
        accent: 'var(--accent)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',
      },
      animation: {
        'flash-new': 'flash-new 0.8s ease-out',
      },
      keyframes: {
        'flash-new': {
          '0%': { backgroundColor: 'var(--accent-dim)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
};
