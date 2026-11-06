# Progress

Read this and PLAN.md first when resuming. Run `npm install`, then `npm run dev` (http://localhost:5173).

## Status
- Milestone 1 (swarm prototype): **done, gate passed, tagged `milestone-1`**
- Milestone 2 (the moving camp): **done, gate passed, tagged `milestone-2`**
- Current: Milestone 3 (queen and director), task 3.1

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

### Milestone 2
- 2.1 Inventory: 3 slots (1/2/3, scroll), Q drop, E pick up; floor items; held-item view model.
- 2.2 Shared fuel pool (1,500) with per-reason accounting; wrist gauge; fuel-out event (run failure; M5 adds the menu).
- 2.3 Generator: two-handed (needs all 3 slots empty, fills them, 60% speed), RMB place, E start/stop, hold E lift, hum.
- 2.4 Lamp, floodlight (cone, RMB aim), motion lamp (on when bugs within 5 m), splitter. Placing frees the slot.
- 2.5 Wire reel: E on a source with a spool, cable pays out, 15 m tether, alternate LMB/RMB to wind in, E on a device connects; Q leaves the end on the floor, E picks it back up; power graph (generator 2 outs, devices 1 in/1 out, splitter 1 in/2 out).
- 2.6 Bugs chew dark cable (sabotage tendril at full rate, other bugs at 15%); cuts flash red; hold R to repair.
- 2.7 Packing: E packs a device (lights go out, cables drop), E on a cable coils it to a spool, hold E lifts the generator.
- 2.8–2.10 Bodies from zapper / stomp (Space) kills; E harvests +2 each; fire kills leave nothing. Zapper 3 fuel per kill. Flashlight battery (240 s) recharges at a running generator (3 fuel per full charge). Flamethrower 6/s.
- 2.11 Tab war map.
- M2 test kit at the start (the house/van comes in M5): flashlight, flamethrower, spool in hand; generator, 2 lamps, floodlight, motion lamp, 3 spools, splitter, zapper on the floor.

## In progress
- (none)

## Next
- M3: influence maps, utility-AI queen with all 10 intents + tells, electric belief, learning tree, Hive Director, lightning gun.

## Known bugs / limits
- Headless Chromium has no GPU, so in-container fps numbers are software-rendered (5–12 fps). CPU cost per frame is the measured stand-in (see Gate results). Real-GPU fps needs a human run of `?bench`.
- Undermine tendrils only use the under layer when it's much cheaper than walking; M3's Undermine intent will force it.
- M1 queen strikes on a fixed rhythm (~14 s mass, ~9 s strike); M3 replaces this with the director + utility AI.
- Cable gets chewed very fast once a sabotage tendril reaches it (2 s); tuning belongs to the M3 director/intent work.
- Floor eruptions are frequent: undermining tendrils dive under lit ground and come up in the dark behind you. Breaches count once per hole (10 s window).

## Gate results

### Milestone 2 — PASSED (2026-11-06)
Node: `tests/camp.test.ts` (12 tests). Browser: `scripts/gate2.mjs` drives the real game at seed 1 with 600 bugs; passed 3 runs out of 3 after fixing a flaky test setup (see below).
| Check | Result |
| --- | --- |
| Camp set up | generator lifted (needed empty hands, filled all 3 slots), placed and running; lamp placed 12.9 m of cable away; cable connected; lamp powered and lit |
| Packed and moved | lamp packed, cable coiled to a spool, generator lifted (all devices gone = lights out), camp set up again 12.6 m away and powered |
| Wires connect / get cut / get repaired | connect powers downstream; the swarm cut the cable 2.0–2.4 s after it went live (21 cut segments by the time the script reacted); lamp went dark; after burning the chewers off, every cut repaired and the lamp came back on |
| Fuel drains correctly | 20 s window: generator 0.3339 vs expected 0.3339; lamp 0.0201 vs expected 0.0201 (integrated over the time it was actually powered). Node test over 10 min of gen + 2 lamps + floodlight: matches the GDD table (40.0) |
| Hive oil harvests correctly | zapper: 3 kills, 9 fuel spent, 3 bodies, +6 oil (net −3: harvesting returns less than it cost); fire kill left 0 bodies; stomp leaves a body (Node) |
| No console errors | 0 |
| M1 regression (`scripts/gate1.mjs`) | still PASS: 2.1 ms CPU/frame; all breaches dark + unseen |

Flaky-test note: the first harvest check spawned bugs next to the generator's glow; they sometimes fled out of the zapper cone before it fired. Moved the check to a dark stretch of tunnel.

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
