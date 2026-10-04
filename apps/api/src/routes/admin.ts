// Administrator: who can sign in, which driver is on which vehicle, and the system's health.
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import {
  AssignDriverRequest, CreateAccountRequest, CreateDriverRequest, StartDemoRequest, UpdateAccountRequest, type TDemoStatusResponse,
  type TAccountPasswordResponse, type TAdminAccountDto, type TAdminAccountsResponse, type TAdminFleetResponse,
  type TAdminSystemResponse, type TDriverDto, type TRebuildDayResponse,
} from '@waypoint/shared/contract';
import { prisma } from '../db.ts';
import { requireRole } from '../auth.ts';
import { HttpError } from '../plans.ts';
import { colomboNow, dbDate, workingDay } from '../reference.ts';
import { randomPassword } from '../../../../prisma/accounts.ts';
import { buildDemoDay } from '../../../../prisma/demo-day.ts';
import { DEMO_CLOCKS, DEMO_DAY, DEMO_STORE, demo, endDemo, resetDemoData, startDemo } from '../demo.ts';
import { displayRef, tripState } from '../day.ts';

const ROLES = ['admin', 'dispatcher', 'loader', 'driver', 'store'] as const;
const startedAt = Date.now();

type UserRow = Prisma.UserGetPayload<object>;
const accountDto = (u: UserRow): TAdminAccountDto => ({
  id: u.id, email: u.email, name: u.name, role: u.role, depot: u.depot, outletId: u.outletId, vehicleId: u.vehicleId,
  active: u.active, customPassword: u.customPassword, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString(),
});
const driverDto = (d: { id: string; name: string; phone: string | null; licenseNo: string | null; vehicle: { id: string } | null }): TDriverDto =>
  ({ id: d.id, name: d.name, phone: d.phone, licenseNo: d.licenseNo, vehicleId: d.vehicle?.id ?? null });

async function roleCounts() {
  const rows = await prisma.user.groupBy({ by: ['role', 'active'], _count: { _all: true } });
  return ROLES.map((role) => ({
    role,
    total: rows.filter((r) => r.role === role).reduce((n, r) => n + r._count._all, 0),
    active: rows.filter((r) => r.role === role && r.active).reduce((n, r) => n + r._count._all, 0),
  }));
}

/** The vehicle's own sign-in account shows the assigned driver's name. */
async function syncVehicleAccount(tx: Prisma.TransactionClient, vehicleId: string, driverName: string | null) {
  await tx.user.updateMany({ where: { vehicleId, role: 'driver' }, data: { name: driverName ?? `${vehicleId} · no driver assigned` } });
}

