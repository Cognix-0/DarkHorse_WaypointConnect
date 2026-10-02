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
        sunk: { DEFAULT: '#F8FAFC', 2: '#FAFBFC' },
        ink: { DEFAULT: '#101828', 2: '#344054', 3: '#667085', 4: '#98A2B3' },
        line: { DEFAULT: '#E4E7EC', strong: '#D0D5DD', soft: '#EEF0F4' },
        primary: { DEFAULT: '#1D4ED8', hover: '#1E40AF', tint: '#EFF4FF', soft: '#DBEAFE', line: '#BFDBFE', faint: '#FBFCFF' },
        nav: { DEFAULT: '#0F172A', active: '#22397A', text: '#E2E8F0', muted: '#94A3B8', icon: '#475B8C', soft: '#B8C4E0', sub: '#8FA0C8', label: '#64748B' },
        ok: { DEFAULT: '#15803D', bright: '#16A34A', tint: '#F0FDF4', soft: '#DCFCE7', online: '#4ADE80' },
        warn: { DEFAULT: '#C2410C', bright: '#EA580C', tint: '#FFF7ED', soft: '#FFEDD5', chip: '#FDBA74', line: '#FED7AA', faint: '#FFFDFA' },
        bad: { DEFAULT: '#DC2626', text: '#B91C1C', tint: '#FEF2F2', soft: '#FEE2E2' },
        offline: { DEFAULT: '#334155', tint: '#F1F5F9', soft: '#E2E8F0' },
        chill: { DEFAULT: '#0369A1', soft: '#E0F2FE', tint: '#F0F9FF' },
        fresh: { DEFAULT: '#15803D', soft: '#DCFCE7' },
        style: { DEFAULT: '#7C3AED', soft: '#EDE9FE' },
        tech: { DEFAULT: '#1D4ED8', soft: '#DBEAFE' },
        teal: '#0E9AA7',
        // Store manager (Figma SM1–SM9 / D-SM1–D-SM9)
        st: {
          navy: '#14306B', outlet: '#1A2C5C', bar: '#E3E7EF', ink: '#111827', muted: '#6B7280',
          tealTint: '#E6F3F6', tealLine: '#BFE0E5',
          green: '#3E9B4F', greenTint: '#E8F6EC', greenLine: '#BFE3C7', greenDark: '#1F5E2B', greenText: '#2F6E3B',
          orange: '#E8801A', orangeTint: '#FFF4E5', orangeLine: '#F5C88A', brown: '#8A4A05', amber: '#B45F06',
          red: '#D93A3A',
        },
        // Driver phone (Figma M1–M8): higher contrast, bigger targets, readable in sunlight.
        drv: {
          header: '#0F1629', page: '#F4F5F9', ink: '#111827', muted: '#6B7280', line: '#E4E7EE', soft: '#EEF0F4',
          primary: '#2A4BD7', tint: '#F3F6FF', tintLine: '#C9D4F8',
          online: '#12351F', offline: '#3A2A0E', amber: '#B45309', amberBg: '#FEF3C7', amberLine: '#F5D9A0', yellow: '#FBBF24',
          red: '#B42318', redBg: '#FDECEA', redLine: '#F5C2BE',
          chip: '#4B5563', field: '#FAFBFD', map: '#EAEFF3', thumb: '#D9DDE6', sign: '#B8BFCE', radio: '#9CA3AF', sub: '#9AA4BF',
        },
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
