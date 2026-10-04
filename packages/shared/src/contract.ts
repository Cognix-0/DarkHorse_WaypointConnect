// The API contract. Every request and response body is defined here once, as a Zod schema.
// The API validates with these schemas; the web app imports the inferred types.
// Change a shape only after agreeing with the whole team (see CLAUDE.md).
import { z } from 'zod';

// ---------- shared enums ----------
export const Role = z.enum(['dispatcher', 'loader', 'driver', 'store', 'admin']);
export const Brand = z.enum(['Fresh', 'Style', 'Tech']);
export const Temp = z.enum(['ambient', 'chilled']);
export const DockType = z.enum(['rear_dock', 'street', 'mall_bay']);
export const Parking = z.enum(['normal', 'van_only', 'mall_dock']);
export const Depot = z.enum(['Peliyagoda', 'Kandy']);
export const OrderStatus = z.enum(['placed', 'locked', 'planned', 'deferred', 'loaded', 'out_for_delivery', 'delivered', 'failed', 'received', 'cancelled']);
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
  /** short human reference shown on every screen, e.g. ORD-25047 */
  ref: z.string(),
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
  deferral: z.object({ reason: DeferralReason, type: DeferralType, note: z.string().nullable(), newDate: IsoDate, confirmed: z.boolean() }).nullable(),
});
export const OrderQueueResponse = z.object({
  date: IsoDate,
  lockedAt: z.string().nullable(),
  orders: z.array(OrderDto),
  /** received after the 16:00 cutoff: moved to the next run, shown greyed out */
  afterCutoffOrders: z.array(OrderDto),
  summary: z.object({
    total: z.number(), chilled: z.number(), skippedLastRun: z.number(), afterCutoff: z.number(),
    vehiclesAvailable: z.number(), vehiclesTotal: z.number(),
    weightKg: z.number(), volumeM3: z.number(), chilledKg: z.number(), vanOnly: z.number(), mallWindow: z.number(),
    byBrand: z.object({ Fresh: z.number(), Style: z.number(), Tech: z.number() }),
  }),
  nextRunDate: IsoDate,
  planStatus: z.enum(['none', 'draft', 'published']),
});

// ---------- planning ----------
export const TripStopPlanDto = z.object({ orderId: z.string(), outletId: z.string(), seq: z.number().int(), eta: HHMM, late: z.boolean() });
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
  /** timetable from engine/schedule.ts; stops are in delivery order */
  departAt: HHMM,
  endAt: HHMM,
  stops: z.array(TripStopPlanDto),
  /** dock/road state: a sealed or departed trip can no longer change on the board */
  state: z.enum(['open', 'loading', 'sealed', 'departed']),
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
  version: z.number().int(),
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

// ---------- dispatcher screens (D1–D6) ----------
/** D3 planning board: everything the board needs in one request. */
export const BoardVehicleDto = VehicleDto.extend({
  /** litres used earlier this week */
  fuelUsedL: z.number(),
  /** litres today's planned trips will use */
  fuelPlannedL: z.number(),
});
export const BoardResponse = z.object({
  date: IsoDate,
  depot: Depot,
  plan: PlanDto.nullable(),
  orders: z.array(OrderDto),
  vehicles: z.array(BoardVehicleDto),
});
export const SuggestPlanRequest = z.object({ date: IsoDate, depot: Depot });
export const ConfirmDeferralRequest = z.object({ note: z.string().trim().min(3, 'Say why this outlet is skipped again').max(500) });

