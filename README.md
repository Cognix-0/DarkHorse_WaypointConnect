# Waypoint Connect

Delivery planning and tracking for Waypoint Group's three brands (Fresh, Style, Tech): one system for the **dispatcher**, the **loader**, the **driver** (works offline) and the **store manager**.
Tech-Triathlon 2026 · Team Dark Horse.

**Live demo:** https://3-106-77-179.sslip.io · Driver phone app: https://3-106-77-179.sslip.io/get-app (Android APK, or Add to Home Screen on iPhone) · Accounts and passwords: see *Accounts* below

## Run it

Deploying to a public server: see [`docs/deploy.md`](docs/deploy.md). Video plan: [`docs/video-script.md`](docs/video-script.md). Phone app (install or Android APK): [`docs/mobile.md`](docs/mobile.md).


```bash
cp .env.example .env        # change the CHANGE_ME values
docker compose up --build   # database + API (schema + seed) + web app + HTTPS
```

Open https://localhost (accept the local certificate once). On a server, set `DOMAIN` in `.env` to your domain and Caddy gets a real certificate.

### Accounts

Everyone has their own account (188 in all). Drivers sign in as their **vehicle**: each vehicle has one assigned driver, and no driver is assigned to two vehicles.

| Role | Email | How many | Linked to |
| --- | --- | --- | --- |
| Administrator | `admin@waypoint.lk` | 1 (more can be added) | everything: accounts, drivers on vehicles, system |
| Dispatcher | `dispatcher@waypoint.lk` | 1 | both depots: switches between Peliyagoda and Kandy in the console |
| Loader | `loader1.peliyagoda@waypoint.lk` … `loader3.kandy@waypoint.lk` | 3 per depot | their depot |
| Driver (vehicle) | `veh001@waypoint.lk` … `veh060@waypoint.lk` | 1 per vehicle | the vehicle and its assigned driver |
| Store manager | `out001@waypoint.lk` … `out120@waypoint.lk` | 1 per store | the store |

**Admin Console** (`admin@waypoint.lk`, `/admin`):
- **Vehicles & drivers**: put one driver on each vehicle from the driver list (60 drivers plus 6 spares). A driver already on another vehicle is moved only after confirming, so nobody drives two vehicles (the database enforces it too). Add new drivers. The vehicle's phone sign-in shows the new driver's name at once.
- **Accounts**: search all accounts, switch access on or off (a switched-off account cannot sign in and an open session stops at its next request), reset a password (the new one is shown once), and create dispatcher, loader or administrator accounts.
- **System**: database and API health, the working day and clock every screen uses, today's orders and plan per depot, and *Build today's orders* if a day is empty.

A restart never undoes the admin's work: driver assignments, switched-off accounts, reset passwords and new accounts all stay.

**Passwords are different for every account** and are never stored in plain text: each is derived from `ACCOUNT_SECRET` in `.env`. Print the list with `pnpm credentials` (on the server: `docker compose exec api pnpm -s credentials > credentials.csv`). Never commit that file. Judges receive the passwords for the walkthrough accounts with the submission.

**Every screen shows today** (Asia/Colombo date and time), so the dispatcher, loader, driver and store manager always agree. Each day is filled with the 85 Peliyagoda orders and 10 workshop vehicles of the official peak-day scenario (where chilled demand is about 32.8 t against 3 refrigerated trucks and 1 refrigerated van), built automatically shortly after midnight. Set `DEMO_DATE=YYYY-MM-DD` in `.env` to rehearse one fixed day instead.

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
- [x] Part 3 – Loader dock tablet (L1–L5) and offline driver phone app (M1–M8): goods lines in packs, problem reports, seal & release with carry-over, plan-change diff and acknowledgement, IndexedDB outbox + idempotent `POST /api/sync`, service worker (installable PWA)
- [x] Part 4 – Store manager screens (SM1–SM9, phone and desktop) and API, View POD for the dispatcher, judge walkthrough, deployment guide, video script
- [ ] Team – run on a real server, record the video, submit

## Dispatcher console (Part 2)

Sign in as `dispatcher@waypoint.lk`. Screens match Figma frames D1–D6 (`docs/screens/` has a capture of each):

