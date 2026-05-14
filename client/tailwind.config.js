/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        fresh: '#22C55E',
        warn: '#F59E0B',
        danger: '#EF4444',
        bg: '#0d0d0d',
      },
      boxShadow: {
        card: '0 1px 8px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