/** D1 overview */
export const AttentionItem = z.object({
  kind: z.enum(['second_deferral', 'reefer_short', 'workshop', 'late', 'shortfall', 'plan_unpublished', 'after_cutoff']),
  severity: z.enum(['high', 'medium', 'low']),
  title: z.string(),
  detail: z.string(),
  /** dispatcher route to open, e.g. /dispatcher/deferrals */
  link: z.string(),
});
export const OverviewResponse = z.object({
  date: IsoDate,
  depot: Depot,
  planStatus: z.enum(['none', 'draft', 'published']),
  planVersion: z.number().int(),
  kpis: z.object({
    ordersLocked: z.number(), chilled: z.number(), planned: z.number(), deferred: z.number(), trips: z.number(),
    vehiclesUsed: z.number(), vehiclesAvailable: z.number(), vehiclesTotal: z.number(),
    chilledDemandKg: z.number(), reeferCapacityKg: z.number(), skippedLastRun: z.number(), afterCutoff: z.number(),
  }),
  brandDemand: z.array(z.object({ brand: Brand, orders: z.number(), units: z.number(), weightKg: z.number(), planned: z.number(), deferred: z.number() })),
  depots: z.array(z.object({ depot: Depot, orders: z.number(), vehiclesAvailable: z.number(), vehiclesTotal: z.number(), reefersAvailable: z.number(), planStatus: z.enum(['none', 'draft', 'published']) })),
  attention: z.array(AttentionItem),
});

/** D4 deferral review */
export const DeferralRowDto = z.object({
  id: z.string(),
  order: OrderDto,
  reason: DeferralReason,
  type: DeferralType,
  detail: z.string().nullable(),
  note: z.string().nullable(),
  newDate: IsoDate,
  /** the outlet was also skipped on the last run: needs an explicit confirmation */
  secondDeferral: z.boolean(),
  confirmed: z.boolean(),
});
export const RecoveryOption = z.object({
  id: z.enum(['A', 'B', 'C']),
  title: z.string(),
  detail: z.string(),
  /** what the plan would look like with this option (computed by the engine) */
  served: z.number(),
  deferred: z.number(),
  action: z.enum(['apply', 'request']),
  state: z.enum(['available', 'applied', 'requested']),
});
export const DeferralReviewResponse = z.object({
  date: IsoDate,
  depot: Depot,
  planId: z.string().nullable(),
  planStatus: z.enum(['none', 'draft', 'published']),
  overload: z.object({ active: z.boolean(), title: z.string(), detail: z.string(), chilledDemandKg: z.number(), reeferCapacityKg: z.number() }),
  options: z.array(RecoveryOption),
  deferrals: z.array(DeferralRowDto),
});
export const OptionActionRequest = z.object({ date: IsoDate, depot: Depot });

/** D5 live tracking */
export const LiveTripStatus = z.enum(['not_started', 'on_time', 'at_risk', 'late', 'offline', 'short_loaded', 'trip_done', 'done']);
export const LiveRowDto = z.object({
  tripId: z.string(),
  vehicleId: z.string(),
  tripNo: z.number().int(),
  route: z.string(),
  driverName: z.string().nullable(),
  stopsDone: z.number().int(),
  stopsTotal: z.number().int(),
  nextStop: z.object({ outletId: z.string(), district: z.string(), eta: HHMM, windowClose: HHMM }).nullable(),
  status: LiveTripStatus,
  lastSeenAt: z.string().nullable(),
});
export const LiveAlertDto = z.object({
  id: z.string(),
  kind: z.enum(['late', 'loader_flag', 'offline', 'pod', 'failed', 'receipt_issue', 'info']),
  title: z.string(),
  detail: z.string(),
  at: z.string(),
  actions: z.array(z.object({ id: z.string(), label: z.string() })),
  done: z.boolean(),
  /** set on POD alerts: GET /api/live/pod/:stopId shows the photo and signature */
  stopId: z.string().nullable(),
});
export const LiveResponse = z.object({
  date: IsoDate,
  now: HHMM,
  published: z.boolean(),
  counts: z.object({ onTime: z.number(), atRisk: z.number(), late: z.number(), offline: z.number() }),
  rows: z.array(LiveRowDto),
  alerts: z.array(LiveAlertDto),
});
export const AlertActionRequest = z.object({ action: z.string() });

