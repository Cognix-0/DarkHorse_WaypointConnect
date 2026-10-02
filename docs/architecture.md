# Architecture

```mermaid
flowchart TB
  subgraph Clients
    D[Dispatcher<br/>desktop]
    S[Store manager<br/>phone + desktop]
    L[Loader<br/>dock tablet]
    R[Driver<br/>phone PWA + offline outbox]
  end
  C[Caddy<br/>HTTPS, /api to API, rest to web]
  W[Web app<br/>React PWA served by nginx]
  A[API<br/>Fastify + Zod]
  P[(PostgreSQL<br/>Prisma)]
  SH[packages/shared<br/>contract + planning engine]
  D & S & L & R --> C
  C --> W
  C --> A
  A --> P
  SH -. imported by .-> W
  SH -. imported by .-> A
```

- One HTTPS domain. Every API route lives under `/api`.
- The planning engine is plain TypeScript with no dependencies: the API uses it to suggest plans, check every drag-and-drop (`/api/plans/check-placement`), re-validate whole plans and build the timetable (stop order and ETAs).
- The driver app saves every action to IndexedDB first and syncs to `/api/sync`; the server ignores repeated event ids, so retries are safe.
- Server-Sent Events (`/api/events`) push changes to the dispatcher screens; Caddy is set not to buffer them.

## Offline sync (driver)

```mermaid
sequenceDiagram
  participant Phone as Driver phone
  participant IDB as IndexedDB (route + outbox)
  participant API as API /api/sync
  participant DB as PostgreSQL
  Phone->>IDB: action → event {uuid, type, time}; apply to cached route
  Note over Phone,IDB: works with no signal
  Phone->>API: when online: POST events in order
  API->>DB: skip event ids already stored, apply the rest
  API-->>Phone: accepted / duplicates / rejected + current plan version
  Phone->>IDB: remove sent events
  Phone->>API: newer plan version? GET /api/driver/route
  Phone-->>Phone: show "Back online" (what was sent, what changed)
```

## Plan versions

Every publish stores a snapshot (`PlanVersion`). Loaders see the difference between the version they acknowledged and the current one (L4), mark goods as moved (`LoadMove`) and acknowledge (`PlanAck`). Drivers acknowledge by departing. Sealed and departed trips are locked against edits.

## Store manager loop

Every `/api/store/*` route is scoped to the signed-in manager's outlet. Orders are built from the goods catalogue (`storeOrderLines` in `packages/shared/src/goods.ts`), so the store, the loader and the driver count the same packs; they can be edited until the 16:00 cutoff. A store sees a deferral only after the plan is published, with the reason in plain words, and can accept the new day or cancel. The order page combines the plan (ETA from the trip timetable), driver events (lateness, proof of delivery) and the loader's short packs. Confirming receipt line by line writes a `Receipt`; any short or damaged line raises a *Store issue* alert on the dispatcher's Live Tracking.

# Data model

```mermaid
erDiagram
  OUTLET ||--o{ ORDER : places
  OUTLET ||--o{ USER : "store manager"
  VEHICLE ||--o{ TRIP : runs
  VEHICLE ||--o{ VEHICLE_DAY_STATUS : "workshop days"
  VEHICLE ||--o{ USER : driver
  PLAN ||--o{ TRIP : contains
  PLAN ||--o{ DEFERRAL : records
  TRIP ||--o{ TRIP_STOP : "stops in order"
  ORDER ||--o| TRIP_STOP : "planned as"
  ORDER ||--o{ DEFERRAL : "deferred by"
  ORDER ||--o{ ORDER_LINE : "goods in packs"
  TRIP ||--o{ LOAD_CHECK : "loader problem reports"
  TRIP_STOP ||--o{ DELIVERY_EVENT : "driver events (offline sync)"
  PLAN ||--o{ PLAN_VERSION : "published snapshots"
  PLAN ||--o{ PLAN_ACK : "who works from which version"
  PLAN ||--o{ LOAD_MOVE : "goods moved after a change"
  ORDER ||--o| RECEIPT : "store confirms"
```

Full definitions: `prisma/schema.prisma`.
