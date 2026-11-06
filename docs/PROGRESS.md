# Progress

Read this and PLAN.md first when resuming. Run `npm install`, then `npm run dev` (http://localhost:5173).

## Status
- Milestone 1 (swarm prototype): **done, gate passed, tagged `milestone-1`**
- Current: Milestone 2 (the moving camp), task 2.1

## Done
### Milestone 1
- 1.1–1.3 Scaffold (Vite + TS + Three), config, seeded RNG, grid, 10 hand-built segments stitched from a seed.
- 1.4 Chunked organic terrain mesh; dig/collapse rebuild only the touched chunks.
- 1.5 First-person controller with grid collision.
- 1.6 Debug overlay + panel.
- 1.7 Light map (point + cone, grid line of sight, raw vs effective/belief light).
- 1.8–1.9 Two-layer flow field (surface + under-floor), dig cost, light cost; field manager with per-field caching, throttled rebuilds, Web Worker.
- 1.10 Spatial hash. 1.11 Swarm steering (flow + boids + light push), states flow/mass/strike/burn. 1.12 Instanced bug mesh (1 draw call, shader legs).
- 1.13–1.14 Digging + breach rule (dark and unseen only; otherwise bugs scratch and wait inside the wall / under the floor). Floor and ceiling eruptions from the under layer.
- 1.15 M1 queen: tendrils per ~100 bugs, mass phase → strike when an opening exists → retreat after heavy burn losses. Massing tendrils hold 3.5 m out in the dark.
- 1.16 Flamethrower: particles, burn state, fire spread, burning bugs are fire light, fresh holes collapse under fire.
- 1.17 Overwhelm meter; downed → respawn at start after 3 s (stand-in until M4 carrying).
- 1.18 Debug views: flow (surface/under), light, visibility + dig progress; top-down camera.
- 1.19 Tells v1: wall cracks grow where bugs dig toward a face, scratching audio, dirt trickles above under-floor bugs, breach bursts.
- 1.20 `?bench` scene, `scripts/bench.mjs`, `scripts/check-console.mjs`, `scripts/shot.mjs`, `scripts/gate1.mjs`.

## In progress
- (none)

## Next
- M2: inventory slots, fuel pool, generator, devices, wire reel, wire cutting/repair, packing up, hive oil.

## Known bugs / limits
- Headless Chromium has no GPU, so in-container fps numbers are software-rendered (5–12 fps). CPU cost per frame is the measured stand-in (see Gate results). Real-GPU fps needs a human run of `?bench`.
- Undermine tendrils only use the under layer when it's much cheaper than walking; M3's Undermine intent will force it.
- M1 queen strikes on a fixed rhythm (~14 s mass, ~9 s strike); M3 replaces this with the director + utility AI.

## Gate results

### Milestone 1 — PASSED (2026-11-06)
| Check | Stand-in | Result |
| --- | --- | --- |
| 60 fps with 500 bugs | CPU time per frame (sim + render submit) in the `?bench` scene must fit a 16.7 ms frame with headroom (< 8 ms) | avg **2.0 ms**, p95 5.6 ms, 500 bugs drawn, 45 draw calls (bugs = 1 instanced call). Headless software-GL fps: 10 |
| Sim scaling (Node, no render) | `tests/perf.test.ts` | 500 bugs 1.5 ms, 1,000 bugs 2.2 ms, 3,000 bugs 5.2 ms per step (fields built synchronously in the test) |
| Bugs avoid lit cells, mass at the edge | `tests/swarm.test.ts` | 250 bugs aimed at a lamp: **0** in lit cells; nearest 3.93 m, median 4.40 m from the lamp vs a computed light edge of 4.21 m; 100% within edge + 2.5 m. Lamp off → all 250 within 2 m in 4 s |
| Bench scene in browser | bench result | 499 of 500 massing, 0 in light at measurement |
| Dig and breach only at dark spots | `tests/swarm.test.ts` | Watched wall: 8 interior cells dug, 0 face cells opened, 0 breaches. Lit face: never opened. Turning away: breaches happen, all dark + unseen. Under-floor eruptions: all dark + unseen |
| Same, in the real stitched nest | `scripts/gate1.mjs`, 60 s game time, autopilot wandering/looking | 26 digs, 4 breaches (1 wall, 2 floor, 1 ceiling); **0 seen, 0 lit** |
| No console errors | `scripts/gate1.mjs` (bench + nest) | **0** |