/** D6 capacity forecast */
export const ForecastDayDto = z.object({
  date: IsoDate,
  dow: z.string(),
  operating: z.boolean(),
  payday: z.boolean(),
  festival: z.string().nullable(),
  festivalRamp: z.number(),
  monsoon: z.boolean(),
  holiday: z.boolean(),
  /** demand relative to a normal weekday (1.0) */
  demandIndex: z.number(),
  orders: z.number(),
  weightKg: z.number(),
  chilledKg: z.number(),
  reeferCapacityKg: z.number(),
  fleetCapacityKg: z.number(),
  served: z.number(),
  deferred: z.number(),
  risk: z.enum(['ok', 'tight', 'over', 'closed']),
});
export const ForecastResponse = z.object({ from: IsoDate, depot: Depot, method: z.string(), days: z.array(ForecastDayDto) });

// ---------- loader (dock tablet, L1–L5) ----------
export const LoadProblem = z.enum(['damaged', 'short', 'wrong_pack', 'no_space', 'wrong_temp', 'vehicle', 'other']);
export const LoadAction = z.enum(['carry_over', 'replace', 'hold']);
/** One goods line ("item") of an order, counted in packs. */
export const GoodsLineDto = z.object({
  id: z.string(), seq: z.number().int(), product: z.string(), pack: z.string(), packSize: z.string(), packs: z.number().int(),
  ordered: z.string(), weightKg: z.number(),
  loadedAt: z.string().nullable(),
  shortPacks: z.number().int(),
  problem: LoadProblem.nullable(),
});
export const LoaderStopDto = z.object({
  stopSeq: z.number().int(),
  /** 1 = goes on the truck first (the last stop) */
  loadOrder: z.number().int(),
  orderId: z.string(), orderRef: z.string(), outletId: z.string(), district: z.string(), brand: Brand, temp: Temp,
  windowOpen: HHMM, windowClose: HHMM, units: z.number().int(), weightKg: z.number(),
  /** plan version that added this order to the vehicle, when later than v1 */
  newInVersion: z.number().int().nullable(),
  lines: z.array(GoodsLineDto),
});
export const LoaderVehicleCard = z.object({
  tripId: z.string(), vehicleId: z.string(), tripNo: z.number().int(), bay: z.number().int(),
  kind: z.string(), brands: z.array(Brand), temps: z.array(Temp), departAt: HHMM, sealBy: HHMM,
  route: z.string(), stops: z.number().int(), items: z.number().int(), itemsDone: z.number().int(), weightKg: z.number(),
  status: z.enum(['ready', 'loading', 'waiting', 'sealed', 'departed', 'held']),
  loaderName: z.string().nullable(), isMine: z.boolean(),
  /** one line for the card footer, e.g. "After VEH001 in Bay 3", "Day shift" */
  note: z.string().nullable(),
});
export const LoaderVehiclesResponse = z.object({
  date: IsoDate, now: HHMM, depot: Depot, published: z.boolean(), planVersion: z.number().int(), payday: z.boolean(),
  /** plan changes this loader still has to act on */
  changes: z.object({ fromVersion: z.number().int(), toVersion: z.number().int(), changed: z.number().int(), toMove: z.number().int(), acknowledged: z.boolean() }),
  vehicles: z.array(LoaderVehicleCard),
});
export const LoaderTripDetail = z.object({
  card: LoaderVehicleCard,
  date: IsoDate, now: HHMM, planVersion: z.number().int(),
  driverName: z.string().nullable(),
  reefer: z.object({ range: z.string(), lastTempC: z.number().nullable() }).nullable(),
  sealNo: z.string().nullable(),
  stops: z.array(LoaderStopDto),
  problems: z.array(z.object({ id: z.string(), lineId: z.string().nullable(), orderRef: z.string(), outletId: z.string(), product: z.string(), packs: z.number().int(), packSize: z.string(), problem: LoadProblem, action: LoadAction, note: z.string().nullable(), at: z.string() })),
});
export const TickLineRequest = z.object({ loaded: z.boolean() });
export const ReportProblemRequest = z.object({
  lineId: z.string(),
  problem: LoadProblem,
  packs: z.number().int().min(1),
  action: LoadAction,
  note: z.string().max(500).optional(),
  /** small JPEG data URL from the tablet camera */
  photo: z.string().max(400_000).optional(),
});
export const SealRequest = z.object({
  sealNo: z.string().trim().min(3, 'Scan or type the seal number').max(40),
  reeferTempC: z.number().min(-30).max(30).nullable(),
  carryOverNote: z.string().max(500).optional(),
});
export const PlanChangeRow = z.object({
  orderId: z.string(), orderRef: z.string(), outletId: z.string(), district: z.string(), goods: z.string(),
  from: z.string().nullable(), to: z.string().nullable(), hint: z.string(),
  state: z.enum(['to_move', 'moved', 'added', 'removed', 'not_picked']),
  movedAt: z.string().nullable(),
});
export const PlanChangesResponse = z.object({
  date: IsoDate, fromVersion: z.number().int(), toVersion: z.number().int(), publishedAt: z.string().nullable(),
  reason: z.string(), acknowledged: z.boolean(),
  counts: z.object({ all: z.number(), toMove: z.number(), moved: z.number(), added: z.number(), notPicked: z.number() }),
  rows: z.array(PlanChangeRow),
});

