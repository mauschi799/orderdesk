/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gas: {
          50: '#fef3e2',
          100: '#fde4ba',
          200: '#fbd08d',
          300: '#f8b85e',
          400: '#f6a038',
          500: '#f48a1a',
          600: '#e07010',
          700: '#c0560c',
          800: '#9a400e',
          900: '#7c330f',
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
}
