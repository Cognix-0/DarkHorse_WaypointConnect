# Waypoint Connect – rules for AI coding agents

Read this file before every task. Keep changes small: one task, one branch, one pull request.

## Stack
- TypeScript strict everywhere. pnpm workspaces.
- `apps/web`: React + Vite + Tailwind + React Router + TanStack Query. PWA via vite-plugin-pwa, offline outbox via Dexie.
- `apps/api`: Fastify + Zod + Prisma (PostgreSQL). Every route lives under `/api`.
- `packages/shared`: the API contract (`src/contract.ts`) and the planning engine (`src/engine/`).

## Hard rules
- Request and response shapes come ONLY from `packages/shared/src/contract.ts`. Never invent fields. If a shape must change, stop and tell the team.
- Planning rules live ONLY in `packages/shared/src/engine`. The UI and the API import them; never re-implement a rule.
- The engine has no npm dependencies. Keep it that way so it runs in the browser, the API and the tests.
- Every engine rule has a test in `packages/shared/test`. Run `pnpm test` before you finish.
- Colours, fonts and spacing come from the Tailwind theme tokens copied from Figma. No raw hex values in components.
- Stay inside your role folder: `apps/web/src/roles/<dispatcher|loader|driver|store>/`. Shared UI goes in `apps/web/src/ui/` (owner: Member 4).
- Use real IDs from `data/` (OUT001, VEH014). Units: crates (Fresh), cartons (Style), items (Tech); capacity checks use kg and m3.
- Times are Sri Lanka local time (Asia/Colombo). Order cutoff 16:00. Fresh window 03:30–08:00 (270 min); Style/Tech 480 min.

## Domain rules (from the Challenge Booklet)
- Chilled orders need a reefer vehicle. van_only outlets need a van. A vehicle serves only its home depot.
- Max 2 trips per vehicle per day. One brand and one district per trip. Orders are never split.
- Trip minutes = depot_to_district_freeflow_min + inter_stop_freeflow_min x (stops - 1) + sum of service_allowance_min(brand, dock_type).
- Every deferral has a reason and is marked `unavoidable` (no valid vehicle could take it) or `choice`.

## AI disclosure
After each task add one line to `docs/ai-disclosure.md`: date, member, what the AI generated, what you changed by hand, how you checked it.
