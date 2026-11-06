# Tunnels — Build Plan

Source of truth: `docs/GDD.md`. This plan turns the GDD's five-milestone build plan into small tasks (each under an hour), each with a "done when" check. Unclear points go to `docs/QUESTIONS.md`; progress goes to `docs/PROGRESS.md`; the morning report is `docs/REVIEW.md`.

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build / dev server | Vite (`npm run dev`) | Required; fast HMR, native workers (`new Worker(new URL(...), {type:'module'})`) |
| Language | TypeScript (non-strict, `tsc --noEmit` as a check) | Catches mistakes during long unattended work without slowing iteration |
| 3D | Three.js | Required. `InstancedMesh` for bugs, chunked merged geometry for terrain |
| Flow fields | Dijkstra over the cell grid inside a Web Worker | Required. Main thread never runs field builds (except in Node tests) |
| Neighbour checks | Uniform spatial hash (1 m buckets, counting sort into flat Int32Arrays) | Required; O(n) rebuild each frame |
| Audio | Web Audio, all sounds synthesised at runtime | No external assets |
| Networking (M4) | Transport interface with two backends: `BroadcastChannel` (same-machine tabs, used by the automated gate) and PeerJS/WebRTC (room code, cross-machine) | Free; the gate is two tabs on one machine |
| Unit / sim tests | Vitest, running the pure simulation in Node (no rendering) | Gate checks must be automated |
| Browser checks | Playwright (pre-installed Chromium) scripts in `scripts/` | Console-error checks, benchmark runs, two-tab sync |

All art is low-poly primitives; all sound is generated. No paid services.

## Architecture rules (from the GDD and the brief)

1. **Queen → tendrils → bugs.** The queen picks intents and goals. Each tendril owns a goal and *shares* one flow field (fields are cached by goal + parameters, so tendrils with the same goal reuse one field). Bugs never path: each frame a bug reads its tendril's field direction, adds boids (separation, alignment, cohesion via the spatial hash) and a push away from light, and moves. No per-bug pathfinding anywhere.
2. **Light is a path cost.** Every light rasterises into a light grid. Effective repel light (fire × 1, electric × belief) is written into the field cost, so routes avoid light and bugs end up at the light's edge, where their steering holds them (mass) instead of letting them charge in.
3. **Digging falls out of the same field.** Cells are `OPEN`, `SOLID` (diggable earth) or `ROCK` (world border, never diggable). Solid cells cost `DIG_COST` in the field, so routes go through earth when that's cheaper. A bug whose field step points into solid earth digs that cell; when dig progress completes the cell turns `OPEN` for everyone (a living map).
4. **Two layers.** Every cell has a surface node and an *under* node (earth beneath the floor). Under nodes cost more and never open; they let tendrils undermine and erupt through the floor. (See QUESTIONS.md Q1.)
5. **Breaches only at dark, unseen spots.** Opening a solid cell that faces an open area, or erupting from the under layer, is allowed only when the target cell's raw light is below `DARK_THRESHOLD` and no player can currently see it (grid ray-cast visibility, refreshed ~6 Hz). Otherwise the bugs wait inside the wall or under the floor — massing out of sight.
6. **Sim and render are separate.** `src/sim/` is pure TypeScript with no Three.js imports, so Node tests can run it headless. `src/render/` reads sim state.
7. **Host-authoritative later.** Sim systems take inputs as plain data (player states, lights, events), so the M4 host can run the queen/director/digs and broadcast events.

## Folder structure

