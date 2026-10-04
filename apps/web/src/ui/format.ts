// Display helpers shared by every role. Numbers use en-US grouping (1,153 kg) as in the Figma file.
export const kg = (n: number) => `${Math.round(n).toLocaleString('en-US')} kg`;
export const tonnes = (n: number) => `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} t`;
export const m3 = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} m³`;
export const num = (n: number) => Math.round(n).toLocaleString('en-US');
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Every time on screen is Sri Lanka time, whatever the device's own time zone. */
export const TIME_ZONE = 'Asia/Colombo';
/** "06:42" (24 h, Sri Lanka time) for a timestamp; now by default. */
export const colomboTime = (d: Date | string | number = new Date()) =>
  new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE });
/** Hour of the day (0–23) in Sri Lanka now. */
export const colomboHour = () => Number(colomboTime().slice(0, 2));

/** "Wed 25 Mar" from YYYY-MM-DD */
export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
/** "Wednesday 25 March 2026" */
export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(',', '');

export const unitLabel = (brand: string) => (brand === 'Fresh' ? 'crates' : brand === 'Style' ? 'cartons' : 'items');
export const titleCase = (s: string) => s.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());

export const REASON_LABEL: Record<string, string> = {
  no_reefer_capacity: 'No reefer space',
  vehicle_full: 'Vehicles full',
  time_window: 'Time window',
  fuel_quota: 'Fuel quota',
  no_vehicle: 'No vehicle',
  other: 'Other',
};

export function generateAutomatedReason(reason: string, outletId?: string): string {
  switch (reason) {
    case 'no_reefer_capacity':
      return `Chilled reefer capacity limit reached for today's run. ${outletId ? `${outletId} order` : 'Your order'} is prioritized first on tomorrow morning's reefer trip.`;
    case 'vehicle_full':
      return `All vehicle payload & volume capacity fully allocated for today. ${outletId ? `${outletId} order` : 'Your order'} is scheduled for priority dispatch on tomorrow's first run.`;
    case 'time_window':
      return `Delivery time window constraint with current vehicle routing schedules today. Rescheduled for earliest arrival tomorrow morning.`;
    case 'fuel_quota':
      return `Depot weekly vehicle fuel quota limit reached for this route today. Scheduled for immediate delivery on the next run.`;
    case 'no_vehicle':
      return `No available transport unit for this route today. Prioritized for immediate delivery on the next scheduled run.`;
    case 'other':
    default:
      return `Delivery deferred due to operational schedule optimization. Scheduled for priority delivery on tomorrow's run.`;
  }
}

export const DOCK_LABEL: Record<string, string> = { rear_dock: 'Rear dock', street: 'Street', mall_bay: 'Mall bay' };

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** "boxes" → "box", "bags" → "bag" (pack names in the goods catalogue) */
export const singular = (p: string) => (p.endsWith('xes') ? p.slice(0, -2) : p.replace(/s$/, ''));
