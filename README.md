# Waypoint Connect

Delivery planning and tracking for Waypoint Group's three brands (Fresh, Style, Tech): one system for the **dispatcher**, the **loader**, the **driver** (works offline) and the **store manager**.
Tech-Triathlon 2026 · Team Dark Horse.

## Run it

```bash
cp .env.example .env        # change the CHANGE_ME values
docker compose up --build   # database + API (schema + seed) + web app + HTTPS
```

Open https://localhost (accept the local certificate once). On a server, set `DOMAIN` in `.env` to your domain and Caddy gets a real certificate.

### Demo accounts

| Role | Email | Linked to |
| --- | --- | --- |
| Dispatcher | dispatcher@waypoint.demo | Peliyagoda depot |
| Loader | loader@waypoint.demo | Peliyagoda depot |
| Driver | driver@waypoint.demo | VEH036 (reefer van) |
| Store manager | store@waypoint.demo | OUT012, Waypoint Fresh, Colombo |

Password: the `DEMO_PASSWORD` value in `.env` (default `waypoint-demo`).

The seed loads all 120 outlets and 60 vehicles from `data/`, plus one realistic delivery day, **Wed 25 Mar 2026 (payday)**: the 85 Peliyagoda orders and 10 workshop vehicles of the official peak-day scenario, where chilled demand is about 32.8 t against 3 refrigerated trucks and 1 refrigerated van.

## Develop

```bash
corepack enable && pnpm install
docker compose up -d db                  # or any local PostgreSQL; set DATABASE_URL in .env
pnpm prisma db push && pnpm db:seed
pnpm dev:api                             # http://localhost:3000/api/health
pnpm dev:web                             # http://localhost:5173
pnpm test                                # planning engine tests
pnpm check:2b                            # engine on the official peak day + official checker
```

## Repository

| Path | What | Owner |
| --- | --- | --- |
| `packages/shared/src/engine` | Planning engine: rules, trip time, priority, Suggest plan. No dependencies. | Member 1 |
| `packages/shared/src/contract.ts` | API contract (Zod). All request/response shapes. | Member 1 (changes by team agreement) |
| `apps/api` | Fastify API under `/api` | Member 1 |
| `prisma/` | Database schema and CSV seed | Member 1 |
| `apps/web/src/ui` | Shared UI kit and tokens from Figma | Member 4 |
| `apps/web/src/roles/dispatcher` | Dispatcher screens | Member 2 |
| `apps/web/src/roles/loader`, `driver` | Loader and offline driver apps | Member 3 |
| `apps/web/src/roles/store` | Store manager screens | Member 4 |
| `docs/` | Architecture, data model, AI tool disclosure | All |

AI coding agents read `CLAUDE.md` first.

## Planning engine

The engine enforces every operating constraint in the Challenge Booklet: weight and volume caps, chilled goods on reefers only, van-only outlets, home depot, workshop vehicles, one brand and one district per trip, at most two trips, the 270-minute Fresh window and 480-minute Style/Tech day (booklet trip-time formula), and the weekly fuel quota.

Suggest plan places orders in priority order (skipped last run, Fresh chilled, Fresh ambient, Tech, Style), keeps reefers for chilled goods and vans for van-only outlets, and defers what cannot legally fit as `unavoidable`, with the reason.

On the official peak day it serves **72 of 85 orders on 32 trips** and defers 13, and `check_allocation.py` reports **FEASIBILITY: PASSED**. (In the app the same day serves 75: the database marks a shop as skipped for all its orders, so the priority order differs slightly from the per-row CSV flag.)

## Status

- [x] Part 1 – Monorepo, Docker, contract, database schema + CSV seed, planning engine with tests, login API, web shell
- [x] Part 2 – Dispatcher: API (queue, board, suggest, drag-and-drop checks, defer, second-deferral confirmation, publish, recovery what-ifs, live tracking, capacity forecast, Server-Sent Events) + screens D1–D6 from the Figma file
- [ ] Part 3 – Loader and driver apps + their API (loader, driver, sync), offline outbox (PWA), optional Android APK
- [ ] Part 4 – Store manager screens, judge walkthrough, deployment, video

## Dispatcher console (Part 2)

Sign in as `dispatcher@waypoint.demo`. Screens match Figma frames D1–D6 (`docs/screens/` has a capture of each):

| Screen | What the dispatcher does | API |
| --- | --- | --- |
| D1 Overview | Today's numbers, demand by brand, both depots, what needs attention | `GET /api/overview` |
| D2 Order Queue | 85 locked orders in priority order, filters, CSV export, orders after the 16:00 cutoff greyed out; **Auto-allocate & open board** | `GET /api/orders`, `POST /api/plans/suggest` |
| D3 Planning Board | Drag stops between vehicles and trips. Every drop is checked by the engine; a refused drop shows **Drop blocked** with the exact rule and vehicles that would take it. Weight/volume/time meters per trip, weekly fuel per vehicle, ETAs per stop | `GET /api/board`, `POST /api/plans/check-placement`, `PUT /api/plans/trips`, `POST /api/orders/:id/defer` |
| D4 Deferrals | Overload banner, three recovery options each re-planned by the engine (re-plan, release a workshop reefer, hire a reefer), the deferral table, and an explicit confirmation for any shop skipped twice; **Confirm & publish** tells every store | `GET /api/deferrals`, `POST /api/deferrals/options/:id`, `POST /api/deferrals/:id/confirm`, `POST /api/plans/publish` |
| D5 Live Tracking | Trip progress, ETA against each shop's window (on time / at risk / late / offline), alerts with actions | `GET /api/live`, `POST /api/live/alerts/:id/action`, `GET /api/events` (SSE) |
| D6 Capacity Forecast | Next 3 weeks: chilled demand vs reefer space, projected deferrals per day from the same engine, payday and New Year build-up | `GET /api/forecast` |

Publishing refuses a plan that breaks a rule, leaves an order neither planned nor deferred, or skips a shop twice without confirmation. Re-publishing raises the plan version (drivers refetch on a new version).

**Demo mode** (`DEMO_MODE=1`, `DEMO_CLOCK=06:42` in `.env`): Live Tracking has **Simulate morning**, which plays driver deliveries up to the clock so the walkthrough shows a live morning (one trip late, one offline) before the driver app exists. Real progress comes from the driver app's offline sync in Part 3.

**Timetable:** stop order is earliest-closing window first; ETAs use the booklet trip-time formula, so each trip's ETAs add up to its planned minutes. Fresh trips run inside 03:30–08:00 and a vehicle's second trip starts when the first ends (the planning standard does not count the return leg).

## Judge walkthrough

Written in Part 4, once every screen is connected.

## Departures from the Designathon design

- The sidebar shows the signed-in dispatcher (seeded as Ruwan Perera); the Figma frame shows "Nimal Perera".
- Sidebar items use line icons where the Figma frame has placeholder squares.
- Live Tracking's route column shows brand · district (one district per trip) instead of origin → destination.