// ---------- driver (phone, M1–M8, works offline) ----------
export const FailReason = z.enum(['shop_closed', 'refused', 'damaged_missing', 'no_access', 'other']);
export const StopDto = z.object({
  stopId: z.string(), seq: z.number().int(), orderId: z.string(), orderRef: z.string(), outlet: OutletDto,
  units: z.number().int(), unitLabel: z.string(), temp: Temp, weightKg: z.number(), volumeM3: z.number(),
  plannedArrival: HHMM, status: z.enum(['pending', 'arrived', 'delivered', 'failed']),
  /** packs the loader could not put on the truck */
  shortUnits: z.number().int(),
  managerName: z.string().nullable(), managerPhone: z.string().nullable(), note: z.string().nullable(),
  /** drive from the previous stop (or the depot) */
  legKm: z.number(), legMin: z.number(),
  arrivedAt: z.string().nullable(), deliveredAt: z.string().nullable(), deliveredUnits: z.number().int().nullable(),
  failedReason: FailReason.nullable(),
});
export const DriverTripDto = z.object({
  tripId: z.string(), tripNo: z.number().int(), brand: Brand, district: z.string(), temp: Temp,
  departAt: HHMM, endAt: HHMM, weightKg: z.number(), bay: z.number().int(),
  status: z.enum(['to_load', 'loading', 'sealed', 'departed', 'done']),
  loadedBy: z.string().nullable(), sealedAt: z.string().nullable(),
  loaderNotes: z.array(z.string()),
  stops: z.array(StopDto),
});
export const DriverRouteResponse = z.object({
  date: IsoDate, vehicleId: z.string(), vehicleKind: z.string(), depot: Depot, driverName: z.string(),
  published: z.boolean(), version: z.number().int(), publishedAt: z.string().nullable(),
  fuel: z.object({ usedL: z.number(), quotaL: z.number(), planL: z.number() }),
  trips: z.array(DriverTripDto),
  serverTime: z.string(),
});

// ---------- offline sync (driver) ----------
export const SyncEvent = z.discriminatedUnion('type', [
  z.object({ eventId: z.string().uuid(), type: z.literal('trip.departed'), tripId: z.string(), occurredAt: z.string() }),
  z.object({ eventId: z.string().uuid(), type: z.literal('stop.arrived'), stopId: z.string(), occurredAt: z.string() }),
  z.object({
    eventId: z.string().uuid(), type: z.literal('stop.delivered'), stopId: z.string(), occurredAt: z.string(),
    outcome: z.enum(['delivered', 'partial']), receiverName: z.string().trim().min(1), deliveredUnits: z.number().int().min(0),
    photoBase64: z.string().max(400_000).optional(), signatureBase64: z.string().max(200_000).optional(), note: z.string().max(500).optional(),
  }),
  z.object({
    eventId: z.string().uuid(), type: z.literal('stop.failed'), stopId: z.string(), occurredAt: z.string(),
    reason: FailReason, note: z.string().max(500).optional(), photoBase64: z.string().max(400_000).optional(),
  }),
]);
export const SyncRequest = z.object({ deviceId: z.string().min(1), events: z.array(SyncEvent).max(100) });
export const SyncResponse = z.object({
  accepted: z.array(z.string()),
  duplicates: z.array(z.string()),
  rejected: z.array(z.object({ eventId: z.string(), reason: z.string() })),
  /** the dispatcher changed the route meanwhile; the client should refetch it */
  routeVersion: z.number().int(),
});

