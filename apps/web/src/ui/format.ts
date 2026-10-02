// Display helpers shared by every role. Numbers use en-US grouping (1,153 kg) as in the Figma file.
export const kg = (n: number) => `${Math.round(n).toLocaleString('en-US')} kg`;
export const tonnes = (n: number) => `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} t`;
export const m3 = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} m³`;
export const num = (n: number) => Math.round(n).toLocaleString('en-US');
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

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
export const DOCK_LABEL: Record<string, string> = { rear_dock: 'Rear dock', street: 'Street', mall_bay: 'Mall bay' };

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