```
tunnels/
  index.html              entry; HUD + debug panel markup
  package.json            scripts: dev, build, typecheck, test, check:*
  vite.config.ts
  tsconfig.json
  src/
    main.ts               boot: reads URL flags (?bench, ?seed, ?host, ?join), starts Game
    config.ts             every tuning number from the GDD in one place
    core/                 rng (seeded), math helpers, event bus, logger
    sim/
      grid.ts             cell grid: OPEN/SOLID/ROCK, dig progress, hive-dug flags, versions
      segments.ts         hand-built tunnel segments (ASCII) with connectors
      worldgen.ts         stitches segments into a nest layout from a seed
      light.ts            light sources → light grid (raw + effective repel), line of sight
      visibility.ts       per-player seen-cells mask (grid ray casts)
      flowfield.ts        pure Dijkstra over the two-layer graph (used by the worker and tests)
      flowWorker.ts       Web Worker wrapper around flowfield.ts
      fieldManager.ts     field cache, rebuild requests, throttling, worker messaging
      spatialHash.ts      bucket grid for neighbour queries
      swarm.ts            bug pool (struct-of-arrays), steering, states, digging, breaching
      tendril.ts          tendril records: goal, members, mode, field key
      queen.ts            utility AI over intents (M1: basic; M3: full)
      director.ts         Hive Director pacing loop (M3)
      learning.ts         learning tree (M3)
      fire.ts             flame particles, burning, spread, breach collapse
      camp.ts             generator, devices, wires, power graph (M2)
      fuel.ts             shared fuel pool + drains + harvest (M2)
      world.ts            owns all sim systems; one step(dt) entry point
    render/
      terrainMesh.ts      chunked wall/floor/ceiling meshes rebuilt on dig
      bugMesh.ts          instanced bugs
      lights.ts           pooled Three.js lights mirroring sim lights
      fx.ts               flames, dust, dirt trickle, wall cracks
      debugViews.ts       flow-field / light-cost / visibility overlays (DataTexture)
    game/
      game.ts             main loop, wiring of sim + render + input
      player.ts           first-person controller + collision
      input.ts            keyboard/mouse/pointer lock
      items.ts            inventory slots + item behaviours
      hud.ts              fuel gauge, slots, damage vignette
    audio/
      synth.ts            generated sounds: chitter, scratch, flame, hum, tells
    net/                  (M4) transport.ts, protocol.ts, session.ts
    debug/
      overlay.ts          FPS, bug count, frame timings
      panel.ts            toggles + bug-count slider
      bench.ts            benchmark scene + measurement
  tests/                  vitest: flowfield, light, swarm behaviour, camp, queen, director
  scripts/                playwright checks: check-console, bench, two-tab sync
  docs/                   GDD, PLAN, PROGRESS, QUESTIONS, REVIEW
```

## Working loop

Implement one task → `npm run typecheck && npm test` → run the relevant browser check → commit → update PROGRESS.md. `main` must start with `npm run dev` after every commit. At each gate: run the gate checks, record results in PROGRESS.md, tag `milestone-N`.

---

## Milestone 1 — Swarm prototype (solo, a few tunnel segments)

GDD contents: flow fields, boids, light as path cost, digging and breaches, flamethrower. Gate (self-checked): benchmark scene holds 60 fps with 500 bugs; automated check confirms bugs avoid lit cells and mass at the light's edge; bugs dig and breach only at dark spots; no console errors.

