import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './public/**/*.html'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f7f5',
          100: '#ecebe6',
          200: '#d8d4c8',
          300: '#b8b0a0',
          400: '#8d836f',
          500: '#675d4e',
          600: '#4d4438',
          700: '#363024',
          800: '#211d16',
          900: '#11100c'
        },
        sand: '#f5f0e6',
        apricot: '#ffb37a',
        coral: '#ff745f',
        mint: '#8fd3c8',
        sky: '#6fb8ff'
      },
      boxShadow: {
        bubble: '0 18px 40px rgba(17, 16, 12, 0.18)',
        glow: '0 0 0 1px rgba(255,255,255,0.08), 0 20px 45px rgba(111,184,255,0.22)'
      },
      backgroundImage: {
        'soft-grid': 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
      },
      keyframes: {
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: 0.7, transform: 'scale(1)' },
          '50%': { opacity: 1, transform: 'scale(1.02)' }
        }
      },
      animation: {
        floaty: 'floaty 5s ease-in-out infinite',
        pulseSoft: 'pulseSoft 1.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
};

export default config;
