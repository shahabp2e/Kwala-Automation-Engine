/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,mdx}',
    './components/**/*.{js,jsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kwala: {
          purple: '#6B3FA0',
          'purple-dark': '#4B2D7A',
          'purple-light': '#8B5CF6',
          bg: '#0F0A1A',
          card: '#1A1035',
          border: '#2D1F4E',
          sidebar: '#120C2A',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      }
    }
  },
  plugins: [],
};