| # | Task | Done when |
| --- | --- | --- |
| 1.1 | Scaffold Vite + TS + Three, scripts (`dev`, `build`, `typecheck`, `test`), empty scene renders | `npm run dev` serves a page with a black scene; `npm run build` passes |
| 1.2 | `config.ts`, seeded RNG, `grid.ts` (cell types, index helpers, dig progress, change versions) | Unit test: grid set/get, bounds, ROCK border |
| 1.3 | `segments.ts` + `worldgen.ts`: 6+ ASCII segments (32×32 cells, 0.5 m) with edge connectors, stitched into a 4×3 layout from a seed | Unit test: every open cell reachable from the start; same seed → same layout |
| 1.4 | Terrain renderer: chunked (16×16) merged geometry of exposed wall faces, floor and ceiling, with position-hashed jitter for an organic look; rebuild a chunk on change | Walk-through screenshot shows tunnels; dig event rebuilds only one chunk |
| 1.5 | First-person player: pointer lock, WASD, sprint/crouch, collision against solid cells | Can walk the tunnels without passing through walls |
| 1.6 | Debug overlay (FPS, frame ms, bug count) and debug panel skeleton (toggles, bug slider) | Overlay visible and updating |
| 1.7 | `light.ts`: point / cone lights rasterised with grid line of sight; raw + effective grids; flashlight on the player | Unit test: wall blocks light; cone respects angle; falloff monotonic |
| 1.8 | `flowfield.ts`: two-layer Dijkstra, cost = step × (base + light cost); dig cost for solid; under layer; direction codes | Unit tests: path avoids lit cells when a dark detour exists; goes through earth when cheaper; ROCK impassable |
| 1.9 | `flowWorker.ts` + `fieldManager.ts`: cache by key, throttled rebuilds on grid/light/goal change, results applied asynchronously | Fields arrive from the worker; rebuild count/ms shown in overlay |
| 1.10 | `spatialHash.ts` | Unit test: query returns exactly the bugs within radius |
| 1.11 | `swarm.ts`: bug pool (SoA), steering = field dir + boids + light push; light tolerance; states flow/mass/strike/burn | Node test: 200 bugs aimed at a lit goal end up ringed at the light edge with ~0 bugs in lit cells |
| 1.12 | Instanced bug renderer (low-poly, glossy, many-legged, leg wiggle in shader) | 500 bugs drawn in one draw call |
| 1.13 | Digging: field steps into solid → dig progress → cell opens; hive-dug cells tracked; terrain rebuild | Node test: a tendril sealed off from its goal digs through to it |
| 1.14 | Visibility mask + breach rule: opening a wall-face cell / erupting from under only when dark and unseen; otherwise wait | Node test: with the target cell lit or seen no breach happens; once dark and unseen it does |
| 1.15 | Basic queen + tendrils (M1 version): spawn tendrils from the nest, goals = players / lights, mass vs strike by opening | Bugs come for the player, mass at the flashlight edge, strike from behind |
| 1.16 | Flamethrower: flame particles, burn state, fire spreads between neighbours, fire light repels, fire into fresh hole collapses it | Node test: burning bug ignites neighbours; in-game burst torches a packed group |
| 1.17 | Overwhelm meter: touching bugs fill it; full = downed (M1: respawn after 3 s) | Standing in the swarm downs the player |
| 1.18 | Debug views: flow-field and light-cost overlays (DataTexture on the floor), visibility view, top-down camera | Toggling shows the fields matching behaviour |
| 1.19 | Tells v1 + audio: chitter density, wall scratching at dig sites, dirt trickle above under-layer bugs, wall crack on imminent breach | Audible/visible before breaches |
| 1.20 | Benchmark scene `?bench=1` + Playwright `scripts/bench.mjs`; console-error check script | Script prints fps/frame-time with 500 bugs and 0 console errors |
| 1.21 | Gate: run all checks, record in PROGRESS.md, update REVIEW.md, tag `milestone-1` | Tag exists |

## Milestone 2 — The moving camp

GDD contents: generator, wiring reel, lamps, packing up, shared fuel, hive oil. Gate: the camp can be set up, packed and moved; wires connect, get cut by bugs and get repaired; fuel drains and hive oil harvests correctly; no console errors.

| # | Task | Done when |
| --- | --- | --- |
| 2.1 | Inventory: 3 slots, 1/2/3 + scroll, Q drop, E pick up; world items | Slots show on HUD; items can be picked up and dropped |
| 2.2 | `fuel.ts`: shared pool (1,500), drains per GDD table, wrist gauge on HUD, run fails at 0 | Unit test: drains match table over simulated minutes |
| 2.3 | Generator: two-handed carry (fills all 3 slots, slows), place, start/stop, hum, loud (noise source for queen) | Carry/place works; generator drains 1/min while running |
| 2.4 | Devices: lamp (0.5/min), floodlight (2/min, cone, right-click aim), motion lamp; placing frees the slot | Devices light only when powered |
| 2.5 | Wire spool + reel: E on source starts a wire, cable pays out (15 m limit), alternate LMB/RMB to wind in, E on device connects; power graph through chains; splitter | Unit test: power graph; cut anywhere kills downstream |
| 2.6 | Bugs cut wires: wire-cutter role targets the darkest stretch; cut point flashes; R repairs | Node test: bugs at an unlit wire stretch cut it; repair restores power |
| 2.7 | Packing up: pick up devices (lights go out), generator carry, re-place elsewhere | Integration test: set up → pack → move → set up again |
| 2.8 | Harvest: zapper / stomp / (later) lightning kills leave bodies; E collects +2 fuel; fire kills leave nothing | Unit test: harvest yields; fire yields 0 |
| 2.9 | Flashlight battery + recharge at generator (3 fuel); flamethrower fuel 6/s | Battery drains and recharges |
| 2.10 | Generator zapper + stomp | Kills leave bodies |
| 2.11 | Tab war map: explored tunnels, camp light, live wires, cut wires flashing | Map shows wires and cuts |
| 2.12 | Gate checks (Node integration test + Playwright scripted run), PROGRESS/REVIEW, tag `milestone-2` | Tag exists |