export async function adminRoutes(app: FastifyInstance) {
  const admin = { preHandler: requireRole('admin') };

  // ---- system
  app.get('/admin/system', admin, async (): Promise<TAdminSystemResponse> => {
    const t0 = Date.now();
    let dbOk = true;
    try { await prisma.$queryRaw`SELECT 1`; } catch { dbOk = false; }
    const latencyMs = Date.now() - t0;
    const date = workingDay();
    const [accounts, drivers, assigned, vehicles, plans, orders] = await Promise.all([
      roleCounts(),
      prisma.driver.count(),
      prisma.vehicle.count({ where: { driverId: { not: null } } }),
      prisma.vehicle.findMany({ select: { depot: true, driverId: true } }),
      prisma.plan.findMany({ where: { date: dbDate(date) }, select: { depot: true, status: true, version: true } }),
      prisma.order.groupBy({ by: ['outletId'], where: { deliveryDate: dbDate(date), status: { not: 'cancelled' } }, _count: { _all: true } }),
    ]);
    const outletDepot = new Map((await prisma.outlet.findMany({ select: { id: true, depot: true } })).map((o) => [o.id, o.depot]));
    const depots = (['Peliyagoda', 'Kandy'] as const).map((depot) => {
      const plan = plans.find((p) => p.depot === depot);
      const vs = vehicles.filter((v) => v.depot === depot);
      return {
        depot,
        ordersToday: orders.filter((o) => outletDepot.get(o.outletId) === depot).reduce((n, o) => n + o._count._all, 0),
        planStatus: (plan ? plan.status : 'none') as 'none' | 'draft' | 'published',
        planVersion: plan?.version ?? 0,
        vehicles: vs.length,
        vehiclesWithoutDriver: vs.filter((v) => !v.driverId).length,
      };
    });
    return {
      serverTime: new Date().toISOString(), date, clock: colomboNow(), timeZone: 'Asia/Colombo',
      pinnedDate: !!process.env.DEMO_DATE, uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      database: { ok: dbOk, latencyMs }, accounts, drivers: { total: drivers, assigned, spare: drivers - assigned }, depots,
    };
  });

  /** Builds today's scenario orders if they are missing (e.g. after the database was emptied). Never duplicates. */
  app.post('/admin/system/rebuild-today', admin, async (): Promise<TRebuildDayResponse> => {
    const date = workingDay();
    const created = await buildDemoDay(prisma, date);
    return { date, created, orders: await prisma.order.count({ where: { deliveryDate: dbDate(date) } }) };
  });

  // ---- accounts
  app.get('/admin/accounts', admin, async (): Promise<TAdminAccountsResponse> => {
    const users = await prisma.user.findMany({ orderBy: [{ role: 'asc' }, { email: 'asc' }] });
    return { accounts: users.map(accountDto), counts: await roleCounts() };
  });

  app.post('/admin/accounts', admin, async (req): Promise<TAccountPasswordResponse> => {
    const body = CreateAccountRequest.parse(req.body);
    // A loader works at one depot. A dispatcher may have one, or none (switches between both depots).
    if (body.role === 'loader' && !body.depot) throw new HttpError(400, 'Choose the depot this loader works at.');
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw new HttpError(409, `${body.email} already has an account.`);
    const password = randomPassword();
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, role: body.role, depot: body.role === 'admin' ? null : body.depot, passwordHash: await bcrypt.hash(password, 8), customPassword: true },
    });
    return { account: accountDto(user), password };
  });

  app.patch('/admin/accounts/:id', admin, async (req) => {
    const { id } = req.params as { id: string };
    const body = UpdateAccountRequest.parse(req.body);
    if (body.active === false && id === req.user.id) throw new HttpError(400, 'You cannot switch off your own account.');
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, 'Account not found.');
    if (body.active === false && user.role === 'admin' && (await prisma.user.count({ where: { role: 'admin', active: true } })) <= 1) {
      throw new HttpError(400, 'Keep at least one administrator switched on.');
    }
    if (body.name && user.role === 'driver') throw new HttpError(400, 'A vehicle account carries its driver\'s name: change the driver on the vehicle instead.');
    return accountDto(await prisma.user.update({ where: { id }, data: body }));
  });

  app.post('/admin/accounts/:id/reset-password', admin, async (req): Promise<TAccountPasswordResponse> => {
    const { id } = req.params as { id: string };
    if (!(await prisma.user.findUnique({ where: { id } }))) throw new HttpError(404, 'Account not found.');
    const password = randomPassword();
    const user = await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 8), customPassword: true } });
    return { account: accountDto(user), password };
  });

  // ---- drivers on vehicles
  app.get('/admin/fleet', admin, async (): Promise<TAdminFleetResponse> => {
    const [vehicles, drivers, accounts] = await Promise.all([
      prisma.vehicle.findMany({ include: { driver: { include: { vehicle: { select: { id: true } } } } }, orderBy: { id: 'asc' } }),
      prisma.driver.findMany({ include: { vehicle: { select: { id: true } } }, orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: { role: 'driver', vehicleId: { not: null } }, select: { vehicleId: true, email: true, active: true } }),
    ]);
    const acc = new Map(accounts.map((a) => [a.vehicleId!, a]));
    return {
      vehicles: vehicles.map((v) => ({
        id: v.id, type: v.type, temp: v.temp, depot: v.depot, weightCapKg: v.weightCapKg,
        driver: v.driver ? driverDto(v.driver) : null,
        accountEmail: acc.get(v.id)?.email ?? null, accountActive: acc.get(v.id)?.active ?? false,
      })),
      drivers: drivers.map(driverDto),
    };
  });

  app.post('/admin/drivers', admin, async (req): Promise<TDriverDto> => {
    const body = CreateDriverRequest.parse(req.body);
    if (await prisma.driver.findFirst({ where: { name: { equals: body.name, mode: 'insensitive' } } })) {
      throw new HttpError(409, `${body.name} is already on the driver list.`);
    }
    const last = await prisma.driver.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
    const next = `DRV${String(Number(last?.id.replace(/\D/g, '') ?? 0) + 1).padStart(3, '0')}`;
    const d = await prisma.driver.create({ data: { id: next, name: body.name, phone: body.phone || null, licenseNo: body.licenseNo || null }, include: { vehicle: { select: { id: true } } } });
    return driverDto(d);
  });

  /** Puts a driver on a vehicle (or takes them off). A driver is never on two vehicles. */
  app.put('/admin/vehicles/:id/driver', admin, async (req) => {
    const { id } = req.params as { id: string };
    const body = AssignDriverRequest.parse(req.body);
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new HttpError(404, 'Vehicle not found.');
    await prisma.$transaction(async (tx) => {
      if (body.driverId === null) {
        await tx.vehicle.update({ where: { id }, data: { driverId: null, driverName: null } });
        await syncVehicleAccount(tx, id, null);
        return;
      }
      const driver = await tx.driver.findUnique({ where: { id: body.driverId }, include: { vehicle: { select: { id: true } } } });
      if (!driver) throw new HttpError(404, 'Driver not found.');
      const from = driver.vehicle?.id;
      if (from && from !== id) {
        if (!body.move) throw new HttpError(409, `${driver.name} already drives ${from}. Move them to ${id}?`, { code: 'DRIVER_ON_OTHER_VEHICLE', from });
        await tx.vehicle.update({ where: { id: from }, data: { driverId: null, driverName: null } });
        await syncVehicleAccount(tx, from, null);
      }
      await tx.vehicle.update({ where: { id }, data: { driverId: driver.id, driverName: driver.name } });
      await syncVehicleAccount(tx, id, driver.name);
    });
    return { ok: true };
  });
}

