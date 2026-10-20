/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        arcade: {
          bg: '#07070f',
          deep: '#0b0b18',
          panel: '#111125',
          panel2: '#1a1a35',
          border: '#33335f',
          text: '#d7e0ff',
          muted: '#7d7dab',
          green: '#39ff14',
          greenDim: '#1fbf00',
          cyan: '#00e5ff',
          magenta: '#ff2e88',
          yellow: '#ffd400',
          orange: '#ff7b00',
          purple: '#a259ff',
          red: '#ff3355',
        },
        // legacy brand tokens retained so untouched components still compile
        brand: {
          300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6',
          600: '#7c3aed', 700: '#6d28d9', 900: '#4c1d95', 950: '#2e1065',
        },
      },
      borderWidth: {
        '3': '3px',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'Courier New', 'monospace'],
        term: ['"VT323"', 'Courier New', 'monospace'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['"JetBrains Mono"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'blink': 'blink 1.05s step-end infinite',
        'scan': 'scan 6s linear infinite',
        'flicker': 'flicker 3.2s linear infinite',
        'float': 'float 4s ease-in-out infinite',
        'pop': 'pop 0.18s ease-out',
        'glow-pulse': 'glowPulse 2.2s ease-in-out infinite',
        'marquee': 'marquee 18s linear infinite',
        'shake': 'shake 0.4s ease-in-out',
      },
      keyframes: {
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
        scan: { '0%': { backgroundPosition: '0 0' }, '100%': { backgroundPosition: '0 100%' } },
        flicker: {
          '0%,100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.72' },
          '94%': { opacity: '1' },
          '97%': { opacity: '0.85' },
        },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        pop: { '0%': { transform: 'scale(0.9)' }, '100%': { transform: 'scale(1)' } },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 0 rgba(57,255,20,0.0)' },
          '50%': { boxShadow: '0 0 18px rgba(57,255,20,0.55)' },
        },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-4px)' }, '75%': { transform: 'translateX(4px)' } },
      },
    },
  },
  plugins: [],
}
