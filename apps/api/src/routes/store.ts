// Store manager (SM1–SM9): order before the 16:00 cutoff, follow the order, track the truck, confirm receipt,
// answer a deferral, and see receipts. Every route works on the signed-in manager's own outlet only.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { orderTypeLabel, catalogueFor, storeOrderLines, toHHMM, toMin, type Brand, type Temp } from '@waypoint/shared';
import {
  DeferralResponseRequest, ReceiptRequest, StoreOrderRequest,
  type TCutoffDto, type TPod, type TStoreCatalogueResponse, type TStoreOrderCard, type TStoreOrderDetail, type TStoreOrdersResponse,
  type TStoreOutletDto, type TStoreReceiptsResponse, type TStoreTodayResponse, type TStoreNotificationDto,
} from '@waypoint/shared/contract';
import { requireRole } from '../auth.ts';
import { prisma } from '../db.ts';
import { addDays, atColombo, baseContext, calendar, clockOf, dbDate, DEMO_DATE, isoOf, nextOperatingDay, shortDate, storeNow } from '../reference.ts';
import { HttpError } from '../plans.ts';
import { alertDispatcher, emit, notifyStore } from '../events.ts';
import { displayRef } from '../day.ts';
import { kindOf, unitLabelOf } from '../ops.ts';

const orderInclude = {
  outlet: true,
  lines: { orderBy: { seq: 'asc' } },
  deferrals: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
  receipt: true,
  stop: { include: { trip: { include: { plan: true, vehicle: true, stops: { orderBy: { seq: 'asc' } } } }, events: { orderBy: { occurredAt: 'asc' } } } },
} satisfies Prisma.OrderInclude;
type Row = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const CUTOFF = '16:00';
const OUTLET_NAME: Record<string, string> = { Fresh: 'Waypoint Fresh', Style: 'Waypoint Style', Tech: 'Waypoint Tech' };
const isCarry = (o: { sourceRef: string | null }) => !!o.sourceRef && (o.sourceRef.startsWith('carry:') || o.sourceRef.startsWith('short:'));
const win = (hhmm: string) => ({ from: toHHMM(toMin(hhmm) - 10), to: toHHMM(toMin(hhmm) + 20) });

function ctxOf(req: FastifyRequest) {
  const outletId = req.user.outletId;
  if (!outletId) throw new HttpError(400, 'This account is not linked to a store.');
  const q = req.query as { date?: string };
  const today = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : DEMO_DATE;
  const now = storeNow();
  const forDate = nextOperatingDay(today);
  const minutesLeft = toMin(CUTOFF) - toMin(now);
  const cutoff: TCutoffDto = { forDate, closesAt: CUTOFF, minutesLeft, open: minutesLeft > 0, nextIfLate: nextOperatingDay(forDate) };
  return { outletId, today, now, cutoff, orderDate: cutoff.open ? forDate : cutoff.nextIfLate };
}

async function outletOf(id: string): Promise<TStoreOutletDto & { brand: Brand }> {
  const o = await prisma.outlet.findUnique({ where: { id } });
  if (!o) throw new HttpError(404, 'Outlet not found');
  return {
    id: o.id, brand: o.brand, district: o.district, depot: o.depot, name: `${OUTLET_NAME[o.brand]}, ${o.district}`,
    windowOpen: o.windowOpen, windowClose: o.windowClose, dockType: o.dockType, parking: o.parking, managerName: o.managerName,
  };
}

/** Stores only see a deferral once the plan is published (until then the dispatcher may still change it). */
const published = (o: Row) => (o.stop?.trip.plan.version ?? o.deferrals[0]?.plan?.version ?? 0) > 0;