// ---- demo mode
export async function adminDemoRoutes(app: FastifyInstance) {
  const admin = { preHandler: requireRole('admin') };

  const status = async (): Promise<TDemoStatusResponse> => {
    const running = demo();
    const date = dbDate(DEMO_DAY);
    const [plan, orders] = await Promise.all([
      prisma.plan.findUnique({
        where: { date_depot: { date, depot: 'Peliyagoda' } },
        include: { trips: { include: { stops: { include: { events: { select: { type: true } } } } } }, deferrals: { include: { order: { select: { outletId: true, id: true, sourceRef: true, temp: true } } }, orderBy: { createdAt: 'asc' } } },
      }),
      prisma.order.findMany({ where: { deliveryDate: date, outletId: DEMO_STORE }, include: { stop: { include: { trip: true } } }, orderBy: { placedAt: 'asc' } }),
    ]);
    const deferredIds = new Set(plan?.deferrals.map((d) => d.orderId) ?? []);
    // The story follows the store's live order to whichever vehicle the plan puts it on.
    const live = orders.find((o) => !o.sourceRef);
    const vehicleId = live?.stop?.trip.vehicleId ?? null;
    const [vehicle, account] = vehicleId
      ? await Promise.all([prisma.vehicle.findUnique({ where: { id: vehicleId } }), prisma.user.findFirst({ where: { vehicleId, role: 'driver' }, select: { email: true } })])
      : [null, null];
    const trips = (plan?.trips ?? []).filter((t) => t.vehicleId === vehicleId).sort((a, b) => a.tripNo - b.tripNo);
    // A deferred store to show the deferral message and its answer (prefer chilled: the payday story).
    const defs = (plan?.deferrals ?? []).filter((d) => d.order.outletId !== DEMO_STORE);
    const pick = defs.find((d) => d.order.temp === 'chilled') ?? defs[0];
    const pickAccount = pick ? await prisma.user.findFirst({ where: { outletId: pick.order.outletId, role: 'store' }, select: { email: true } }) : null;
    // The store answers on its latest deferral record for that order.
    const pickAnswer = pick ? (await prisma.deferral.findFirst({ where: { orderId: pick.orderId }, orderBy: { createdAt: 'desc' }, select: { storeResponse: true } }))?.storeResponse : null;
    return {
      active: !!running, date: DEMO_DAY, storeDate: running?.storeDate ?? DEMO_DAY, clocks: DEMO_CLOCKS,
      startedAt: running?.startedAt ?? null, endsAt: running?.endsAt ?? null,
      story: {
        storeId: DEMO_STORE, planStatus: plan ? plan.status : 'none', planVersion: plan?.version ?? 0,
        ordersOnRun: await prisma.order.count({ where: { deliveryDate: date, outlet: { depot: 'Peliyagoda' }, status: { not: 'cancelled' } } }),
        deferred: deferredIds.size,
        storeOrders: orders.map((o) => ({
          ref: displayRef(o), temp: o.temp, status: o.status, placedLive: !o.sourceRef,
          vehicleId: o.stop?.trip.vehicleId ?? null, tripNo: o.stop?.trip.tripNo ?? null, deferred: deferredIds.has(o.id) || o.status === 'deferred',
        })),
        vehicle: {
          id: vehicleId, driverName: vehicle?.driverName ?? null, accountEmail: account?.email ?? null,
          trips: trips.map((t) => {
            const done = t.stops.filter((x) => x.events.some((e) => e.type === 'stop.delivered' || e.type === 'stop.failed')).length;
            const state = tripState(t);
            return { tripNo: t.tripNo, district: t.district, status: (state === 'departed' && t.stops.length && done === t.stops.length ? 'done' : state) as 'open' | 'loading' | 'sealed' | 'departed' | 'done', stops: t.stops.length, delivered: done };
          }),
        },
        deferredStore: pick ? {
          outletId: pick.order.outletId, ref: displayRef(pick.order), accountEmail: pickAccount?.email ?? null,
          answer: (pickAnswer ?? 'waiting') as 'waiting' | 'accepted' | 'cancelled',
        } : null,
      },
    };
  };

  app.get('/admin/demo', admin, status);
  app.post('/admin/demo/start', admin, async (req) => {
    const body = StartDemoRequest.parse(req.body);
    await startDemo(body.hours, body.reset);
    return status();
  });
  app.post('/admin/demo/reset', admin, async () => {
    if (!demo()) throw new HttpError(400, 'Start demo mode first.');
    await resetDemoData();
    return status();
  });
  app.post('/admin/demo/end', admin, async () => {
    await endDemo();
    return status();
  });
}
