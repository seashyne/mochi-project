// Tailwind CSS Configuration for Mochi Dark Minimalist Gaming Design System
// Defines semantic surface tokens, neon cyber accents, specular glass shadows, and animations

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        mochi: {
          bg: '#090b10',
          surface: '#0e1118',
          panel: '#131722',
          card: '#161b26',
          elevated: '#1d2433',
          border: 'rgba(255,255,255,0.08)',
          neon: {
            cyan: '#00a2ff',
            sky: '#38bdf8',
            indigo: '#6366f1',
            emerald: '#10b981',
            amber: '#f59e0b'
          }
        },
        // Studio palette lives in src/styles/studio-theme.css as --studio-*-rgb.
        // Dark reference values: bg #1e1e24, surface #222228, panel #25252b,
        // ribbon #282830, card #2a2a32, border #363640, muted #a0a0ab,
        // text #ededf2, accent #00a2ff. Light overrides: html.light.
        // <alpha-value> keeps bg-studio-panel/90 style opacity modifiers valid.
        studio: {
          bg: 'rgb(var(--studio-bg-rgb) / <alpha-value>)',
          surface: 'rgb(var(--studio-surface-rgb) / <alpha-value>)',
          panel: 'rgb(var(--studio-panel-rgb) / <alpha-value>)',
          ribbon: 'rgb(var(--studio-ribbon-rgb) / <alpha-value>)',
          card: 'rgb(var(--studio-card-rgb) / <alpha-value>)',
          border: 'rgb(var(--studio-border-rgb) / <alpha-value>)',
          muted: 'rgb(var(--studio-muted-rgb) / <alpha-value>)',
          text: 'rgb(var(--studio-text-rgb) / <alpha-value>)',
          accent: 'rgb(var(--studio-accent-rgb) / <alpha-value>)',
          success: 'rgb(var(--studio-success-rgb) / <alpha-value>)',
          warning: 'rgb(var(--studio-warning-rgb) / <alpha-value>)',
          danger: 'rgb(var(--studio-danger-rgb) / <alpha-value>)',
          info: 'rgb(var(--studio-info-rgb) / <alpha-value>)',
          violet: 'rgb(var(--studio-violet-rgb) / <alpha-value>)',
          'on-accent': 'rgb(var(--studio-on-accent-rgb) / <alpha-value>)',
          overlay: 'rgb(var(--studio-overlay-rgb) / <alpha-value>)'
        }
      },
      boxShadow: {
        'mochi-cyan': '0 0 24px -4px rgba(0, 162, 255, 0.42), 0 0 8px -2px rgba(56, 189, 248, 0.28)',
        'mochi-indigo': '0 0 28px -6px rgba(99, 102, 241, 0.45)',
        'mochi-emerald': '0 0 20px -4px rgba(16, 185, 129, 0.4)',
        'mochi-card': '0 16px 40px -12px rgba(0, 0, 0, 0.75), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
        'mochi-glass': '0 24px 64px -16px rgba(0, 0, 0, 0.85), inset 0 1px 0 0 rgba(255, 255, 255, 0.09)'
      },
      backgroundImage: {
        'mochi-grid':
          'linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px)'
      },
      keyframes: {
        'mochi-pulse-slow': {
          '0%, 100%': { opacity: '0.65', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.04)' }
        },
        'mochi-float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' }
        }
      },
      animation: {
        'mochi-pulse-slow': 'mochi-pulse-slow 4s ease-in-out infinite',
        'mochi-float': 'mochi-float 5s ease-in-out infinite'
      }
    }
  },
  plugins: []
};
