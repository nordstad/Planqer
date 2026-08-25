/** @type {import('tailwindcss').Config} */
/*
  Planqer runs in one visual world: the self-hosted README. Plain warm paper,
  ink type, one confident accent (a single warm amber-orange) reserved for the
  action and the one figure that matters. Rounded, quiet, credibility-first —
  the badges and code-flourish of a typical OSS landing page are gone; what's
  left is the four tools, front and center, and honest proof underneath them.
  Semantic roles live as CSS custom properties in index.css so both the light
  (day) and dark (night) editions come from one system.
*/
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Archivo', 'system-ui', 'sans-serif'],
        'narrow': ['"Archivo Narrow"', 'Archivo', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* primary = ink. Type and rules, warm near-black to warm paper. */
        'primary': {
          50: '#fafaf7',
          100: '#f2efe6',
          200: '#e9e6da',
          300: '#d6d2c2',
          400: '#ada798',
          500: '#8b8776',
          600: '#5c594c',
          700: '#453f33',
          800: '#2b271e',
          900: '#16150f',
        },
        /* accent = the signal. One warm amber-orange: the CTA, the one
           figure that matters, never scattered as decoration. */
        'accent': {
          50: '#fdf0e4',
          100: '#fbe0c8',
          200: '#f3c294',
          300: '#e8a35f',
          400: '#d97f36',
          500: '#c1631f',
          600: '#a34f18',
          700: '#7d3d14',
          800: '#5c2d10',
          900: '#3a2413',
        },
        /* success = confirmation, carried by ink and accent. No green. */
        'success': {
          50: '#fafaf7',
          100: '#f2efe6',
          200: '#e9e6da',
          300: '#d6d2c2',
          400: '#ada798',
          500: '#8b8776',
          600: '#5c594c',
          700: '#453f33',
          800: '#2b271e',
          900: '#16150f',
        },
        /* revision red: over limit, unplaced, delete — kept clearly redder
           than the accent amber so the two are never confused */
        'revision': {
          50: '#fdeeea',
          100: '#f9d2c8',
          300: '#e08770',
          500: '#cc2200',
          600: '#a81c00',
          700: '#821600',
        },
        /* dark = the paper-to-ink neutral scale, warmed to match the accent */
        'dark': {
          50: '#f7f5ef',
          100: '#ece7d8',
          200: '#d8d2bd',
          300: '#b3ac95',
          400: '#8f8b78',
          500: '#6b6754',
          600: '#4a4738',
          700: '#322d20',
          800: '#201d15',
          850: '#1c1a12',
          900: '#17150f',
          950: '#100e0a',
        },
      },
      boxShadow: {
        'card': '0 1px 2px rgba(22,21,15,.05)',
        'lift': '0 20px 40px -24px rgba(22,21,15,.35)',
        'none': 'none',
      },
      borderRadius: {
        'none': '0', 'sm': '4px', DEFAULT: '6px', 'md': '8px',
        'lg': '10px', 'xl': '12px', '2xl': '16px', '3xl': '20px', 'full': '9999px',
      },
      letterSpacing: {
        'label': '.14em',
        'kicker': '.1em',
      },
    },
  },
  plugins: [],
}
