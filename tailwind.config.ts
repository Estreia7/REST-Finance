import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1200px'
      }
    },
    extend: {
      fontFamily: {
        sans: ['system-ui', ...fontFamily.sans]
      },
      colors: {
        background: 'rgb(23, 23, 28)',
        foreground: 'hsl(0, 0%, 100%)',
        muted: 'hsl(0, 0%, 30%)',
        card: 'rgba(35, 35, 42, 0.8)',
        border: 'rgba(255, 255, 255, 0.1)',
        primary: {
          DEFAULT: 'hsl(222, 92%, 60%)',
          foreground: 'hsl(0, 0%, 100%)'
        },
        accent: {
          DEFAULT: 'hsl(280, 80%, 60%)',
          foreground: 'hsl(0, 0%, 100%)'
        },
        success: 'hsl(150, 62%, 51%)',
        danger: 'hsl(0, 84%, 60%)'
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-in-out',
        'fade-in-up': 'fadeInUp 0.8s ease-out',
        'slide-in': 'slideIn 0.6s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(99, 102, 241, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.8), 0 0 30px rgba(99, 102, 241, 0.4)' },
        },
      },
      borderRadius: {
        lg: '18px',
        md: '14px',
        sm: '10px'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};

export default config;

