// Static reference data from the competition CSVs (travel times, handling allowances, calendar).
// Loaded once at start-up; the database holds outlets, vehicles and everything that changes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { contextFromRows, parseCsv, type PlanningContext } from '@waypoint/shared';
import { demoDate } from '../../../prisma/demo-day.ts';

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

/** The working day every screen shows: today in Colombo (or DEMO_DATE when pinned). Read per request, so it rolls over at midnight. */
export const today = (): string => demoDate();

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

const realClock = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

/** Clock for the live screen: real Colombo time. DEMO_CLOCK pins it (e.g. 06:42) to rehearse the walkthrough. */
export function colomboNow(): string {
  return process.env.DEMO_CLOCK || realClock();
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

/**
 * Screen clocks. Every role runs on the same real Colombo time, so all screens agree (drivers use their phone,
 * which shows the same time). DEMO_LOADER_CLOCK / DEMO_STORE_CLOCK pin one role's clock for rehearsals.
 */
export function loaderNow(): string {
  return process.env.DEMO_LOADER_CLOCK || realClock();
}

/** HH:MM in Colombo for a timestamp. */
export const clockOf = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

/**
 * The delivery run the dispatcher, loaders and drivers work on. Until the 16:00 cutoff that is today's run
 * (loading from 02:40, deliveries 03:30–08:00, live tracking); from the cutoff it is the next run, whose orders
 * are now locked, so the dispatcher plans and publishes it in the evening. Store managers keep the calendar day.
 */
export function workingDay(): string {
  const d = today();
  if (process.env.DEMO_DATE) return d;
  return colomboNow() >= ORDER_CUTOFF ? nextOperatingDay(d) : d;
}
export const ORDER_CUTOFF = '16:00';

/** Store manager clock (16:00 cutoff countdown). */
export function storeNow(): string {
  return process.env.DEMO_STORE_CLOCK || realClock();
}
/** A timestamp for HH:MM Colombo time on a date. */
export const atColombo = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00+05:30`);