| Screen | What the dispatcher does | API |
| --- | --- | --- |
| D1 Overview | Today's numbers, demand by brand, both depots, what needs attention | `GET /api/overview` |
| D2 Order Queue | 85 locked orders in priority order, filters, CSV export, orders after the 16:00 cutoff greyed out; **Auto-allocate & open board** | `GET /api/orders`, `POST /api/plans/suggest` |
| D3 Planning Board | Drag stops between vehicles and trips. Every drop is checked by the engine; a refused drop shows **Drop blocked** with the exact rule and vehicles that would take it. Weight/volume/time meters per trip, weekly fuel per vehicle, ETAs per stop | `GET /api/board`, `POST /api/plans/check-placement`, `PUT /api/plans/trips`, `POST /api/orders/:id/defer` |
| D4 Deferrals | Overload banner, three recovery options each re-planned by the engine (re-plan, release a workshop reefer, hire a reefer), the deferral table, and an explicit confirmation for any shop skipped twice; **Confirm & publish** tells every store | `GET /api/deferrals`, `POST /api/deferrals/options/:id`, `POST /api/deferrals/:id/confirm`, `POST /api/plans/publish` |
| D5 Live Tracking | Trip progress, ETA against each shop's window (on time / at risk / late / offline), alerts with actions | `GET /api/live`, `POST /api/live/alerts/:id/action`, `GET /api/events` (SSE) |
| D6 Capacity Forecast | Next 3 weeks: chilled demand vs reefer space, projected deferrals per day from the same engine, payday and New Year build-up | `GET /api/forecast` |

Publishing refuses a plan that breaks a rule, leaves an order neither planned nor deferred, or skips a shop twice without confirmation. Re-publishing raises the plan version (drivers refetch on a new version).

**Demo mode** (`DEMO_MODE=1`): Live Tracking has **Simulate morning**, which plays driver deliveries up to the current time so the walkthrough shows a live morning (one trip late, one offline) before the driver app exists. Real progress comes from the driver app's offline sync in Part 3.

**Timetable:** stop order is earliest-closing window first; ETAs use the booklet trip-time formula, so each trip's ETAs add up to its planned minutes. Fresh trips run inside 03:30–08:00 and a vehicle's second trip starts when the first ends (the planning standard does not count the return leg).

## Loader and driver (Part 3)

**Loader** (`loader1.peliyagoda@waypoint.lk`, dock tablet 1280 × 800, Figma L1–L5)

| Screen | What the loader does | API |
| --- | --- | --- |
| L1 Choose vehicle | Every vehicle on the published plan as a card: bay, departure, items loaded, who is loading it. Filters by status and brand. A banner appears when the dispatcher republishes. | `GET /api/loader/vehicles`, `POST /api/loader/trips/:id/claim` |
| L2 Load goods | Goods lines in packs, grouped by stop in load order (last stop first). Tick each line; progress, reefer range and seal-by countdown on the right. | `GET /api/loader/trips/:id`, `POST /api/loader/lines/:id/tick` |
| L3 Report a problem | Pop-up over the list: what happened, which item, how many packs, what happens next (carry over / replace / hold), photo and note. The dispatcher gets a Loader flag, the store is told, the driver's manifest shows the short count. | `POST /api/loader/trips/:id/problems` |
| L4 Plan changes | Plan v1 → v2 as a to-do list: which order moves from which vehicle to which. Mark moved, then acknowledge the new version (the dispatcher sees who and when). | `GET /api/loader/changes`, `POST /api/loader/changes/:orderId/moved`, `POST /api/loader/changes/ack` |
| L5 Seal & release | Summary, reefer temperature, seal number. Short packs become an order on the next run with a note for the next loader. | `POST /api/loader/trips/:id/seal` |

Goods: the competition data gives each order a unit count and a weight. `packages/shared/src/goods.ts` breaks every order into 2–4 product lines from a fixed catalogue (milk crates, chicken packs, rice bags, apparel cartons, boxed TVs…). The packs always add up to the order's units, so loader, driver and store count the same thing.

**Driver** (`veh024@waypoint.lk`, driver Nimal Fernando, phone 390 × 844, Figma M1–M8; vehicle VEH024, dry truck)

