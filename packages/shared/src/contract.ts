// The API contract. Every request and response body is defined here once, as a Zod schema.
// The API validates with these schemas; the web app imports the inferred types.
// Change a shape only after agreeing with the whole team (see CLAUDE.md).
import { z } from 'zod';

// ---------- shared enums ----------
export const Role = z.enum(['dispatcher', 'loader', 'driver', 'store']);
export const Brand = z.enum(['Fresh', 'Style', 'Tech']);
export const Temp = z.enum(['ambient', 'chilled']);
export const DockType = z.enum(['rear_dock', 'street', 'mall_bay']);
export const Parking = z.enum(['normal', 'van_only', 'mall_dock']);
export const Depot = z.enum(['Peliyagoda', 'Kandy']);
export const OrderStatus = z.enum(['placed', 'locked', 'planned', 'deferred', 'loaded', 'out_for_delivery', 'delivered', 'failed', 'received']);
export const DeferralReason = z.enum(['no_reefer_capacity', 'vehicle_full', 'time_window', 'fuel_quota', 'no_vehicle', 'other']);
export const DeferralType = z.enum(['unavoidable', 'choice']);
export const PlanStatus = z.enum(['draft', 'published']);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const HHMM = z.string().regex(/^\d{2}:\d{2}$/);

// ---------- auth ----------
export const LoginRequest = z.object({ email: z.string().email(), password: z.string().min(1) });
export const SessionUser = z.object({
  id: z.string(),
  name: z.string(),
  role: Role,
  depot: Depot.nullable(),
  outletId: z.string().nullable(),
  vehicleId: z.string().nullable(),
});
export const LoginResponse = z.object({ token: z.string(), user: SessionUser });

// ---------- reference data ----------
export const OutletDto = z.object({
  id: z.string(), brand: Brand, district: z.string(), depot: Depot, dockType: DockType, parking: Parking,
  mallWindow: z.string().nullable(), windowOpen: HHMM, windowClose: HHMM,
});
export const VehicleDto = z.object({
  id: z.string(), type: z.enum(['truck', 'van']), temp: z.enum(['reefer', 'ambient']), weightCapKg: z.number(),
  volumeCapM3: z.number(), depot: Depot, kmPerL: z.number(), weeklyFuelQuotaL: z.number(), available: z.boolean(),
  driverName: z.string().nullable(),
});

