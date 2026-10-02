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
- The planning engine is plain TypeScript with no dependencies: the browser uses it for instant rule checks while dragging, the API uses it to suggest and re-validate plans.
- The driver app saves every action to IndexedDB first and syncs to `/api/sync/events`; the server ignores repeated event ids, so retries are safe.

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
  TRIP ||--o{ LOAD_CHECK : "loader ticks"
  TRIP_STOP ||--o{ DELIVERY_EVENT : "driver events (offline sync)"
  ORDER ||--o| RECEIPT : "store confirms"
```

Full definitions: `prisma/schema.prisma`.
