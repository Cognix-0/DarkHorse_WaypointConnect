# AI tool disclosure

One line per task: date · member · what the AI generated · what we changed by hand · how we checked it.

| Date | Member | AI generated | Changed by hand | Checked by |
| --- | --- | --- | --- | --- |
| 2026-10-02 | Member 1 | Claude (Anthropic) scaffolded the monorepo, planning engine, tests, contract, Prisma schema, seed, Docker files and README from our build plan | — | 13 engine tests pass; engine output on the Task 2B peak day passes the official `check_allocation.py` |
| 2026-10-02 | Member 2 | Claude (Anthropic) built Part 2: trip timetable in the engine (+5 tests), dispatcher contract shapes, API routes (queue, board, suggest, check-placement, defer, confirm, publish, recovery what-ifs, live, simulate, forecast, SSE) and screens D1–D6 from the Figma file | — | 18 engine tests pass; official checker still PASSED; full dispatcher flow run against an in-memory database stand-in and each screen screenshotted at 1440×900. Not yet run on real PostgreSQL/`pnpm install` (package registry blocked in the AI's sandbox) — run `docker compose up --build` and the walkthrough before merging |