// ---------- store manager (SM1–SM9, phone and desktop) ----------
export const StoreStage = z.enum(['received', 'scheduled', 'loaded', 'on_the_way', 'delivered', 'confirmed', 'deferred', 'failed', 'cancelled']);
export const StoreOrderCard = z.object({
  id: z.string(), ref: z.string(), deliveryDate: IsoDate, temp: Temp, typeLabel: z.string(),
  units: z.number().int(), unitLabel: z.string(), weightKg: z.number(),
  stage: StoreStage,
  /** one line for lists, e.g. "Delivered · confirm receipt" */
  statusText: z.string(),
  arrival: z.object({ from: HHMM, to: HHMM }).nullable(),
  deliveredAt: z.string().nullable(),
  needsReceipt: z.boolean(),
  /** quantities can still change (before the 16:00 cutoff) */
  editable: z.boolean(),
  deferredTo: IsoDate.nullable(),
});
export const StoreOutletDto = z.object({
  id: z.string(), brand: Brand, district: z.string(), depot: Depot, name: z.string(),
  windowOpen: HHMM, windowClose: HHMM, dockType: DockType, parking: Parking, managerName: z.string().nullable(),
});
export const CutoffDto = z.object({
  /** delivery day the open orders are for */
  forDate: IsoDate, closesAt: HHMM, minutesLeft: z.number().int(), open: z.boolean(),
  /** when the cutoff has passed, new orders go on this day instead */
  nextIfLate: IsoDate,
});
export const StoreTodayResponse = z.object({
  outlet: StoreOutletDto, date: IsoDate, now: HHMM, cutoff: CutoffDto,
  today: z.array(StoreOrderCard),
  tomorrow: z.array(z.object({ temp: Temp, typeLabel: z.string(), order: StoreOrderCard.nullable(), carried: StoreOrderCard.nullable() })),
  week: z.object({ delivered: z.number(), deferred: z.number(), toConfirm: z.number() }),
  activity: z.array(z.object({ at: z.string(), text: z.string() })),
  unread: z.number().int(),
});
export const CatalogueProductDto = z.object({
  product: z.string(), pack: z.string(), packSize: z.string(), packKg: z.number(), packM3: z.number(),
  /** packs on this outlet's previous order of the same type */
  lastPacks: z.number().int(),
  /** auto-suggested quantity based on demand trends */
  suggestedPacks: z.number().int(),
  suggestionReason: z.string().optional(),
});
export const StoreCatalogueResponse = z.object({
  temp: Temp, typeLabel: z.string(), deliveryDate: IsoDate, cutoff: CutoffDto, lastOrderDate: IsoDate.nullable(),
  products: z.array(CatalogueProductDto),
  suggestionSummary: z.string().optional(),
  /** the order already placed for that day and type, if any (edit it instead of placing another) */
  existing: z.object({ orderId: z.string(), lines: z.array(z.object({ product: z.string(), packs: z.number().int() })) }).nullable(),
});
export const AddProductRequest = z.object({
  temp: Temp,
  name: z.string().trim().min(2, 'Enter product name').max(80),
  pack: z.string().trim().min(1, 'Enter pack type (e.g. cartons, crates, bags)').max(40),
  packSize: z.string().trim().min(1, 'Enter pack size description').max(40),
  perPack: z.number().min(1, 'Quantity per pack must be at least 1'),
  perPackUnit: z.string().trim().min(1, 'Enter per pack unit').max(20),
  packKg: z.number().min(0.01, 'Weight per pack must be greater than 0'),
  packM3: z.number().min(0.0001, 'Volume per pack must be greater than 0'),
});
export type TAddProductRequest = z.infer<typeof AddProductRequest>;

