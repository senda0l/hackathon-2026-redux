/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        zone: {
          green: '#16a34a',
          red: '#dc2626',
          orange: '#ea580c',
          blue: '#2563eb',
          purple: '#7c3aed',
        },
      },
    },
  },
  plugins: [],
}
