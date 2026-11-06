# Progress

Read this and PLAN.md first when resuming. Run `npm install`, then `npm run dev` (http://localhost:5173).

## Status
- Milestone 1 (swarm prototype): **done, gate passed, tagged `milestone-1`**
- Milestone 2 (the moving camp): **done, gate passed, tagged `milestone-2`**
- Milestone 3 (queen and director): **done, gate passed, tagged `milestone-3`**
- Current: Milestone 4 (multiplayer and the hive): all tasks built; gate run in progress (task 4.10)

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

### Milestone 3
- 3.1 Influence maps (danger / opportunity / memory, 4 m cells), debug views `danger`, `opportunity`, `memory`.
- 3.2 Queen utility AI: scores the 10 intents once a second; dual-utility pick (weighted random among those within 0.6 of the best), 6–16 s commitment, light repeat penalty; works within the director's budget and tendril-size ceiling; logs every choice with its tell.
- 3.3 Intent behaviours: conceal (small, oddly orderly), probe (scouts tap into light), sabotage (spread along dark cable, then the generator), flank (cheap digging through walls to the darkest side spot), undermine (under layer to the generator), reroute (dig fresh holes in walls you've seen), siege (one lamp, bravery grows until they rush the fixture), bait (15 brave bugs stand in your light), assault (3 s of nest-wide silence, then everything strikes), retreat (withdraw; drag the dead once learned).
- 3.4 Tells: each intent emits a tell event at the start and a pulse every 4 s; each has a generated sound signature; assault mutes the chitter and drone, then music flips on; undermine shakes the camera and the generator.
- 3.5 Electric belief per type (−0.02 per touch, rate-limited; +0.05 per lightning kill within 5 m; floor 0.1).
- 3.6 Learning tree: 9 habits → counters; fairness (only sensed habits count, nothing from dying, time fallbacks).
- 3.7 Hive Director: per-player intensity, Build Up → Sustain Peak → Peak Fade → Relax loop, act curve (relax 90/75/30/15 s), levers (budget, tendril size, breach permission, oil yield 0.75–1.25×, fallback pace). Runs open with a 45 s Relax. Prototype plays as act 2 unless `?act=N`.
- 3.8 Lightning gun (12 fuel, chains through up to 5, bodies, restores belief); on the floor in the test kit.
- Devices can be damaged and broken (siege, generator sabotage); hold R to repair.
- Debug panel: "force intent" selector.

### Milestone 4 (built; gate pending)
- 4.1 Transports: BroadcastChannel (same-machine tabs), PeerJS/WebRTC (online, untested here), in-memory (tests). Title lobby + `?host=CODE` / `?join=CODE&net=local|webrtc`.
- 4.2 Snapshot on join (terrain diff incl. every dug cell, camp, players, tendrils, swarm, fuel, belief); players at 20 Hz; tendrils 4 Hz; camp on change; terrain changes as they happen; misc 5 Hz; relayed tell/breach/fx events.
- 4.3 Swarm sync: clients steer bugs locally from synced tendrils and fields; host keyframes cover every bug 4×/s, quantised, soft-corrected (snap if >1.5 m).
- 4.4 PeerJS backend (same interface).
- 4.5 Proximity voice + walkie (V) + crushed/hive voice + voice as noise (PeerJS only, untested).
- 4.6 Downed → carrier group walks you to the queen (~45 s) → teammates scatter carriers and hold E to revive.
- 4.7 Devoured → hive player: steer ~60 bugs, queen's orders, will meter, swarm vision with light glare.
- 4.8 Respawn ritual: body of 60 → into the light → electrocuted ~10 s (live cable / lightning hits / solo bug zapper) → back at low health, −150 fuel; the queen sends a tendril to break it up. Everyone in the hive = run fails (solo: unless a powered bug zapper exists, 3 min limit).
- 4.9 Pause: Esc/P, host pauses everyone. (Save/load snapshot not done yet.)

### Milestone 5 (vertical slice, built)
- 5.1 Night layout (`src/sim/night.ts`): house → base → nest → intersection → nest → oil rig → deep nest → junkyard → queen's chamber, side loops; zones + marks + swarm pockets. Test: `tests/night.test.ts`.
- 5.2 Run structure (`src/sim/run.ts`): acts by progress, checkpoints (autosaved to `tunnels-checkpoint`), failure screen (Enter restart / C continue from checkpoint).
- 5.3 Act 1 house: job (8 zaps), flashlights, jingle, boss radio, power dies, basement plug opens.
- 5.4 Fuel tanks → flamethrower, oil rigs (+350/+500), lightning gun at the intersection. (Junk mods not done.)
- 5.5 Junkyard: Enlite suits (speed, flame range, X to dig), logo decals; queen's chamber egg sacs → rage.
- 5.6 Finale (`src/sim/finale.ts`): truck, roles, queen chase, keeper powers, x-ray, sunrise; true / hollow endings. Test: `tests/run.test.ts`.
- 5.7 Art/audio pass: zone palettes, jingle, radio static, sunrise chord. (No real dusk/sunrise lighting yet.)

## In progress
- 4.10 gate: `scripts/gate4.mjs` (run against a frozen build: `npx vite build --outDir dist-gate && npx vite preview --outDir dist-gate --port 4174`, then `BASE=http://localhost:4174/ node scripts/gate4.mjs`).

## Next
- M4: transport (BroadcastChannel + PeerJS), lobby, host/join, world snapshot, player sync, swarm sync (local sim + host keyframes), dig/camp/fuel events, carrying + revive, hive player + respawn ritual, pause.

## Known bugs / limits
- Headless Chromium has no GPU, so in-container fps numbers are software-rendered (5–12 fps). CPU cost per frame is the measured stand-in (see Gate results). Real-GPU fps needs a human run of `?bench`.
- Undermine tendrils only use the under layer when it's much cheaper than walking; M3's Undermine intent will force it.
- A sabotage tendril chews through cable in ~2 s once it arrives; before Sabotage is learned, nibbling cuts take ~45 s.
- With the autopilot (god mode, never fights back), Peak Fade usually ends by its 30 s timeout rather than by the fight resolving.
- The natural mix of intents varies run to run; a 15-minute Node run (seed 5) chose all 10.
- Floor eruptions are frequent: undermining tendrils dive under lit ground and come up in the dark behind you. Breaches count once per hole (10 s window).

## Gate results

### Milestone 3 — PASSED (2026-11-06)
| Check | How | Result |
| --- | --- | --- |
| Each queen intent triggers and shows its tell | `tests/queen.test.ts`: force each intent in an arena and check behaviour + tell | **10/10**: conceal (aligned few, <30 bugs near), probe (belief drops), sabotage (cable cut), flank (>5 cells dug through the wall), undermine (>20 bugs under the floor), reroute (fresh holes), siege (lamp damaged), bait (≤15 bugs standing at the spot), assault (silence with 0 striking, then >100 striking), retreat (mean distance +5 m) |
| Same, in the browser | `scripts/gate3.mjs` forces each intent for 8 s | **10/10** ran, each with 3 tell events, 0 console errors |
| Intents also arise naturally | `tests/natural.test.ts`, 15 min unscripted (seed 5, act 3) | all 10 chosen: undermine 3, siege 2, probe 3, reroute 2, bait 2, sabotage 2, flank 4, assault 2, conceal 1, retreat 14; conceal also confirmed in act 1 |
| Learning unlocks fire from player habits | `tests/learning.test.ts` (one test per habit + 3 fairness tests) | all 9 habits unlock their counter; no unlock without bugs sensing it; none while downed; time fallbacks work |
| Same, in the browser | gate3: lay 26 m of cable, flame 22 s, harvest 12 bodies | unlocked Sabotage (25 m of cable), Sabotage of the generator (3 cuts), Spreading out + Baiting (20 s of flame), Dragging the dead (12 bodies) |
| Director cycles its states, logged to console | `tests/director.test.ts`; gate3 reads the game's console | Build Up → Sustain Peak → Peak Fade → Relax → Build Up, with `[director t=…] A -> B (reason)` lines (7 in the browser run) |
| No console errors | gate3 | 0 |
| Regression | gate2 | PASS (cable now cut after ~48 s by nibbling, since Sabotage isn't learned yet; director yield lever capped at 1.25× so harvesting never pays back a zap) |

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