export const StoreOrderRequest = z.object({
  temp: Temp,
  lines: z.array(z.object({ product: z.string(), packs: z.number().int().min(0).max(999) })).min(1),
  note: z.string().max(500).optional(),
});
export const StoreOrderLineDto = z.object({
  id: z.string(), product: z.string(), pack: z.string(), packSize: z.string(), packs: z.number().int(), ordered: z.string(),
  shortFromDock: z.number().int(),
  received: z.number().int().nullable(), status: z.enum(['ok', 'short', 'damaged']).nullable(),
});
export const StoreOrderDetail = z.object({
  order: StoreOrderCard,
  outlet: StoreOutletDto,
  placedAt: z.string(),
  lines: z.array(StoreOrderLineDto),
  timeline: z.array(z.object({ key: z.string(), label: z.string(), sub: z.string(), done: z.boolean(), current: z.boolean() })),
  tracking: z.object({
    vehicleId: z.string(), vehicleKind: z.string(), loadedAt: z.string().nullable(), departedAt: z.string().nullable(),
    stopsAway: z.number().int(), eta: HHMM, onTime: z.boolean(), handlingMin: z.number().int(), readyBy: HHMM, lastUpdate: z.string().nullable(),
  }).nullable(),
  pod: z.object({ receiverName: z.string().nullable(), at: z.string(), photo: z.string().nullable(), signature: z.string().nullable(), driverName: z.string().nullable(), vehicleId: z.string() }).nullable(),
  deferral: z.object({
    reason: DeferralReason, reasonText: z.string(), type: DeferralType, recordedAt: z.string(),
    fromDate: IsoDate, newDate: IsoDate, newArrival: z.object({ from: HHMM, to: HHMM }).nullable(), firstInQueue: z.boolean(),
    unitsLate: z.number().int(), runsSkipped: z.number().int(), daysSinceLast: z.number().int(), lastServed: IsoDate.nullable(),
    response: z.enum(['accepted', 'cancelled']).nullable(),
  }).nullable(),
  receipt: z.object({ at: z.string(), result: z.string(), issues: z.array(z.string()) }).nullable(),
});
export const ReceiptRequest = z.object({
  lines: z.array(z.object({ lineId: z.string(), received: z.number().int().min(0), status: z.enum(['ok', 'short', 'damaged']) })).min(1),
  note: z.string().max(500).optional(),
});
export const DeferralResponseRequest = z.object({ action: z.enum(['accept', 'cancel']) });
export const StoreOrdersResponse = z.object({ cutoff: CutoffDto, orders: z.array(StoreOrderCard) });
export const StoreReceiptsResponse = z.object({
  pending: z.array(StoreOrderCard),
  past: z.array(z.object({ orderId: z.string(), ref: z.string(), typeLabel: z.string(), deliveryDate: IsoDate, deliveredAt: z.string().nullable(), confirmedAt: z.string(), result: z.string(), ok: z.boolean() })),
  stats: z.object({ fullPct: z.number(), issues: z.number(), avgConfirmMin: z.number().nullable() }),
});
export const StoreNotificationDto = z.object({ id: z.string(), kind: z.string(), title: z.string(), message: z.string(), at: z.string(), read: z.boolean(), orderId: z.string().nullable() });
export const PodDto = StoreOrderDetail.shape.pod;