## Milestone 3 — The queen and director

GDD contents: intents, tells, learning tree, electric belief, pacing loop. Gate: each queen intent triggers and shows its tell; learning unlocks fire from player habits; the director cycles through its states (logged to console).

| # | Task | Done when |
| --- | --- | --- |
| 3.1 | Influence maps: danger, opportunity, memory (coarse grid around the team) fed by what bugs sense | Debug view shows the three maps |
| 3.2 | Queen utility AI: scores the 10 intents ~1/s within the director's aggression budget; tendril sizes 20–200 | Console logs intent choices with scores |
| 3.3 | Intent behaviours: conceal, probe, sabotage, flank, undermine, reroute, siege, bait, assault, retreat (field params + goal selection) | Node test forces each intent and checks the swarm does it |
| 3.4 | Tells per intent (audio signature + visual) | Each intent fires its tell event; scripted check logs them |
| 3.5 | Electric belief per device type (−0.02 touch, +0.05 lightning kill nearby, floor 0.1) | Unit test |
| 3.6 | Learning tree: 9 habits → counters, fairness rules (no unlock from death, time fallbacks, no omniscience) | Node test: each habit unlocks its counter |
| 3.7 | Hive Director: intensity per player, 4-state fast loop, act slow curve, levers (budget, breach permission, oil yield, flares, fallback pace) | Console logs Build Up → Sustain Peak → Peak Fade → Relax cycle |
| 3.8 | Lightning gun (12/shot, chains, leaves bodies, restores belief) | Works in game |
| 3.9 | Gate checks, PROGRESS/REVIEW, tag `milestone-3` | Tag exists |

## Milestone 4 — Multiplayer and the hive

GDD contents: host P2P, bug and dig sync, proximity voice, hive death and respawn. Gate: two browser tabs on one machine can host, join, see the same swarm and stay in sync for 10 minutes; hive death and respawn work.

| # | Task | Done when |
| --- | --- | --- |
| 4.1 | Transport interface; BroadcastChannel backend; room codes; lobby UI (Host / Join / Solo) | Two tabs exchange hello messages |
| 4.2 | Protocol: snapshot on join (grid incl. dug cells, lights, camp, fuel), player state stream, host events (dig, cut, kill, intents, tendrils) | Joiner sees host world |
| 4.3 | Swarm sync: clients simulate bugs locally from the same tendril state and seed; host sends periodic quantised keyframes and clients blend toward them | Divergence metric stays bounded over 10 minutes |
| 4.4 | PeerJS/WebRTC backend with the same interface | Connects when a PeerJS server is reachable |
| 4.5 | Proximity voice (WebRTC audio, distance fade, wall muffle), walkie-talkie, voice-as-noise | Works between machines with mics |
| 4.6 | Downed → carried toward the queen (~45 s) → revive by teammates | Carry and revive work |
| 4.7 | Hive player: swarm vision, bug group control, queen orders, will meter, distorted voice | Dead player controls bugs |
| 4.8 | Respawn ritual: gather ~60 bugs, drag into light, electrocute ~10 s, 150 fuel; solo bug zapper | Player returns at low health |
| 4.9 | Pause (host pauses everyone), save/load snapshot | Pause syncs |
| 4.10 | Gate: Playwright two-tab 10-minute soak + hive death/respawn check, PROGRESS/REVIEW, tag `milestone-4` | Tag exists |

## Milestone 5 — The full night

GDD contents: house, base, nest, junkyard, truck finale, endings, art and audio. Gate (GDD): a full night plays from dusk to sunrise. Ordered by value; each is its own small task set, planned in detail when reached.

| # | Task | Done when |
| --- | --- | --- |
| 5.1 | Act structure + checkpoints + failure/after-failure menu | Acts advance; fuel-out shows restart/continue |
| 5.2 | The house (act 1): job, sprayers, zapper, flashlights, hole in the basement, power dies | Playable opening |
| 5.3 | The base (act 2) cabled to the house | Base works |
| 5.4 | Upper/deep nest with intersection (fuel tanks → flamethrower), oil rigs, junk mods | Act 3 playable |
| 5.5 | Junkyard + Enlite suits (player digging) + queen's chamber provoke fight | Act 4 playable |
| 5.6 | Digging-truck finale + endings (true / bad loop) | Sunrise reachable |
| 5.7 | Art and audio pass | — |
