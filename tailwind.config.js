/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0b0d12',
        panel: '#141824',
        accent: '#8ef1c7',
      },
    },
  },
  plugins: [],
};
