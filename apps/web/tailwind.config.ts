import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', 'html.theme-dark'],
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
    },
  },
  plugins: [],
} satisfies Config;
