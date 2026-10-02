// Domain types used by the planning engine.
// The engine is dependency-free so the same code runs in the browser, the API and the tests.

export type Brand = 'Fresh' | 'Style' | 'Tech';
export type Temp = 'ambient' | 'chilled';
export type DockType = 'rear_dock' | 'street' | 'mall_bay';
export type Parking = 'normal' | 'van_only' | 'mall_dock';
export type Depot = 'Peliyagoda' | 'Kandy';
export type VehicleType = 'truck' | 'van';
export type VehicleTemp = 'reefer' | 'ambient';

export interface Vehicle {
  id: string;
  type: VehicleType;
  temp: VehicleTemp;
  weightCapKg: number;
  volumeCapM3: number;
  depot: Depot;
  kmPerL: number;
  weeklyFuelQuotaL: number;
  /** false when the vehicle is in the workshop for the planning day */
  available: boolean;
}

export interface Order {
  /** order id or Task 2B order_ref */
  ref: string;
  outletId: string;
  brand: Brand;
  district: string;
  depot: Depot;
  dockType: DockType;
  parking: Parking;
  temp: Temp;
  units: number;
  weightKg: number;
  volumeM3: number;
  /** 'HH:MM' local time */
  windowOpen: string;
  windowClose: string;
  /** true if this outlet was skipped on the previous run */
  deferredYesterday: boolean;
  daysSinceLastServed: number;
}

export interface DistrictTravel {
  district: string;
  depot: Depot;
  /** depot_to_district_freeflow_min, counted once per trip */
  outboundMin: number;
  /** inter_stop_freeflow_min, counted (stops - 1) times */
  interStopMin: number;
  outboundKm: number;
  interStopKm: number;
}

export interface PlanningContext {
  travel: Record<string, DistrictTravel>;
  /** key `${brand}|${dockType}` -> service_allowance_min */
  allowance: Record<string, number>;
  /** litres already used this week, per vehicle id. Omit to skip the fuel rule. */
  fuelUsedL?: Record<string, number>;
}

export interface Trip {
  vehicleId: string;
  tripNo: 1 | 2;
  brand: Brand;
  district: string;
  orders: Order[];
}

export type RuleCode =
  | 'VEHICLE_UNAVAILABLE'
  | 'WRONG_DEPOT'
  | 'NEEDS_REEFER'
  | 'NEEDS_VAN'
  | 'TRIP_MIXES_BRAND'
  | 'TRIP_MIXES_DISTRICT'
  | 'MAX_TRIPS'
  | 'OVER_WEIGHT'
  | 'OVER_VOLUME'
  | 'OVER_TIME_FRESH'
  | 'OVER_TIME_DAY'
  | 'OVER_FUEL'
  | 'UNKNOWN_DISTRICT';

export type PlacementResult =
  | { ok: true; tripNo: 1 | 2; newTrip: boolean; tripMinutes: number }
  | { ok: false; code: RuleCode; reason: string };

export type DeferralReason = 'no_reefer_capacity' | 'vehicle_full' | 'time_window' | 'fuel_quota' | 'no_vehicle' | 'other';

export interface Deferral {
  order: Order;
  reason: DeferralReason;
  /** unavoidable = no valid vehicle could take it; choice = the dispatcher decided */
  type: 'unavoidable' | 'choice';
  detail: string;
}

export interface Plan {
  trips: Trip[];
  deferred: Deferral[];
}