// ---------- orders ----------
export const OrderDto = z.object({
  id: z.string(),
  outlet: OutletDto,
  deliveryDate: IsoDate,
  temp: Temp,
  units: z.number().int(),
  weightKg: z.number(),
  volumeM3: z.number(),
  status: OrderStatus,
  priority: z.number().int().min(1).max(5),
  deferredYesterday: z.boolean(),
  daysSinceLastServed: z.number().int(),
  placedAt: z.string(),
  arrivalWindow: z.object({ from: HHMM, to: HHMM }).nullable(),
  deferral: z.object({ reason: DeferralReason, type: DeferralType, note: z.string().nullable(), newDate: IsoDate }).nullable(),
});
export const OrderQueueResponse = z.object({
  date: IsoDate,
  lockedAt: z.string().nullable(),
  orders: z.array(OrderDto),
  summary: z.object({
    total: z.number(), chilled: z.number(), skippedLastRun: z.number(), afterCutoff: z.number(),
    vehiclesAvailable: z.number(), vehiclesTotal: z.number(),
  }),
});
export const PlaceOrderRequest = z.object({
  deliveryDate: IsoDate,
  temp: Temp,
  units: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

// ---------- planning ----------
export const TripDto = z.object({
  id: z.string(),
  vehicleId: z.string(),
  tripNo: z.union([z.literal(1), z.literal(2)]),
  brand: Brand,
  district: z.string(),
  orderIds: z.array(z.string()),
  weightKg: z.number(),
  volumeM3: z.number(),
  minutes: z.number(),
});
export const Violation = z.object({ vehicleId: z.string(), tripNo: z.number().optional(), code: z.string(), reason: z.string() });
export const PlanDto = z.object({
  id: z.string(),
  date: IsoDate,
  depot: Depot,
  status: PlanStatus,
  trips: z.array(TripDto),
  deferred: z.array(z.object({ orderId: z.string(), reason: DeferralReason, type: DeferralType, detail: z.string() })),
  violations: z.array(Violation),
  publishedAt: z.string().nullable(),
});
export const SaveTripsRequest = z.object({
  trips: z.array(z.object({ vehicleId: z.string(), tripNo: z.union([z.literal(1), z.literal(2)]), orderIds: z.array(z.string()).min(1) })),
});
/** Live rule check while dragging an order onto a vehicle. */
export const CheckPlacementRequest = z.object({ orderId: z.string(), vehicleId: z.string(), tripNo: z.union([z.literal(1), z.literal(2), z.literal('new')]).optional() });
export const CheckPlacementResponse = z.object({ ok: z.boolean(), code: z.string().optional(), reason: z.string().optional(), alternatives: z.array(z.string()) });
export const DeferRequest = z.object({
  reason: DeferralReason,
  note: z.string().max(500).optional(),
  /** must be true when the outlet was deferred on the last run */
  confirmSecondDeferral: z.boolean().optional(),
});

// ---------- loader ----------
export const LoadItemDto = z.object({ orderId: z.string(), outletId: z.string(), stopSeq: z.number().int(), units: z.number().int(), unitLabel: z.string(), temp: Temp, loadedUnits: z.number().int(), shortUnits: z.number().int() });
export const LoaderTripDto = z.object({
  tripId: z.string(), vehicleId: z.string(), tripNo: z.number(), brand: Brand, district: z.string(), departAt: HHMM,
  status: z.enum(['to_load', 'loading', 'sealed']),
  /** reverse stop order: last stop is loaded first */
  items: z.array(LoadItemDto),
});
export const LoadCheckRequest = z.object({
  items: z.array(z.object({ orderId: z.string(), loadedUnits: z.number().int().min(0), shortUnits: z.number().int().min(0), problem: z.enum(['missing', 'damaged', 'wrong_item']).optional(), note: z.string().optional() })),
  seal: z.boolean(),
});

// ---------- driver ----------
export const StopDto = z.object({
  stopId: z.string(), seq: z.number().int(), orderId: z.string(), outlet: OutletDto, units: z.number().int(), unitLabel: z.string(), temp: Temp,
  plannedArrival: HHMM, status: z.enum(['pending', 'arrived', 'delivered', 'failed']),
});
export const DriverRouteResponse = z.object({
  date: IsoDate, vehicleId: z.string(),
  trips: z.array(z.object({ tripId: z.string(), tripNo: z.number(), brand: Brand, district: z.string(), stops: z.array(StopDto) })),
  version: z.number().int(),
});

// ---------- offline sync (driver + loader) ----------
export const SyncEvent = z.discriminatedUnion('type', [
  z.object({ eventId: z.string().uuid(), type: z.literal('stop.arrived'), stopId: z.string(), occurredAt: z.string() }),
  z.object({ eventId: z.string().uuid(), type: z.literal('stop.delivered'), stopId: z.string(), occurredAt: z.string(), receiverName: z.string().min(1), photoBase64: z.string().optional(), deliveredUnits: z.number().int() }),
  z.object({ eventId: z.string().uuid(), type: z.literal('stop.failed'), stopId: z.string(), occurredAt: z.string(), reason: z.enum(['shop_closed', 'refused_damaged', 'no_access', 'other']), note: z.string().optional(), photoBase64: z.string().optional() }),
  z.object({ eventId: z.string().uuid(), type: z.literal('load.checked'), tripId: z.string(), occurredAt: z.string(), payload: LoadCheckRequest }),
]);
export const SyncRequest = z.object({ deviceId: z.string(), events: z.array(SyncEvent).max(200) });
export const SyncResponse = z.object({
  accepted: z.array(z.string()),
  duplicates: z.array(z.string()),
  rejected: z.array(z.object({ eventId: z.string(), reason: z.string() })),
  /** the dispatcher changed the route meanwhile; the client should refetch it */
  routeVersion: z.number().int(),
});

// ---------- store ----------
export const ReceiptRequest = z.object({
  confirmed: z.boolean(),
  issue: z.enum(['missing', 'damaged', 'wrong_item', 'late']).optional(),
  issueUnits: z.number().int().optional(),
  note: z.string().max(500).optional(),
});

// ---------- live events (Server-Sent Events) ----------
export const LiveEvent = z.object({
  kind: z.enum(['plan.published', 'order.deferred', 'load.shortfall', 'stop.delivered', 'stop.failed', 'vehicle.stale', 'receipt.issue']),
  at: z.string(),
  message: z.string(),
  refs: z.record(z.string()),
});

export type TLoginResponse = z.infer<typeof LoginResponse>;
export type TSessionUser = z.infer<typeof SessionUser>;
export type TOrderDto = z.infer<typeof OrderDto>;
export type TOrderQueueResponse = z.infer<typeof OrderQueueResponse>;
export type TPlanDto = z.infer<typeof PlanDto>;
export type TTripDto = z.infer<typeof TripDto>;
export type TLoaderTripDto = z.infer<typeof LoaderTripDto>;
export type TDriverRouteResponse = z.infer<typeof DriverRouteResponse>;
export type TSyncEvent = z.infer<typeof SyncEvent>;
export type TSyncResponse = z.infer<typeof SyncResponse>;
export type TLiveEvent = z.infer<typeof LiveEvent>;

/** Display label for order_units, by brand. */
export const unitLabel = (brand: z.infer<typeof Brand>) => (brand === 'Fresh' ? 'crates' : brand === 'Style' ? 'cartons' : 'items');
