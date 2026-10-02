import type { Config } from 'tailwindcss';

// Design tokens from the final Figma file "Waypoint Connect – Team Dark Horse" (dispatcher frames D1–D6).
// Member 4 owns this file: copy any changed value from Figma Dev Mode here, never as a raw hex in a component.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#F4F6FA',
        surface: '#FFFFFF',
        sunk: '#F8FAFC',
        ink: { DEFAULT: '#101828', 2: '#344054', 3: '#667085', 4: '#98A2B3' },
        line: { DEFAULT: '#E4E7EC', strong: '#D0D5DD' },
        primary: { DEFAULT: '#1D4ED8', hover: '#1E40AF', tint: '#EFF4FF', soft: '#DBEAFE' },
        nav: { DEFAULT: '#0F172A', active: '#22397A', text: '#E2E8F0', muted: '#94A3B8', icon: '#475B8C' },
        ok: { DEFAULT: '#15803D', bright: '#16A34A', tint: '#F0FDF4', soft: '#DCFCE7', online: '#4ADE80' },
        warn: { DEFAULT: '#C2410C', bright: '#EA580C', tint: '#FFF7ED', soft: '#FFEDD5', chip: '#FDBA74' },
        bad: { DEFAULT: '#DC2626', text: '#B91C1C', tint: '#FEF2F2', soft: '#FEE2E2' },
        offline: { DEFAULT: '#334155', tint: '#F1F5F9', soft: '#E2E8F0' },
        chill: { DEFAULT: '#0369A1', soft: '#E0F2FE' },
        fresh: { DEFAULT: '#15803D', soft: '#DCFCE7' },
        style: { DEFAULT: '#7C3AED', soft: '#EDE9FE' },
        tech: { DEFAULT: '#1D4ED8', soft: '#DBEAFE' },
        teal: '#0E9AA7',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: { '2xs': ['11px', '14px'] },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,0.05)', toast: '0 12px 32px rgba(16,24,40,0.18)' },
      minHeight: { touch: '56px', field: '64px' },
    },
  },
  plugins: [],
} satisfies Config;
