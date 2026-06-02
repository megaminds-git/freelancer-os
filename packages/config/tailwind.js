/** @type {import('tailwindcss').Config} */
const preset = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1A56DB',
          50: '#EFF4FF',
          100: '#D9E4FD',
          500: '#1A56DB',
          600: '#1547C0',
          700: '#1239A5',
        },
        accent: '#0EA5E9',
        dark: '#1E293B',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};

module.exports = preset;