function card(o: Row, cutoff: TCutoffDto): TStoreOrderCard {
  const unitLabel = unitLabelOf(o.outlet.brand);
  const stop = o.stop;
  const pub = published(o);
  const def = o.deferrals[0];
  let stage: TStoreOrderCard['stage'] = 'received';
  let statusText = isCarry(o) ? 'Rescheduled · first in the queue' : 'Received · planned after 4 PM';
  if (o.status === 'cancelled') { stage = 'cancelled'; statusText = 'Cancelled'; }
  else if (o.status === 'received') { stage = 'confirmed'; statusText = o.receipt?.issue ? 'Delivered · issue reported' : 'Delivered · confirmed'; }
  else if (o.status === 'delivered') { stage = 'delivered'; statusText = 'Delivered · confirm receipt'; }
  else if (o.status === 'failed') { stage = 'failed'; statusText = 'Not delivered · being rescheduled'; }
  else if (o.status === 'deferred' && pub && def) { stage = 'deferred'; statusText = `Deferred to ${shortDate(isoOf(def.newDate))}`; }
  else if (o.status === 'out_for_delivery') { stage = 'on_the_way'; statusText = stop?.status === 'arrived' ? 'Driver has arrived' : 'On the way'; }
  else if (o.status === 'loaded') { stage = 'loaded'; statusText = `Loaded at ${o.outlet.depot}`; }
  else if (o.status === 'planned' && pub && stop) { stage = 'scheduled'; statusText = `Scheduled · ${win(stop.plannedArrival).from}–${win(stop.plannedArrival).to}`; }
  const deliveredAt = stop?.deliveredAt ?? o.receipt?.deliveredAt ?? null;
  return {
    id: o.id, ref: displayRef(o), deliveryDate: isoOf(o.deliveryDate), temp: o.temp, typeLabel: orderTypeLabel(o.outlet.brand, o.temp),
    units: o.units, unitLabel, weightKg: o.weightKg, stage, statusText,
    arrival: stop && pub && ['scheduled', 'loaded', 'on_the_way'].includes(stage) ? win(stop.plannedArrival) : null,
    deliveredAt: deliveredAt?.toISOString() ?? null,
    needsReceipt: o.status === 'delivered',
    editable: o.status === 'placed' && !isCarry(o) && (isoOf(o.deliveryDate) === cutoff.nextIfLate || (cutoff.open && isoOf(o.deliveryDate) === cutoff.forDate)),
    deferredTo: stage === 'deferred' && def ? isoOf(def.newDate) : null,
  };
}

const REASON_TEXT: Record<string, string> = {
  no_reefer_capacity: 'Refrigerated vehicles were fully allocated.',
  vehicle_full: 'Every vehicle that can reach you was full.',
  time_window: 'No vehicle could reach you inside your delivery window.',
  fuel_quota: 'The vehicles that serve you had used their weekly fuel allowance.',
  no_vehicle: 'No suitable vehicle was available.',
  other: 'The dispatcher could not fit this order on the run.',
};