| Screen | What the driver does |
| --- | --- |
| M1 Today's runs | Trips, load status, fuel; notice when the plan changed |
| M2 Load check | What was loaded (and short), then **Confirm load & depart** (only once the loader has sealed) |
| M3 Route progress | Next stop with ETA against the window and late risk, done stops, Run / Stops / Sync tabs |
| M3A Navigate | Distance, drive time, ETA; hands over to Google Maps |
| M4 Stop arrival | Window, order, access, note, store manager to call; late-arrival warning |
| M5 Proof of delivery | Delivered / partial / refused, count, camera photo (shrunk to ~100 kB), receiver, signature |
| M6 Report a problem | Store closed, refused, damaged, no access, other; photo |
| M7 Offline / Sync | What is saved on the phone and waiting to send |
| M8 Back online | What was sent, and what changed in the plan while offline (was / now) |

**How offline works.** The service worker (`apps/web/public/sw.js`) caches the app, so it opens with no signal. The driver's route is kept in IndexedDB (`apps/web/src/offline/idb.ts`). Every action is an event with a UUID: it is applied to the phone's copy at once and put in an outbox; `POST /api/sync` sends the outbox in order when there is signal (on reconnect, and every 20 s). The server skips event IDs it has already seen, so a retry after a dropped connection never delivers twice. If the dispatcher republished meanwhile, the phone refetches the route and shows M8.

Try it: sign in as the driver once with signal, then in Chrome DevTools → Network choose **Offline** (or put the phone in airplane mode), reload, deliver a stop, then go back online.

A sealed or departed trip is locked: the Planning Board, defer and auto-allocate refuse to change its goods, and the board shows it as *Sealed · locked* / *On the road · locked*.

## Store manager (Part 4)

**Store manager** (`out026@waypoint.lk`, Nimali Perera, OUT026 Waypoint Fresh Gampaha; phone SM1–SM9 and desktop D-SM1–D-SM9 from the same screens). Captures: `docs/screens/d-sm*.png` and `sm*-phone.png`.

| Screen | What the store manager does | API |
| --- | --- | --- |
| SM1 Today | Cutoff countdown for tomorrow's orders, today's deliveries (track, confirm, or see why it was deferred), tomorrow, this week, recent activity, updates | `GET /api/store/today`, `GET /api/store/notifications` |
| SM2 Place order | Dry and chilled ordered separately, packs per product, copy last order, live weight and volume; can be changed until 16:00, later orders go on the following run | `GET /api/store/catalogue`, `POST /api/store/orders` |
| SM3 Order status | Received → Scheduled → Loaded → Delivered with times; edit before the cutoff | `GET /api/store/orders/:id` |
| SM4 Track delivery | Truck, ETA against the window (corrected by how late the driver runs), stops away, handling time, last driver update | same |
| SM5 Confirm receipt | Mark each line OK / Short / Damaged; photo and signature from the driver; issues go to the dispatcher (Live Tracking alert) | `POST /api/store/orders/:id/receipt` |
| SM6 Order deferred | Why (in plain words), what happens next, what it costs; accept the new day or cancel | `POST /api/store/orders/:id/deferral` |
| SM7 Orders · SM8 Receipts · SM9 Help | History with filters; receipts with 30-day stats; FAQ, dispatcher contact, outlet details | `GET /api/store/orders`, `GET /api/store/receipts` |

Store orders are built from the same goods catalogue as the loader's list (`packages/shared/src/goods.ts`), so the packs a store orders are the packs the loader ticks and the driver delivers.

## Judge walkthrough

About 15 minutes. Use a laptop for the dispatcher and loader, and a phone (or Chrome DevTools device mode) for the driver and store manager. Passwords: see *Accounts* above.

The working day is **today** (Asia/Colombo): 85 Peliyagoda orders from the official peak-day scenario, 10 vehicles in the workshop, chilled demand 32.8 t against 17 t of reefer space. Every screen runs on the real time, so all four roles agree. To rehearse at a set hour, pin `DEMO_DATE` and the `DEMO_*_CLOCK` values in `.env`.