// ---------- administrator (accounts, drivers on vehicles, system) ----------
export const AdminAccountDto = z.object({
  id: z.string(), email: z.string(), name: z.string(), role: Role, depot: Depot.nullable(),
  outletId: z.string().nullable(), vehicleId: z.string().nullable(),
  /** false = switched off: cannot sign in, open sessions stop working */
  active: z.boolean(),
  /** the admin set this password (the generated one no longer applies) */
  customPassword: z.boolean(),
  lastLoginAt: z.string().nullable(), createdAt: z.string(),
});
export const AdminAccountsResponse = z.object({
  accounts: z.array(AdminAccountDto),
  counts: z.array(z.object({ role: Role, total: z.number().int(), active: z.number().int() })),
});
/** New staff account (vehicle and store accounts exist one per vehicle / store already). */
export const CreateAccountRequest = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  role: z.enum(['dispatcher', 'loader', 'admin']),
  depot: Depot.nullable(),
});
export const UpdateAccountRequest = z.object({ active: z.boolean().optional(), name: z.string().trim().min(2).max(80).optional() });
/** The new password is shown once to the admin and never stored in plain text. */
export const AccountPasswordResponse = z.object({ account: AdminAccountDto, password: z.string() });

export const DriverDto = z.object({ id: z.string(), name: z.string(), phone: z.string().nullable(), licenseNo: z.string().nullable(), vehicleId: z.string().nullable() });
export const AdminVehicleDto = z.object({
  id: z.string(), type: z.enum(['truck', 'van']), temp: z.enum(['reefer', 'ambient']), depot: Depot, weightCapKg: z.number(),
  driver: DriverDto.nullable(),
  /** the vehicle's sign-in account (the driver uses it on the phone) */
  accountEmail: z.string().nullable(), accountActive: z.boolean(),
});
export const AdminFleetResponse = z.object({ vehicles: z.array(AdminVehicleDto), drivers: z.array(DriverDto) });
export const CreateDriverRequest = z.object({
  name: z.string().trim().min(2, 'Enter the driver\'s full name').max(80),
  phone: z.string().trim().max(30).optional(),
  licenseNo: z.string().trim().max(30).optional(),
});
/** driverId null = take the driver off. A driver already on another vehicle moves only with move: true. */
export const AssignDriverRequest = z.object({ driverId: z.string().nullable(), move: z.boolean().optional() });

export const AdminSystemResponse = z.object({
  serverTime: z.string(), date: IsoDate, clock: HHMM, timeZone: z.string(),
  /** DEMO_DATE is set, so the day does not follow the calendar */
  pinnedDate: z.boolean(),
  uptimeSec: z.number(),
  database: z.object({ ok: z.boolean(), latencyMs: z.number() }),
  accounts: z.array(z.object({ role: Role, total: z.number().int(), active: z.number().int() })),
  drivers: z.object({ total: z.number().int(), assigned: z.number().int(), spare: z.number().int() }),
  depots: z.array(z.object({
    depot: Depot, ordersToday: z.number().int(), planStatus: z.enum(['none', 'draft', 'published']), planVersion: z.number().int(),
    vehicles: z.number().int(), vehiclesWithoutDriver: z.number().int(),
  })),
});
export const RebuildDayResponse = z.object({ date: IsoDate, created: z.boolean(), orders: z.number().int() });
export type TAdminAccountDto = z.infer<typeof AdminAccountDto>;
export type TAdminAccountsResponse = z.infer<typeof AdminAccountsResponse>;
export type TCreateAccountRequest = z.infer<typeof CreateAccountRequest>;
export type TAccountPasswordResponse = z.infer<typeof AccountPasswordResponse>;
export type TDriverDto = z.infer<typeof DriverDto>;
export type TAdminVehicleDto = z.infer<typeof AdminVehicleDto>;
export type TAdminFleetResponse = z.infer<typeof AdminFleetResponse>;
export type TAdminSystemResponse = z.infer<typeof AdminSystemResponse>;
export type TRebuildDayResponse = z.infer<typeof RebuildDayResponse>;

// ---------- realtime refresh (Server-Sent Events, every role) ----------
/** "Something changed": sent on GET /api/changes after any successful change. No business data, so any role may
 * receive it; each screen then refetches what it shows. */
