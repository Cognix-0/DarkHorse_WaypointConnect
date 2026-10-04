# Waypoint Connect — handoff for the next AI coding session

Read this file and `CLAUDE.md` before doing anything. `CLAUDE.md` holds the hard rules: contract-only API shapes, engine-only planning rules, no raw hex in components, stay in your role folder, and an AI-disclosure line after every task.

## Project

- **What:** Team Dark Horse's entry for Rootcode Tech-Triathlon 2026, Hackathon part.
- **Deadline:** **Sun 4 Oct 2026, 23:59 Sri Lanka time.** The Datathon is separate and due Fri 9 Oct.
- **Required deliverables:**
  - A responsive web app for 4 roles.
  - A public GitHub monorepo: https://github.com/Cognix-0/DarkHorse_WaypointConnect (public, branch `main`).
  - `docker compose up` works and seeds the demo data.
  - A public HTTPS URL.
  - 4 seeded accounts.
  - A numbered judge walkthrough in the README.
  - `docs/`: architecture, data model, AI disclosure.
  - A 5–8 minute video.
- **Local folder:** `~/Downloads/DarkHorse_WaypointConnect` on Sandaru's MacBook Air.

## Stack

- pnpm monorepo, TypeScript strict.
- `apps/api`: Fastify 5 + Zod + Prisma 6 + PostgreSQL 16. Every route is under `/api`.
- `apps/web`: React 18 + Vite + Tailwind 3 + React Router 6 + TanStack Query 5.
  - Offline: service worker `public/sw.js`, IndexedDB outbox `src/offline/idb.ts`.
  - Installable as a PWA (`public/manifest.webmanifest`).
- `packages/shared`:
  - `src/contract.ts`: every request/response shape, as Zod.
  - `src/engine/`: dependency-free planning engine (rules, `suggestPlan`, `schedule.ts`).
  - `src/goods.ts`: product catalogue. Order lines are counted in packs, and the packs on an order always add up to its units.
- Tests: `packages/shared/test`, 21 tests, run with `pnpm test`. Official checker: `pnpm check:2b` (`check_allocation.py`).
- Docker: `db` (postgres), `api` (runs `prisma db push` + idempotent seed on every start), `web` (nginx serving the Vite build), `caddy` (HTTPS reverse proxy, `Caddyfile` uses `{$DOMAIN}`).

## What is built (all 4 roles)

- **Dispatcher, D1–D6** (`roles/dispatcher`):
  - Overview, Order Queue, Planning Board (drag/drop with engine rule checks and "Drop blocked" explanations), Deferral Review with recovery options, Live Tracking (alerts, View POD modal, Simulate morning), Capacity Forecast.
  - A teammate (M.M.B.V. Mudalige) later merged dispatcher UI changes and a new `Login.tsx` with depot-aware hooks.
- **Loader, L1–L5** (`roles/loader`): choose vehicle, load goods by stop (last stop first), report a problem, plan changes (v1→v2 acknowledge), seal & release. Short packs become a carry-over order on the next run.
- **Driver, M1–M8** (`roles/driver`, phone):
  - Today's runs, load check, route progress, navigate, stop arrival, proof of delivery (photo + signature), report problem, offline sync queue, back-online sheet.
  - Every action is an event with a UUID, sent through `POST /api/sync`. Sync is idempotent.
  - **New: fingerprint / Face ID unlock.**
    - Code: `roles/driver/biometric.ts` + `BiometricLock.tsx`.
    - It is a WebAuthn platform-authenticator app lock, verified locally (checks the UV flag) and works offline.
    - The offer card and the on/off row are at the bottom of Today's runs.
    - It relocks after 5 minutes in the background. "Use password instead" signs the driver out.
    - It is not server auth: the 12 h JWT and the password are still the real login.
- **Store manager, SM1–SM9** (`roles/store`, phone and desktop):
  - Today (cutoff countdown), Place order (from the goods catalogue; editable until 16:00), Order status / Track, Confirm receipt (OK/Short/Damaged per line → dispatcher alert), Order deferred (accept or cancel), Orders, Receipts, Help.
  - API: `apps/api/src/routes/store.ts`.
- **Plan lifecycle:** `PlanVersion` snapshots, `PlanAck`, `LoadMove`. Sealed or departed trips are locked against board, defer and auto-allocate.
- **Public `/get-app` page** (`apps/web/src/GetApp.tsx`, linked from Login):
  - Android install prompt, or an APK download if `public/downloads/waypoint-connect.apk` exists.
  - iPhone "Add to Home Screen" steps.
  - nginx serves `/downloads/*.apk` and `/.well-known/assetlinks.json`, and the service worker skips both.

## Demo story and accounts

- Password for all 4 accounts = `DEMO_PASSWORD` (default `waypoint-demo`). The seed resets the hashes on every API start.
- Accounts:
  - `dispatcher@waypoint.demo`: Ruwan Perera.
  - `loader@waypoint.demo`.
  - `driver@waypoint.demo`: Nimal Fernando, vehicle VEH024 (dry truck). Trip 1 goes to Kurunegala (OUT065, OUT069); trip 2 goes to Gampaha (OUT026).
  - `store@waypoint.demo`: Nimali Perera, OUT026 Waypoint Fresh Gampaha. Her dry order is delivered by VEH024 trip 2. Her chilled order is deferred (not enough reefer capacity).
