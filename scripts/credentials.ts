// Prints every sign-in account and its password as CSV. Run where ACCOUNT_SECRET / JWT_SECRET is set
// (the server: `docker compose exec api pnpm -s credentials > credentials.csv`). Never commit the output.
import { allAccounts, passwordFor } from '../prisma/accounts.ts';

const rows = allAccounts().map((a) => [a.role, a.depot ?? '', a.vehicleId ?? a.outletId ?? '', a.name, a.email, passwordFor(a.email)]);
console.log(['role', 'depot', 'vehicle_or_store', 'name', 'email', 'password'].join(','));
for (const r of rows) console.log(r.map((v) => (/[",]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)).join(','));
