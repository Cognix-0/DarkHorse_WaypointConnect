import type { Config } from 'tailwindcss';

// Design tokens from the Waypoint Connect Figma file. Member 4 owns this file:
// copy any changed value from Figma Dev Mode here, never as a raw hex in a component.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { navy: '#1B3A6B', 'navy-hover': '#13294D', 'navy-tint': '#E6ECF5', teal: '#0E9AA7', 'teal-text': '#0B7C87' },
        page: '#F4F6F8', surface: '#FFFFFF', sunk: '#EAEEF2', ink: { DEFAULT: '#0F1B2D', 2: '#3E4A5A', 3: '#647183' },
        line: { DEFAULT: '#D6DCE3', strong: '#8A949E' },
        ok: { DEFAULT: '#1B6E2F', tint: '#E4F2E7' },
        warn: { DEFAULT: '#FFB000', text: '#7A3B00', tint: '#FFF1CC' },
        bad: { DEFAULT: '#B3221C', tint: '#FCE8E6' },
        chill: { DEFAULT: '#006A94', tint: '#DFF1F8' },
        offline: { DEFAULT: '#4F4866', tint: '#ECEAF3' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        display: ['"IBM Plex Sans Condensed"', '"Arial Narrow"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      minHeight: { touch: '56px', field: '64px' },
    },
  },
  plugins: [],
} satisfies Config;