async function detail(o: Row, cutoff: TCutoffDto, today: string): Promise<TStoreOrderDetail> {
  const c = card(o, cutoff);
  const outlet = await outletOf(o.outletId);
  const stop = o.stop;
  const trip = stop?.trip;
  const receiptLines = (o.receipt?.lines ?? []) as { lineId: string; received: number; status: 'ok' | 'short' | 'damaged' }[];
  const lines = o.lines.map((l) => {
    const r = receiptLines.find((x) => x.lineId === l.id);
    return { id: l.id, product: l.product, pack: l.pack, packSize: l.packSize, packs: l.packs, ordered: l.ordered, shortFromDock: l.shortPacks, received: r?.received ?? null, status: r?.status ?? null };
  });

  const order = ['received', 'scheduled', 'loaded', 'on_the_way', 'delivered', 'confirmed'];
  const at = order.indexOf(c.stage);
  const step = (key: string, label: string, sub: string, idx: number) => ({ key, label, sub, done: idx === 0 || at >= idx, current: at >= 0 && at === idx - 1 });
  const timeline = [
    step('received', 'Received', clockOf(o.placedAt), 0),
    step('scheduled', 'Scheduled', c.arrival ? `Arrives ${c.arrival.from}–${c.arrival.to}` : 'After the 4:00 PM cutoff', 1),
    step('loaded', 'Loaded', trip?.sealedAt ? `${o.outlet.depot} dock · ${clockOf(trip.sealedAt)}` : `${o.outlet.depot} dock`, 2),
    step('delivered', 'Delivered', c.deliveredAt ? clockOf(new Date(c.deliveredAt)) : 'Arrival time shown here', 4),
  ];

  // SM4 tracking: from the plan, corrected by how late the driver is running.
  let tracking: TStoreOrderDetail['tracking'] = null;
  if (stop && trip && published(o) && (c.stage === 'loaded' || c.stage === 'on_the_way')) {
    const evs = await prisma.deliveryEvent.findMany({ where: { stop: { tripId: trip.id } }, include: { stop: true }, orderBy: { occurredAt: 'asc' } });
    const arr = evs.filter((e) => e.type === 'stop.arrived').at(-1);
    const raw = arr ? toMin(clockOf(arr.occurredAt)) - toMin(arr.stop.plannedArrival) : 0;
    const late = raw > 0 && raw <= 180 ? raw : 0;
    const eta = toHHMM(toMin(stop.plannedArrival) + late);
    const handling = baseContext.allowance[`${o.outlet.brand}|${o.outlet.dockType}`] ?? 15;
    tracking = {
      vehicleId: trip.vehicleId, vehicleKind: kindOf(trip.vehicle), loadedAt: trip.sealedAt?.toISOString() ?? null, departedAt: trip.departedAt?.toISOString() ?? null,
      stopsAway: trip.stops.filter((s) => s.seq < stop.seq && s.status !== 'delivered' && s.status !== 'failed').length,
      eta, onTime: toMin(eta) <= toMin(o.outlet.windowClose), handlingMin: handling, readyBy: toHHMM(toMin(eta) + handling),
      lastUpdate: evs.at(-1)?.occurredAt.toISOString() ?? null,
    };
  }

  let pod: TPod | null = null;
  const delivered = stop?.events.filter((e) => e.type === 'stop.delivered').at(-1);
  if (delivered && trip) pod = { receiverName: delivered.receiverName, at: delivered.occurredAt.toISOString(), photo: delivered.photo, signature: delivered.signature, driverName: trip.vehicle.driverName, vehicleId: trip.vehicleId };

  // SM6: the deferral (on the original order, or on the order carried to the new day)
  let deferral: TStoreOrderDetail['deferral'] = null;
  const origId = o.sourceRef?.startsWith('carry:') ? o.sourceRef.slice(6) : o.id;
  const orig = origId === o.id ? o : await prisma.order.findUnique({ where: { id: origId }, include: orderInclude });
  const d = orig?.deferrals[0];
  if (orig && d && (orig.status === 'deferred' || isCarry(o)) && published(orig)) {
    const vehicles = await prisma.vehicle.findMany({ where: { depot: o.outlet.depot }, include: { dayStatus: { where: { date: orig.deliveryDate } } } });
    const workshopReefers = vehicles.filter((v) => v.temp === 'reefer' && v.dayStatus.length).length;
    const cal = calendar.get(isoOf(orig.deliveryDate));
    let why = REASON_TEXT[d.reason] ?? REASON_TEXT.other!;
    if (d.reason === 'no_reefer_capacity') why = `Refrigerated vehicles at ${o.outlet.depot} were fully allocated.${cal?.payday ? ' It was payday, the busiest chilled day of the month.' : ''}${workshopReefers ? ` ${workshopReefers} chilled-capable vehicles were in the workshop.` : ''}`;
    if (d.note) why += ` Dispatcher's note: ${d.note}`;
    const last = await prisma.order.findFirst({ where: { outletId: o.outletId, temp: o.temp, status: { in: ['delivered', 'received'] } }, orderBy: { deliveryDate: 'desc' } });
    const prevDeferred = await prisma.order.count({ where: { outletId: o.outletId, temp: o.temp, status: 'deferred', deliveryDate: dbDate(addDays(isoOf(orig.deliveryDate), -1)) } });
    const carried = isCarry(o) ? o : await prisma.order.findFirst({ where: { sourceRef: `carry:${orig.id}` }, include: orderInclude });
    deferral = {
      reason: d.reason, reasonText: why, type: d.type, recordedAt: (d.plan?.publishedAt ?? d.createdAt).toISOString(),
      fromDate: isoOf(orig.deliveryDate), newDate: isoOf(d.newDate),
      newArrival: carried?.stop && carried.stop.trip.plan.version > 0 ? win(carried.stop.plannedArrival) : { from: o.outlet.windowOpen, to: toHHMM(toMin(o.outlet.windowOpen) + 30) },
      firstInQueue: true, unitsLate: orig.units, runsSkipped: 1 + prevDeferred,
      daysSinceLast: last ? Math.round((dbDate(today).getTime() - last.deliveryDate.getTime()) / 86_400_000) : 0,
      lastServed: last ? isoOf(last.deliveryDate) : null,
      response: (d.storeResponse as 'accepted' | 'cancelled' | null) ?? null,
    };
  }

  const issues = receiptLines.filter((x) => x.status !== 'ok').map((x) => {
    const l = o.lines.find((y) => y.id === x.lineId);
    return `${l?.product ?? 'Item'}: ${x.received} of ${(l?.packs ?? 0) - (l?.shortPacks ?? 0)} ${l?.pack ?? ''} received${x.status === 'damaged' ? ', damaged' : ''}`;
  });
  return {
    order: c, outlet, placedAt: o.placedAt.toISOString(), lines, timeline, tracking, pod, deferral,
    receipt: o.receipt ? { at: o.receipt.at.toISOString(), result: o.receipt.issue ? `${issues.length || 1} issue(s) reported` : 'All received in full', issues: issues.length ? issues : o.receipt.note ? [o.receipt.note] : [] } : null,
  };
}

