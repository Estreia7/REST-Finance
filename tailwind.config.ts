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
        // Bound to next/font CSS variables set in app/layout.tsx.
        sans: ['var(--font-sans)', ...fontFamily.sans],
        display: ['var(--font-display)', 'var(--font-sans)', ...fontFamily.sans],
        mono: ['var(--font-mono)', ...fontFamily.mono]
      },
      colors: {
        background:  'hsl(var(--background))',
        surface:     'hsl(var(--surface))',
        foreground:  'hsl(var(--foreground))',
        card: {
          DEFAULT:    'hsl(var(--card))',
          elevated:   'hsl(var(--card-elevated))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          hover:      'hsl(var(--primary-hover))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        'primary-ink': 'hsl(var(--primary-text))',
        border: {
          DEFAULT:    'hsl(var(--border))',
          subtle:     'hsl(var(--border-subtle))'
        },
        input:        'hsl(var(--input))',
        ring:         'hsl(var(--ring))',
        success:      'hsl(var(--success))',
        warning:      'hsl(var(--warning))',
        danger:       'hsl(var(--danger))',
        'lamp-success': 'hsl(var(--lamp-success))',
        'lamp-warning': 'hsl(var(--lamp-warning))',
        'lamp-danger':  'hsl(var(--lamp-danger))',
        'pnl-revenue':    'hsl(var(--pnl-revenue))',
        'pnl-revenue-bg': 'hsl(var(--pnl-revenue-bg))',
        'pnl-cogs':       'hsl(var(--pnl-cogs))',
        'pnl-cogs-bg':    'hsl(var(--pnl-cogs-bg))',
        'pnl-opex':       'hsl(var(--pnl-opex))',
        'pnl-opex-bg':    'hsl(var(--pnl-opex-bg))',
        'pnl-result-bg':  'hsl(var(--pnl-result-bg))',
        info:         'hsl(var(--info))',
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        }
      },

      backgroundImage: {
        'gradient-radial':  'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':   'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient':    'radial-gradient(ellipse at top center, hsl(258 90% 20% / 0.35), transparent 65%)',
        'hero-gradient-2':  'radial-gradient(ellipse at bottom right, hsl(240 84% 20% / 0.2), transparent 60%)',
        'card-gradient':    'linear-gradient(135deg, hsl(222 40% 10%), hsl(222 40% 8%))',
        'brand-gradient':   'linear-gradient(135deg, hsl(258 90% 66%), hsl(240 84% 67%))',
      },

      boxShadow: {
        'glow-sm':    '0 0 12px rgba(139, 92, 246, 0.2)',
        'glow':       '0 0 24px rgba(139, 92, 246, 0.35)',
        'glow-lg':    '0 0 48px rgba(139, 92, 246, 0.5)',
        'glow-inner': 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'card':       '0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        'modal':      '0 24px 64px rgba(0, 0, 0, 0.6)',
      },

      animation: {
        'fade-in':     'fadeIn 0.4s ease-out',
        'fade-in-up':  'fadeInUp 0.5s ease-out',
        'slide-in':    'slideIn 0.4s ease-out',
        'pulse-slow':  'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow':        'glowPulse 3s ease-in-out infinite',
        'float':       'float 6s ease-in-out infinite',
        'gradient':    'gradientShift 8s ease infinite',
        'shimmer':     'shimmer 2s ease-in-out infinite',
        'count-up':    'fadeInUp 0.8s ease-out both',
        'spin':        'spin 1s linear infinite',
      },

      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)' },
          '50%':       { boxShadow: '0 0 40px rgba(139, 92, 246, 0.6), 0 0 60px rgba(99, 102, 241, 0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-12px)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':       { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },

      borderRadius: {
        lg:  '1.125rem',
        md:  '0.875rem',
        sm:  '0.5rem',
        xl:  '1.25rem',
        '2xl': '1.5rem',
      },

      backdropBlur: {
        xs: '2px',
      },

      transitionDuration: {
        '150': '150ms',
        '250': '250ms',
      },
    }
  },
  plugins: [require('tailwindcss-animate')]
};

export default config;