**1. Dispatcher plans the day** (`dispatcher@waypoint.lk`)
1. **Overview**: 85 orders, reefer space at 193 %, "Needs your attention".
2. **Order Queue**: shops skipped on the last run are red at the top; 3 orders after the 16:00 cutoff are greyed and moved to Thursday. Click **Auto-allocate & open board**.
3. **Planning Board**: "All booklet rules pass", 75 of 85 orders on 34 trips. Choose *All available*, drag a stop marked *chilled* onto a **Dry truck** → **Drop blocked**: "… can't carry chilled goods", with the vehicles that would take it.
4. **Deferrals**: *Payday overload*, 10 orders deferred, each with its reason and *unavoidable*. Recovery options are re-planned by the engine (B and C serve 5 more orders). Click **Confirm & publish plan**. Every affected store is told.

**2. Store manager sees it** (`out026@waypoint.lk`, phone)
5. **Today**: dry groceries *Scheduled*, chilled *Deferred to Thu 26 Mar*. Tap **See why and what to do** → the reason in plain words → **Accept Thu 26 Mar delivery**.
6. **Place tomorrow's order** → *Copy last order* → change a few packs → **Submit**. (Until 16:00 it can be edited.)

**3. Loader loads** (`loader1.peliyagoda@waypoint.lk`, laptop or tablet)
7. **Choose vehicle** → **VEH024 trip 1** (Kurunegala) → tick every line → **Seal & release** (type any seal number).
8. **VEH024 trip 2** (Gampaha, OUT026) → on the first line press **!** → *Damaged goods*, 2 packs, *Load the rest, send the missing packs tomorrow* → **Send report**. Tick the rest → **Seal & release**: the 2 packs become an order on Thursday's run.
9. Dispatcher → **Live Tracking**: a *Loader flag* alert has appeared.

**4. Driver delivers, partly offline** (`veh024@waypoint.lk`, phone)
10. **Review load & start Trip 1** → **Confirm load & depart** → **I've arrived** → **Start unloading** → photo, signature → **Confirm delivery**.
11. Turn the signal off (airplane mode, or DevTools → Network → *Offline*). Reload the page: the app still opens. Deliver the next stop, or report a problem. The **Sync** tab shows what is waiting.
12. Turn the signal back on: **Back online** lists what was sent (and any plan change made meanwhile).
13. Trip 2 → deliver OUT026 (the store manager's shop): it shows *2 bags short from the dock*.

**5. Store confirms, dispatcher closes the loop**
14. Store manager → **Today** → **Confirm receipt** → mark one line *Short* → **Confirm receipt · 1 issue**.
15. Dispatcher → **Live Tracking**: *Store issue* and *POD* alerts; **View POD** shows the driver's photo and signature. **Simulate morning** fills in the rest of the fleet (one late truck, one offline).
16. **Capacity Forecast**: the next three weeks planned by the same engine, with the New Year build-up.

To start the demo again from a clean day: `docker compose down -v && docker compose up -d` (wipes the database and re-seeds).

## Departures from the Designathon design

- The sidebar shows the signed-in dispatcher (seeded as Ruwan Perera); the Figma frame shows "Nimal Perera".
- Sidebar items use line icons where the Figma frame has placeholder squares.
- Live Tracking's route column shows brand · district (one district per trip) instead of origin → destination.
- Loader and driver mock-ups show multi-district trips (e.g. "Gampaha → Colombo → Kalutara"); the app follows the booklet rule of one district per trip.
- The driver account drives VEH024 (dry truck, Peliyagoda): on the demo day the engine sends it to Kurunegala, then to Gampaha with the demo store's dry order, so one story runs through all four roles. The Figma frames use VEH041 / VEH035.
- M7 (offline) is the Sync tab plus an offline strip on the route; M8 (back online) is a sheet that opens by itself after the queue is sent.
- L5 adds a seal-number field (the rationale says the seal is scanned).
- The store manager account is OUT026 (Waypoint Fresh, Gampaha), matching the Figma story (dry delivered, chilled deferred); its order numbers follow the app's ORD-25xxx format.
- Store "Report a problem" and "Call dispatcher" open the phone dialler; there is no separate store problem form beyond Confirm receipt.