async function findOrder(id: string, outletId: string) {
  const o = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!o || o.outletId !== outletId) throw new HttpError(404, 'Order not found for your store.');
  return o;
}

export async function storeRoutes(app: FastifyInstance) {
  const store = { preHandler: requireRole('store') };

  // SM1 Today
  app.get('/store/today', store, async (req): Promise<TStoreTodayResponse> => {
    const { outletId, today, now, cutoff } = ctxOf(req);
    const outlet = await outletOf(outletId);
    const rows = await prisma.order.findMany({
      where: { outletId, deliveryDate: { gte: dbDate(addDays(today, -6)), lte: dbDate(cutoff.nextIfLate) } },
      include: orderInclude, orderBy: [{ deliveryDate: 'desc' }, { temp: 'asc' }],
    });
    const on = (iso: string) => rows.filter((o) => isoOf(o.deliveryDate) === iso);
    const temps: Temp[] = outlet.brand === 'Fresh' ? ['ambient', 'chilled'] : ['ambient'];
    const nextDay = cutoff.open ? cutoff.forDate : cutoff.nextIfLate;
    const notes = await prisma.notification.findMany({ where: { role: 'store', outletId }, orderBy: { createdAt: 'desc' }, take: 6 });
    const week = rows.filter((o) => isoOf(o.deliveryDate) <= today);
    return {
      outlet, date: today, now, cutoff,
      today: on(today).filter((o) => o.status !== 'cancelled').map((o) => card(o, cutoff)),
      tomorrow: temps.map((t) => {
        const list = on(nextDay).filter((o) => o.temp === t && o.status !== 'cancelled');
        const own = list.find((o) => !isCarry(o));
        const carried = list.find((o) => isCarry(o));
        return { temp: t, typeLabel: orderTypeLabel(outlet.brand, t), order: own ? card(own, cutoff) : null, carried: carried ? card(carried, cutoff) : null };
      }),
      week: {
        delivered: week.filter((o) => o.status === 'delivered' || o.status === 'received').length,
        deferred: week.filter((o) => o.status === 'deferred' && published(o)).length,
        toConfirm: week.filter((o) => o.status === 'delivered').length,
      },
      activity: notes.map((n) => ({ at: n.createdAt.toISOString(), text: n.title ?? n.message })),
      unread: await prisma.notification.count({ where: { role: 'store', outletId, read: false } }),
    };
  });

  // SM2 Place order: the catalogue for one order type, with last order's quantities
  app.get('/store/catalogue', store, async (req): Promise<TStoreCatalogueResponse> => {
    const { outletId, cutoff, orderDate } = ctxOf(req);
    const outlet = await outletOf(outletId);
    const temp: Temp = (req.query as { temp?: string }).temp === 'chilled' && outlet.brand === 'Fresh' ? 'chilled' : 'ambient';
    const existing = (await prisma.order.findMany({ where: { outletId, temp, deliveryDate: dbDate(orderDate), status: 'placed' }, include: { lines: true } })).find((x) => !isCarry(x));
    const last = await prisma.order.findFirst({
      where: { outletId, temp, deliveryDate: { lt: dbDate(orderDate) }, status: { not: 'cancelled' } },
      include: { lines: true }, orderBy: { deliveryDate: 'desc' },
    });
    return {
      temp, typeLabel: orderTypeLabel(outlet.brand, temp), deliveryDate: orderDate, cutoff, lastOrderDate: last ? isoOf(last.deliveryDate) : null,
      products: catalogueFor(outlet.brand, temp).map((p) => ({
        product: p.name, pack: p.pack, packSize: p.packSize, packKg: p.packKg, packM3: p.packM3,
        lastPacks: last?.lines.filter((l) => l.product === p.name).reduce((n, l) => n + l.packs, 0) ?? 0,
      })),
      existing: existing ? { orderId: existing.id, lines: existing.lines.map((l) => ({ product: l.product, packs: l.packs })) } : null,
    };
  });

  // SM2 → SM3: place (or, before the cutoff, replace) the order for one type
  app.post('/store/orders', store, async (req): Promise<TStoreOrderDetail> => {
    const { outletId, today, now, cutoff, orderDate } = ctxOf(req);
    const body = StoreOrderRequest.parse(req.body);
    const outlet = await outletOf(outletId);
    if (body.temp === 'chilled' && outlet.brand !== 'Fresh') throw new HttpError(400, `${outlet.name} orders ambient goods only.`);
    const built = storeOrderLines(outlet.brand, body.temp, body.lines);
    if (!built.units) throw new HttpError(400, 'Add at least one pack.');
    const existing = (await prisma.order.findMany({ where: { outletId, temp: body.temp, deliveryDate: dbDate(orderDate), status: 'placed' } })).find((x) => !isCarry(x));
    const data = { units: built.units, weightKg: built.weightKg, volumeM3: built.volumeM3, note: body.note ?? null };
    let id: string;
    if (existing) {
      await prisma.orderLine.deleteMany({ where: { orderId: existing.id } });
      id = (await prisma.order.update({ where: { id: existing.id }, data })).id;
    } else {
      // The order is stamped with the (demo) store clock, so the 16:00 cutoff check stays consistent.
      id = (await prisma.order.create({ data: { outletId, deliveryDate: dbDate(orderDate), temp: body.temp, status: 'placed', placedAt: atColombo(today, now), ...data } })).id;
    }
    await prisma.orderLine.createMany({ data: built.lines.map(({ volumeM3: _v, ...l }) => ({ orderId: id, ...l })) });
    await notifyStore(outletId, 'order.received', `${orderTypeLabel(outlet.brand, body.temp)} order ${existing ? 'updated' : 'received'} · ${shortDate(orderDate)}`,
      `${built.units} ${unitLabelOf(outlet.brand)} · ${Math.round(built.weightKg)} kg. ${cutoff.open ? 'You can change it until 4:00 PM.' : `Placed after the cutoff, so it goes on the ${shortDate(orderDate)} run.`}`, { orderId: id, date: today });
    const o = await findOrder(id, outletId);
    return detail(o, cutoff, today);
  });

  // SM7 Orders
  app.get('/store/orders', store, async (req): Promise<TStoreOrdersResponse> => {
    const { outletId, cutoff } = ctxOf(req);
    const rows = await prisma.order.findMany({ where: { outletId }, include: orderInclude, orderBy: [{ deliveryDate: 'desc' }, { temp: 'asc' }], take: 40 });
    return { cutoff, orders: rows.map((o) => card(o, cutoff)) };
  });

  // SM3 / SM4 / SM6 Order status, tracking, deferral
  app.get('/store/orders/:id', store, async (req): Promise<TStoreOrderDetail> => {
    const { outletId, cutoff, today } = ctxOf(req);
    return detail(await findOrder((req.params as { id: string }).id, outletId), cutoff, today);
  });

  // SM5 Confirm receipt
  app.post('/store/orders/:id/receipt', store, async (req): Promise<TStoreOrderDetail> => {
    const { outletId, cutoff, today } = ctxOf(req);
    const body = ReceiptRequest.parse(req.body);
    const o = await findOrder((req.params as { id: string }).id, outletId);
    if (o.status !== 'delivered') throw new HttpError(409, o.status === 'received' ? 'This delivery is already confirmed.' : 'This order has not been delivered yet.');
    const recorded = o.lines.map((l) => {
      const r = body.lines.find((x) => x.lineId === l.id);
      const expected = l.packs - l.shortPacks;
      const received = r ? r.received : expected;
      const status = r?.status ?? (received < expected ? 'short' : 'ok');
      return { lineId: l.id, product: l.product, pack: l.pack, ordered: expected, received, status };
    });
    const bad = recorded.filter((x) => x.status !== 'ok' || x.received < x.ordered);
    const text = bad.map((x) => `${x.product}: ${x.received} of ${x.ordered} ${x.pack} received${x.status === 'damaged' ? ' (damaged)' : ''}`);
    await prisma.receipt.create({
      data: {
        orderId: o.id, confirmed: true, byName: req.user.name, lines: recorded, deliveredAt: o.stop?.deliveredAt ?? null,
        issue: bad.length ? (bad.some((x) => x.status === 'damaged') ? 'damaged' : 'missing') : null,
        issueUnits: bad.length ? bad.reduce((n, x) => n + Math.max(0, x.ordered - x.received), 0) : null,
        note: [text.join('; '), body.note].filter(Boolean).join(' · ') || null,
      },
    });
    await prisma.order.update({ where: { id: o.id }, data: { status: 'received' } });
    if (bad.length) {
      await alertDispatcher('receipt_issue', `${o.outletId} ${o.outlet.district} · ${bad.length} receipt issue${bad.length > 1 ? 's' : ''}`,
        `${text.join('; ')}.${body.note ? ` Store: ${body.note}` : ''} Confirmed by ${req.user.name}.`, { date: isoOf(o.deliveryDate), outletId: o.outletId, orderId: o.id });
      emit('receipt.issue', `${o.outletId}: ${bad.length} receipt issue(s)`, { orderId: o.id, outletId: o.outletId });
    }
    return detail(await findOrder(o.id, outletId), cutoff, today);
  });

  // SM6 Accept the new day, or cancel the carried order
  app.post('/store/orders/:id/deferral', store, async (req): Promise<TStoreOrderDetail> => {
    const { outletId, cutoff, today } = ctxOf(req);
    const { action } = DeferralResponseRequest.parse(req.body);
    const o = await findOrder((req.params as { id: string }).id, outletId);
    const origId = o.sourceRef?.startsWith('carry:') ? o.sourceRef.slice(6) : o.id;
    const d = (await prisma.deferral.findMany({ where: { orderId: origId }, orderBy: { createdAt: 'desc' }, take: 1 }))[0];
    if (!d) throw new HttpError(404, 'This order was not deferred.');
    if (d.storeResponse) throw new HttpError(409, `You already ${d.storeResponse} this.`);
    if (action === 'cancel') {
      const carried = await prisma.order.findFirst({ where: { sourceRef: `carry:${origId}` }, include: { stop: { include: { trip: true } } } });
      if (carried?.stop?.trip.sealedAt) throw new HttpError(409, 'It is already loaded for the new day. Call the dispatcher.');
      if (carried) {
        if (carried.stop) await prisma.tripStop.delete({ where: { id: carried.stop.id } });
        await prisma.order.update({ where: { id: carried.id }, data: { status: 'cancelled' } });
      }
    }
    await prisma.deferral.update({ where: { id: d.id }, data: { storeResponse: action === 'accept' ? 'accepted' : 'cancelled', respondedAt: new Date() } });
    await alertDispatcher('info', `${o.outletId} ${action === 'accept' ? 'accepted' : 'cancelled'} its deferred ${o.temp} order`,
      action === 'accept' ? `The store expects it on ${shortDate(isoOf(d.newDate))}.` : `Remove it from the ${shortDate(isoOf(d.newDate))} plan; the store no longer needs it.`, { date: today, outletId: o.outletId, orderId: origId });
    return detail(await findOrder(o.id, outletId), cutoff, today);
  });

  // SM8 Receipts
  app.get('/store/receipts', store, async (req): Promise<TStoreReceiptsResponse> => {
    const { outletId, cutoff, today } = ctxOf(req);
    const pending = await prisma.order.findMany({ where: { outletId, status: 'delivered' }, include: orderInclude, orderBy: { deliveryDate: 'desc' } });
    const done = await prisma.order.findMany({ where: { outletId, status: 'received', receipt: { isNot: null } }, include: orderInclude, orderBy: { deliveryDate: 'desc' }, take: 30 });
    const recent = done.filter((o) => isoOf(o.deliveryDate) >= addDays(today, -30));
    const waits = recent.map((o) => (o.receipt!.deliveredAt ? (o.receipt!.at.getTime() - o.receipt!.deliveredAt.getTime()) / 60000 : null)).filter((x): x is number => x !== null && x >= 0 && x <= 720); // longer gaps are demo runs on another day, not real waits
    return {
      pending: pending.map((o) => card(o, cutoff)),
      past: done.map((o) => ({
        orderId: o.id, ref: displayRef(o), typeLabel: orderTypeLabel(o.outlet.brand, o.temp), deliveryDate: isoOf(o.deliveryDate),
        deliveredAt: o.receipt!.deliveredAt?.toISOString() ?? null, confirmedAt: o.receipt!.at.toISOString(),
        result: o.receipt!.issue
          ? `${o.receipt!.issueUnits ?? 1} ${(o.receipt!.issueUnits ?? 1) === 1 ? 'item' : 'items'} ${o.receipt!.note?.includes('resolved') ? 'short · resolved' : o.receipt!.issue === 'damaged' ? 'damaged · reported' : 'short · reported'}`
          : 'All received in full',
        ok: !o.receipt!.issue,
      })),
      stats: {
        fullPct: recent.length ? Math.round((recent.filter((o) => !o.receipt!.issue).length / recent.length) * 100) : 100,
        issues: recent.filter((o) => o.receipt!.issue).length,
        avgConfirmMin: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
      },
    };
  });

  app.get('/store/notifications', store, async (req): Promise<TStoreNotificationDto[]> => {
    const { outletId } = ctxOf(req);
    const notes = await prisma.notification.findMany({ where: { role: 'store', outletId }, orderBy: { createdAt: 'desc' }, take: 30 });
    return notes.map((n) => ({ id: n.id, kind: n.kind, title: n.title ?? n.kind, message: n.message, at: n.createdAt.toISOString(), read: n.read, orderId: ((n.refs ?? {}) as Record<string, string>).orderId ?? null }));
  });
  app.post('/store/notifications/read', store, async (req) => {
    const { outletId } = ctxOf(req);
    await prisma.notification.updateMany({ where: { role: 'store', outletId, read: false }, data: { read: true } });
    return { ok: true };
  });
}