export const ChangeSignal = z.object({ at: z.string(), by: Role.nullable() });
export type TChangeSignal = z.infer<typeof ChangeSignal>;

// ---------- live events (Server-Sent Events) ----------
export const LiveEvent = z.object({
  kind: z.enum(['plan.published', 'plan.acknowledged', 'order.deferred', 'load.progress', 'load.shortfall', 'load.sealed', 'trip.departed', 'stop.arrived', 'stop.delivered', 'stop.failed', 'vehicle.stale', 'receipt.issue']),
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
export type TGoodsLineDto = z.infer<typeof GoodsLineDto>;
export type TLoaderStopDto = z.infer<typeof LoaderStopDto>;
export type TLoaderVehicleCard = z.infer<typeof LoaderVehicleCard>;
export type TLoaderVehiclesResponse = z.infer<typeof LoaderVehiclesResponse>;
export type TLoaderTripDetail = z.infer<typeof LoaderTripDetail>;
export type TReportProblemRequest = z.infer<typeof ReportProblemRequest>;
export type TPlanChangesResponse = z.infer<typeof PlanChangesResponse>;
export type TPlanChangeRow = z.infer<typeof PlanChangeRow>;
export type TLoadProblem = z.infer<typeof LoadProblem>;
export type TLoadAction = z.infer<typeof LoadAction>;
export type TStopDto = z.infer<typeof StopDto>;
export type TDriverTripDto = z.infer<typeof DriverTripDto>;
export type TFailReason = z.infer<typeof FailReason>;
export type TStoreOrderCard = z.infer<typeof StoreOrderCard>;
export type TStoreTodayResponse = z.infer<typeof StoreTodayResponse>;
export type TStoreCatalogueResponse = z.infer<typeof StoreCatalogueResponse>;
export type TStoreOrderDetail = z.infer<typeof StoreOrderDetail>;
export type TStoreOrdersResponse = z.infer<typeof StoreOrdersResponse>;
export type TStoreReceiptsResponse = z.infer<typeof StoreReceiptsResponse>;
export type TStoreNotificationDto = z.infer<typeof StoreNotificationDto>;
export type TStoreOutletDto = z.infer<typeof StoreOutletDto>;
export type TCutoffDto = z.infer<typeof CutoffDto>;
export type TPod = NonNullable<z.infer<typeof PodDto>>;
export type TDriverRouteResponse = z.infer<typeof DriverRouteResponse>;
export type TSyncEvent = z.infer<typeof SyncEvent>;
export type TSyncResponse = z.infer<typeof SyncResponse>;
export type TLiveEvent = z.infer<typeof LiveEvent>;
export type TVehicleDto = z.infer<typeof VehicleDto>;
export type TBoardResponse = z.infer<typeof BoardResponse>;
export type TBoardVehicleDto = z.infer<typeof BoardVehicleDto>;
export type TCheckPlacementResponse = z.infer<typeof CheckPlacementResponse>;
export type TOverviewResponse = z.infer<typeof OverviewResponse>;
export type TAttentionItem = z.infer<typeof AttentionItem>;
export type TDeferralReviewResponse = z.infer<typeof DeferralReviewResponse>;
export type TDeferralRowDto = z.infer<typeof DeferralRowDto>;
export type TRecoveryOption = z.infer<typeof RecoveryOption>;
export type TLiveResponse = z.infer<typeof LiveResponse>;
export type TLiveRowDto = z.infer<typeof LiveRowDto>;
export type TLiveAlertDto = z.infer<typeof LiveAlertDto>;
export type TForecastResponse = z.infer<typeof ForecastResponse>;
export type TForecastDayDto = z.infer<typeof ForecastDayDto>;
export type TDeferralReason = z.infer<typeof DeferralReason>;
export type TBrand = z.infer<typeof Brand>;

/** Display label for order_units, by brand. */
export const unitLabel = (brand: z.infer<typeof Brand>) => (brand === 'Fresh' ? 'crates' : brand === 'Style' ? 'cartons' : 'items');
