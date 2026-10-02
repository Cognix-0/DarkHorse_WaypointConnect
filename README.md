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

On the official peak day it serves **72 of 85 orders on 32 trips** and defers 13, and `check_allocation.py` reports **FEASIBILITY: PASSED**.

## Status

- [x] Part 1 – Monorepo, Docker, contract, database schema + CSV seed, planning engine with tests, login API, web shell
- [ ] Part 2 – API endpoints (orders, plans, defer, publish, loader, driver, sync, store, live events) + dispatcher screens
- [ ] Part 3 – Loader and driver apps, offline outbox and sync (PWA), optional Android APK
- [ ] Part 4 – Store manager screens, judge walkthrough, deployment, video

## Judge walkthrough

Written in Part 4, once every screen is connected.

## Departures from the Designathon design

None yet. Record any change from the Figma file here.
