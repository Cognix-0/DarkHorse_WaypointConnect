# Demo video script (target 7 minutes, limit 5–8)

One story through all four roles on the demo payday (Wed 25 Mar 2026): the engine can't fit all the chilled orders, and the system makes sure every person knows what happens next.

**Before recording**
- Reset the server: `docker compose down -v && docker compose up -d`.
- Laptop at 1440 × 900 for the dispatcher and loader. For the driver and store use a real phone (screen mirrored, e.g. QuickTime / scrcpy) or Chrome DevTools device mode at 390 × 844.
- Sign in to all four accounts in separate browser profiles or windows beforehand so there's no typing on camera.
- Record screen + voice-over; cut later. Keep the mouse slow. Zoom in (editor) on small text.
- Have a photo ready for the driver's proof of delivery (or point the phone camera at a box).

| Time | Screen (who) | What to show | Voice-over (say roughly this) |
| --- | --- | --- | --- |
| 0:00–0:25 | Title card → login page | Team name, product name | "Waypoint delivers to 300 stores from three depots every night. On a payday, there's more chilled demand than refrigerated trucks. Waypoint Connect plans that night and keeps the dispatcher, loaders, drivers and store managers on the same page." |
| 0:25–0:55 | Dispatcher · Overview | 85 orders, reefer space 193 %, *Needs your attention* | "It's Wednesday the 25th, a payday. 85 orders for Peliyagoda, 10 trucks in the workshop, and chilled demand nearly double the reefer space." |
| 0:55–1:30 | Dispatcher · Order Queue | Red *skipped last run* rows on top; greyed late orders; click **Auto-allocate & open board** | "Stores skipped last time go first. Orders after the 4 PM cutoff move to tomorrow automatically. One click runs our planning engine." |
| 1:30–2:20 | Dispatcher · Planning Board | *All booklet rules pass*; drag a chilled stop onto a dry truck → **Drop blocked** with alternatives | "75 orders on 34 trips, every booklet rule checked: reefer for chilled, vans for van-only stores, two trips per vehicle, one brand and district per trip. If I try to break a rule, the board stops me and suggests a vehicle that can take it. The same engine code runs in the browser, the API and our tests." |
| 2:20–2:55 | Dispatcher · Deferrals | Reasons, *unavoidable*, recovery options B/C; **Confirm & publish plan** | "Ten chilled orders can't fit. Each has a reason in plain words and is marked unavoidable. Recovery options are re-planned by the engine, not guessed. Publish, and every affected store is told." |
| 2:55–3:35 | Store · Today → Order deferred (phone) | Dry *Scheduled*, chilled *Deferred*; reason; **Accept Thu 26 Mar delivery** | "Nimali runs our Gampaha store. She sees her dry order is planned and her chilled order moved to Thursday, why, and that she's first in the queue. One tap to accept." |
| 3:35–3:55 | Store · Place order | *Copy last order*, change packs, weight/volume update, **Submit** | "Tomorrow's order: copy last time, adjust, submit. Weight and volume are live because they decide which vehicle can carry it." |
| 3:55–4:40 | Loader · Choose vehicle → Load goods → Report problem → Seal | VEH024 trip 2: tick lines, **!** → 2 damaged packs → seal | "At 2:40 AM the loader picks VEH024, ticks packs in load order, last stop first. Two packs are damaged: she reports it, the dispatcher gets a flag, and on seal the missing packs become an order on tomorrow's run automatically." |
| 4:40–5:40 | Driver · M1 → M2 → M3 → M5 (phone) | Confirm load & depart; arrive; photo + signature; then **airplane mode**, reload, deliver offline; Sync tab; back online | "Nimal drives VEH024. He confirms the load, follows the route with ETAs against each store's window, and records proof of delivery with a photo and signature. Rural roads lose signal: the app keeps working offline, queues each event with a unique ID, and sends it when the signal returns. Nothing is lost or sent twice." |
| 5:40–6:10 | Store · Confirm receipt | Mark a line *Short* → **Confirm receipt · 1 issue** | "Nimali checks the delivery against the packs ordered and marks one line short. That goes straight to the dispatcher." |
| 6:10–6:45 | Dispatcher · Live Tracking | *Store issue* and *POD* alerts; **View POD** (photo + signature); **Simulate morning** → late and offline trucks | "The dispatcher sees every truck against its windows, the loader flag, the store issue, and the driver's proof of delivery, live." |
| 6:45–7:05 | Dispatcher · Capacity Forecast | Next three weeks, New Year build-up | "And the same engine looks three weeks ahead, so the reefer shortfall before New Year is visible now, not on the night." |
| 7:05–7:20 | Architecture slide (from `docs/architecture.md`) + URL | Monorepo diagram, public URL, GitHub link | "TypeScript monorepo, one shared engine with tests, PostgreSQL, Docker, live on HTTPS. Thank you." |

**Cut list if over 8 minutes:** shorten Place order (3:35) and Capacity Forecast (6:45) first; never cut the offline part or the deferral reason, they are the strongest points.

**Checks after export:** length 5–8 min; 1080p; voice audible over any music; no passwords or `.env` on screen; the public URL shown at the end is the one in the submission.
