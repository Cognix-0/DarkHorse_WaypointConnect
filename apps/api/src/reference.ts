// Static reference data from the competition CSVs (travel times, handling allowances, calendar).
// Loaded once at start-up; the database holds outlets, vehicles and everything that changes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { contextFromRows, parseCsv, type PlanningContext } from '@waypoint/shared';

const DATA = fileURLToPath(new URL('../../../data/', import.meta.url));
const csv = (f: string) => parseCsv(readFileSync(DATA + f, 'utf8'));

export const baseContext: PlanningContext = contextFromRows(csv('district_travel.csv'), csv('service_allowance.csv'));

export interface CalendarDay {
  date: string;
  dow: string;
  operating: boolean;
  payday: boolean;
  festival: string | null;
  festivalRamp: number;
  holiday: boolean;
  monsoon: boolean;
}
export const calendar = new Map<string, CalendarDay>(
  csv('calendar.csv').map((r) => [r.date!, {
    date: r.date!, dow: r.dow_name!, operating: r.is_operating === '1', payday: r.is_payday === '1', festival: r.festival || null,
    festivalRamp: Number(r.festival_ramp || 0), holiday: r.is_holiday === '1', monsoon: r.monsoon === '1',
  }]),
);

export const DEMO_DATE = process.env.DEMO_DATE ?? '2026-03-25';

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dbDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** The next day the depots operate (skips Sundays and holidays in calendar.csv). */
export function nextOperatingDay(iso: string): string {
  let d = addDays(iso, 1);
  for (let i = 0; i < 14; i++) {
    const c = calendar.get(d);
    if (!c || c.operating) return d;
    d = addDays(d, 1);
  }
  return d;
}
export function previousOperatingDay(iso: string): string {
  let d = addDays(iso, -1);
  for (let i = 0; i < 14; i++) {
    const c = calendar.get(d);
    if (!c || c.operating) return d;
    d = addDays(d, -1);
  }
  return d;
}

/** Order cutoff: 16:00 Colombo (UTC+5:30) on the day before delivery = 10:30 UTC. */
export const cutoffFor = (deliveryIso: string) => new Date(`${addDays(deliveryIso, -1)}T10:30:00.000Z`);

/** "Wed 25 Mar" */
export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

/** Clock for the live screen. DEMO_CLOCK pins it (e.g. 06:42) so the walkthrough looks the same at any hour. */
export function colomboNow(): string {
  if (process.env.DEMO_CLOCK) return process.env.DEMO_CLOCK;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}

const FESTIVAL_NAMES: Record<string, string> = { new_year: 'Sinhala & Tamil New Year', vesak: 'Vesak', christmas: 'Christmas', deepavali: 'Deepavali', poson: 'Poson', esala: 'Esala Perahera', thai_pongal: 'Thai Pongal' };
/** Name of the festival a build-up day leads to (calendar.csv only names the festival day itself). */
export function festivalFor(iso: string): string | null {
  const c = calendar.get(iso);
  if (!c) return null;
  if (c.festival) return FESTIVAL_NAMES[c.festival] ?? c.festival.replaceAll('_', ' ');
  if (c.festivalRamp <= 0) return null;
  let d = iso;
  for (let i = 0; i < 30; i++) {
    d = addDays(d, 1);
    const f = calendar.get(d)?.festival;
    if (f) return FESTIVAL_NAMES[f] ?? f.replaceAll('_', ' ');
  }
  return null;
}