- Demo day: `DEMO_DATE` (default 2026-03-25, a payday). The seed shifts the Task 2B S1 scenario (85 Peliyagoda orders) onto that date.
- Demo clocks:
  - `DEMO_CLOCK` 06:42 (live view), `DEMO_LOADER_CLOCK` 02:40, `DEMO_STORE_CLOCK` 14:18.
  - In `docker-compose.yml` these use `${VAR-default}`, so an **empty** value in `.env` means the real Asia/Colombo time.
- To test with today's real data and time, put this in `.env`:

  ```
  DEMO_DATE=2026-10-04
  DEMO_CLOCK=
  DEMO_LOADER_CLOCK=
  DEMO_STORE_CLOCK=
  ```

  Then run `docker compose down -v && docker compose up -d --build`. Delete `.env` to go back to the judges' demo.
- The README has the 16-step judge walkthrough and a "Departures from the Designathon design" list.

## Local run

```bash
docker compose up -d --build          # rebuild + restart after code changes
docker compose down -v && docker compose up -d --build   # wipe DB and re-seed
docker compose logs --tail=50 api     # errors
```

- Open https://localhost and hard-refresh with Cmd+Shift+R, because the service worker caches the app shell.
- The DB is published only on `127.0.0.1:${DB_HOST_PORT:-15432}`. Sandaru's Mac already uses 5432 (a local PostgreSQL) and 5433 (`fin-ai-db`).
  - When the DB container can't bind its port, `db`, `api` and `web` don't start, and Caddy then answers with an endless 308 redirect loop.
  - If the browser shows ERR_TOO_MANY_REDIRECTS, run `docker compose ps` first.
- TablePlus locally: `localhost:15432`, user `postgres`, DB `waypoint`, password = `DB_PASSWORD` (default `waypoint`).

## Deployment (not done yet)

- `docs/deploy.md`:
  - One-command install on an Ubuntu VPS (DigitalOcean was chosen):
    ```bash
    curl -fsSL https://raw.githubusercontent.com/Cognix-0/DarkHorse_WaypointConnect/main/scripts/server-setup.sh | bash
    ```
    The script installs Docker, adds swap, clones into `/opt/waypoint`, writes `.env` with random secrets, defaults the domain to `<ip-dashes>.sslip.io` (or `DOMAIN=...`), runs `up -d --build`, and waits for `/api/health`.
  - Also covers team DB access over an SSH tunnel (teammates' public keys go into `~/.ssh/authorized_keys`), backups, and troubleshooting.
- `.env` is gitignored. Never commit `.env`, `*.sql` backups or `*.keystore`.

## Mobile

- See `docs/mobile.md`.
- Android APK:
  - Built by the GitHub Actions workflow `.github/workflows/android-app.yml` (manual dispatch; inputs `domain` and `version_code`).
  - It uses Bubblewrap/TWA and `scripts/twa-manifest.mjs`. Package id: `lk.darkhorse.waypointconnect`.
  - Signing key comes from the repo secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`; without them it uses a throw-away key.
  - The artifact contains the apk, an aab and `assetlinks.json`. Copy the apk to `apps/web/public/downloads/waypoint-connect.apk` and `assetlinks.json` to `apps/web/public/.well-known/`, then redeploy.
  - **This workflow has never run.** It needs the live site. Fallback: pwabuilder.com.
- iPhone: Add to Home Screen only. The App Store or TestFlight needs a $99 Apple Developer account.

## Other docs

- `docs/architecture.md`: Mermaid diagrams, offline sync sequence, data model, store loop.
- `docs/video-script.md`: a 7-minute timed storyboard.
- `docs/ai-disclosure.md`: one line per task.
- `docs/screens/`: screenshots of every screen (d1–d6, l1–l5, m1–m8, d-sm1–d-sm9, sm*-phone).

## Status / open items (priority order for today)

1. **Commit and push** everything still uncommitted (driver fingerprint, Android workflow, `docs/mobile.md`, `.gitignore`, the DB port change to 15432, the `${VAR-default}` clock change, `docs/deploy.md`). Run `git status` to see what's left.
   - Earlier AI sessions left stale git lock files. If git complains, run `rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock .git/objects/*/tmp_obj_*`.
2. **Deploy** to the VPS (`docs/deploy.md`) and check the HTTPS URL. Run the README judge walkthrough end to end on it, then reset with `docker compose down -v && docker compose up -d`.
3. **Verify on real PostgreSQL / pnpm install.**
   - Most of the code was verified only against an in-memory Prisma stand-in plus Chromium screenshots, because the AI sandbox had no npm access.
   - Run `pnpm install && pnpm test && pnpm typecheck`, and fix anything real.
   - Also check that the teammate's dispatcher/login merge still builds and works with the store/driver/loader flows.
4. Run the Android workflow with the live domain; publish the APK on `/get-app`.
5. Record the video (`docs/video-script.md`) and submit: public URL, repo link, video.
6. Optional polish:
   - Fingerprint unlock for the store manager too (reuse `biometric.ts`).
   - QR code on `/get-app`.
   - A "Database access" check that the server's `docker compose` picked up the 15432 port line.
