/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    typography: require('./typography'),
    extend: {
      colors: {
        gray: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          700: '#374151',
          800: '#1F2A37',
          900: '#111928',
        },
        primary: {
          50: '#EBF5FF',
          100: '#E1EFFE',
          200: '#C3DDFD',
          300: '#A4CAFE',
          600: '#1C64F2',
          700: '#1A56DB',
        },
        blue: {
          500: '#E1EFFE',
        },
        green: {
          50: '#F3FAF7',
          100: '#DEF7EC',
          800: '#03543F',

        },
        yellow: {
          100: '#FDF6B2',
          800: '#723B13',
        },
        purple: {
          50: '#F6F5FF',
        },
        indigo: {
          25: '#F5F8FF',
          100: '#E0EAFF',
          600: '#444CE7',
        },
        'tech-blue': {
          DEFAULT: '#00D4FF',
          50: '#E0F8FF',
          100: '#B0EAFF',
          200: '#80DCFF',
          300: '#50CEFF',
          400: '#20C0FF',
          500: '#00D4FF',
          600: '#00A8CC',
          700: '#007C99',
          800: '#005066',
          900: '#002433',
          glow: 'rgba(0, 212, 255, 0.3)',
        },
        // Semantic theme colors (CSS variables)
        surface: {
          DEFAULT: 'var(--surface)',
          secondary: 'var(--surface-secondary)',
          tertiary: 'var(--surface-tertiary)',
          hover: 'var(--surface-hover)',
          active: 'var(--surface-active)',
          elevated: 'var(--surface-elevated)',
        },
        content: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          quaternary: 'var(--text-quaternary)',
          accent: 'var(--text-accent)',
          'on-accent': 'var(--text-on-accent)',
        },
        border: {
          DEFAULT: 'var(--border)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          accent: 'var(--accent)',
          'accent-hover': 'var(--accent-hover)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          bg: 'var(--accent-bg)',
          'bg-hover': 'var(--accent-bg-hover)',
        },
        'user-bubble': {
          DEFAULT: 'var(--user-bubble)',
          text: 'var(--user-bubble-text)',
        },
        fill: {
          DEFAULT: 'var(--fill)',
          light: 'var(--fill-light)',
          'on-accent': 'var(--fill-on-accent)',
        },
      },
      screens: {
        mobile: '100px',
        // => @media (min-width: 100px) { ... }
        tablet: '640px', // 391
        // => @media (min-width: 600px) { ... }
        pc: '769px',
        // => @media (min-width: 769px) { ... }
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
