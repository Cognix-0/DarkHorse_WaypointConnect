// Every sign-in account: one administrator, one per vehicle (its assigned driver), one per store, and per depot
// one dispatcher and three loaders. Used by the seed and by scripts/credentials.ts, so both always agree.
//
// Passwords are unique per account and never stored in plain text: each is derived from ACCOUNT_SECRET
// (falls back to JWT_SECRET) and the email, so the seed can reset the hashes on every start and
// `pnpm credentials` can print the same list again on the server.
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../packages/shared/src/engine/reference.ts';

export type AccountRole = 'dispatcher' | 'loader' | 'driver' | 'store' | 'admin';
export type DepotName = 'Peliyagoda' | 'Kandy';
export interface Account {
  email: string;
  name: string;
  role: AccountRole;
  depot: DepotName | null;
  outletId: string | null;
  vehicleId: string | null;
}

export const EMAIL_DOMAIN = 'waypoint.lk';
export const DEPOTS: DepotName[] = ['Peliyagoda', 'Kandy'];
export const LOADERS_PER_DEPOT = 3;

const csv = (f: string) => parseCsv(readFileSync(join(process.cwd(), 'data', f), 'utf8'));

// ---- people
const FIRST = ['Ayesha', 'Dilani', 'Tharindu', 'Chamari', 'Sanjeewa', 'Nadeesha', 'Kavinda', 'Ishara', 'Roshan', 'Malsha', 'Supun', 'Hiruni', 'Asela', 'Fathima', 'Ravi', 'Priyanka'];
const LAST = ['Jayasinghe', 'Jayawardena', 'Perera', 'Fernando', 'Wickramasinghe', 'Rajapaksha', 'Senanayake', 'Abeysekara', 'Gunasekara', 'Dissanayake', 'Karunaratne', 'Mohamed', 'Nadarajah'];
const DRIVER_FIRST = ['Kusal', 'Saman', 'Ajith', 'Chaminda', 'Ruwan', 'Pradeep', 'Mahesh', 'Kamal', 'Dinesh', 'Lasantha', 'Nuwan', 'Sunil'];
const DRIVER_LAST = ['Silva', 'Kumara', 'Perera', 'Bandara', 'Rathnayake', 'Wijesinghe', 'Gunawardena', 'Herath', 'Dias', 'Jayasuriya', 'Ekanayake'];

/** The demo store (Waypoint Fresh, Gampaha) and the demo driver's truck keep their names from the walkthrough. */
export const DEMO_STORE = 'OUT026';
export const DEMO_VEHICLE = 'VEH024';

export function storeManager(outletId: string): string {
  if (outletId === DEMO_STORE) return 'Nimali Perera';
  const n = Number(outletId.replace(/\D/g, ''));
  return `${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`;
}

// (i mod 12, (i + i div 12) mod 11) never repeats for the first 132 people.
const driverName = (i: number) => `${DRIVER_FIRST[i % DRIVER_FIRST.length]} ${DRIVER_LAST[(i + Math.floor(i / DRIVER_FIRST.length)) % DRIVER_LAST.length]}`;

/** One driver per vehicle, never the same person on two vehicles. */
export function driverNames(vehicleIds: string[]): Map<string, string> {
  const names = new Map<string, string>();
  vehicleIds.forEach((id, i) => names.set(id, id === DEMO_VEHICLE ? 'Nimal Fernando' : driverName(i)));
  const unique = new Set(names.values());
  if (unique.size !== names.size) throw new Error('Two vehicles got the same driver: extend DRIVER_FIRST / DRIVER_LAST in prisma/accounts.ts');
  return names;
}

/** Spare drivers with no vehicle, so the admin can swap someone in. */
export const SPARE_DRIVERS = 6;

/** The starting driver list: DRV001… one per vehicle (in vehicle order), then the spares. */
export function driverRoster(vehicleIds: string[]): { id: string; name: string; phone: string; licenseNo: string; vehicleId: string | null }[] {
  const names = driverNames(vehicleIds);
  const people = vehicleIds.map((v) => ({ name: names.get(v)!, vehicleId: v as string | null }));
  for (let i = 0; i < SPARE_DRIVERS; i++) people.push({ name: driverName(vehicleIds.length + i), vehicleId: null });
  return people.map((p, i) => ({
    id: `DRV${String(i + 1).padStart(3, '0')}`, ...p,
    phone: `+94 7${(i * 3) % 8} ${String(200 + ((i * 53) % 700))} ${String(1000 + ((i * 389) % 9000))}`,
    licenseNo: `B${String(4100000 + i * 7919).slice(0, 7)}`,
  }));
}

const DISPATCHERS: Record<DepotName, string> = { Peliyagoda: 'Ruwan Perera', Kandy: 'Anjali Wickramasinghe' };
const LOADERS: Record<DepotName, string[]> = {
  Peliyagoda: ['Kasun Silva', 'Lahiru Fernando', 'Chathura Mendis'],
  Kandy: ['Isuru Bandara', 'Thilina Rathnayake', 'Gayan Ekanayake'],
};

export function allAccounts(): Account[] {
  const vehicles = csv('vehicles.csv');
  const drivers = driverNames(vehicles.map((v) => v.vehicle_id!));
  const out: Account[] = [
    { email: `admin@${EMAIL_DOMAIN}`, name: 'System Administrator', role: 'admin', depot: null, outletId: null, vehicleId: null },
  ];
  for (const depot of DEPOTS) {
    const d = depot.toLowerCase();
    out.push({ email: `dispatcher.${d}@${EMAIL_DOMAIN}`, name: DISPATCHERS[depot], role: 'dispatcher', depot, outletId: null, vehicleId: null });
    for (let i = 1; i <= LOADERS_PER_DEPOT; i++) {
      out.push({ email: `loader${i}.${d}@${EMAIL_DOMAIN}`, name: LOADERS[depot][i - 1]!, role: 'loader', depot, outletId: null, vehicleId: null });
    }
  }
  for (const v of vehicles) {
    out.push({ email: `${v.vehicle_id!.toLowerCase()}@${EMAIL_DOMAIN}`, name: drivers.get(v.vehicle_id!)!, role: 'driver', depot: v.depot as DepotName, outletId: null, vehicleId: v.vehicle_id! });
  }
  for (const o of csv('outlets.csv')) {
    out.push({ email: `${o.outlet_id!.toLowerCase()}@${EMAIL_DOMAIN}`, name: storeManager(o.outlet_id!), role: 'store', depot: null, outletId: o.outlet_id!, vehicleId: null });
  }
  return out;
}

// No 0/O, 1/l/I: easy to read out and type on a phone.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function accountSecret(): string {
  const s = process.env.ACCOUNT_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('Set ACCOUNT_SECRET (or JWT_SECRET) so every account gets its own password.');
  return s;
}

/** e.g. "Kx7m-Q2vd-9pLt": 12 characters from an HMAC of the email. */
export function passwordFor(email: string, secret = accountSecret()): string {
  const mac = createHmac('sha256', secret).update(email.toLowerCase()).digest();
  let p = '';
  for (let i = 0; i < 12; i++) p += ALPHABET[mac[i]! % ALPHABET.length];
  return `${p.slice(0, 4)}-${p.slice(4, 8)}-${p.slice(8, 12)}`;
}

/** A fresh random password in the same readable format, for an admin reset or a new account. */
export function randomPassword(): string {
  return passwordFor(randomBytes(16).toString('hex'), randomBytes(32).toString('hex'));
}
