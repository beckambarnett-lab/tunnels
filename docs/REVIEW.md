# Morning report

Everything is in `/home/user/tunnels` (local git repo, tags `milestone-N`). **There is no remote**: I couldn't attach or create a GitHub repo from this session, and the cloud container is temporary. Push it somewhere before the session is reclaimed:

```bash
cd /home/user/tunnels && git remote add origin <your-repo-url> && git push -u origin main --tags
```

## How to run
```bash
npm install
npm run dev
```
Open http://localhost:5173. Useful URL flags: `?seed=N` (nest layout), `?bugs=N`, `?bench` (benchmark hall), `?auto` (autopilot wander, for tests), `?res=0.5` (render scale).

Checks: `npm test` (sim tests in Node), `npm run typecheck`, `node scripts/gate1.mjs` (needs the dev server running).

## Milestone 1 — Swarm prototype (tag `milestone-1`)

### What was built
- A stitched nest of hand-built tunnel segments (seeded), drawn as chunked low-poly organic terrain.
- First-person player with a shadow-casting flashlight and a flamethrower.
- The swarm, built the GDD way: **queen → tendrils sharing flow fields → bugs that only steer** (flow direction + separation/alignment/cohesion + push away from light). No per-bug pathfinding anywhere.
- Light writes a cost into the flow field, so routes avoid light and bugs hold at the light's edge.
- Digging: solid earth costs more in the field, so tendrils route through walls when it's worth it; the bug at the front digs the cell open (it stays open: a living map). A second "under the floor" layer lets tendrils come up through the floor (sometimes dropping from the ceiling).
- Breach rule: a wall face is only broken, and a floor only erupts, at a cell that is dark **and** not seen by any player. Otherwise the bugs keep scratching inside the wall (the crack grows to ~85%) and wait.
- Fire: flame particles, burning bugs panic and set their neighbours alight, burning bugs are themselves fire light, and fire poured into a freshly dug hole collapses it.
- Debug tools: overlay (FPS, frame time, bug states, timings, field builds), panel (bug slider 0–3000, top-down camera, god mode, breach switch), floor overlays for the flow field (surface and under layer), light cost, and the breach visibility mask.

### Playtest this
1. `npm run dev`, open the page, click to lock the mouse.
2. Walk the tunnels (WASD, Shift sprint, Ctrl or C crouch). F toggles the flashlight.
3. Listen: chittering rises as bugs gather; scratching inside walls; a crack/thump on a breach.
4. Stand still with the flashlight on. The swarm should ring you in the dark just outside the light and behind you, then strike your back every ~20 s (M1's fixed rhythm). Hold LMB to burn; watch fire spread through a packed group.
5. Press **T** (top-down) and **V** (cycle views): `flow` shows the field (white = digging step, purple = dive), `light` shows light cost, `seen` shows what you can see (breaches are forbidden in blue).
6. Stare at a wall where you hear scratching: it should crack but not open. Turn your back on it in the dark and it should break open.
7. Open `?bench` on a real GPU and read the FPS in the overlay (that's the number I couldn't measure).

### Decisions where the GDD was open
See `docs/QUESTIONS.md`. Short version: floors/ceilings are a second "under" layer in the flow field (Q1); headless fps is replaced by CPU time per frame as the gate stand-in (Q3); network bug sync will be local sim + host keyframes (Q2, for M4).

### Deviations
- Downed players respawn at the start after 3 s. Carrying toward the queen is in M4's plan.
- Massing tendrils hold 3.5 m out from the player, not only at the light's edge: behind a flashlight there is no light edge, so without a stand-off distance they'd walk straight up to your back. The GDD's "mass at the edge of the light … and wait" is kept where there is light.

### Known bugs
- See PROGRESS.md "Known bugs / limits".

## Milestone 2 — The moving camp (tag `milestone-2`)

### What was built
- One shared fuel pool (1,500) on a wrist gauge; every drain from the GDD table (generator 1/min, lamp 0.5/min, floodlight 2/min, flamethrower 6/s, flashlight recharge 3, hive oil +2).
- 3-slot inventory. The generator is two-handed: you need empty hands to lift it, it fills all three slots and slows you to 60%. With the flashlight not in your hand, your light goes out while you move the camp.
- Devices: generator, lamp, floodlight (aim with RMB), motion lamp, splitter.
- The wiring reel exactly as the GDD describes: E on a source, walk (cable pays out, 15 m tether), alternate LMB/RMB to wind in, E on the next device to connect. Cuts kill everything downstream.
- Bugs chew dark cable (cut segments flash red on the cable and on the Tab map); hold R to repair.
- Hive oil: zapper and stomp kills leave belly-up bodies; E harvests them; fire leaves nothing.
- Tab war map: explored tunnels, light, live/dead/cut cables, devices, you.

### Playtest this
1. Start: you hold a flashlight (1), flamethrower (2) and a spool (3). The camp kit lies on the floor ahead.
2. Drop your three items (Q on each), walk to the generator, press E to lift it, walk a few metres, RMB to set it down (it starts; E toggles it).
3. Pick up your gear again, pick up a lamp, RMB to place it 8–10 m away.
4. Select the spool (3), E on the generator, walk to the lamp (watch the cable pay out), E on the lamp: it lights up.
5. Walk past the lamp to feel the 15 m tether; alternate LMB/RMB while walking back to wind cable in.
6. Wait in the camp. The swarm sends wire-cutters to the darkest stretch: the lamp goes out, the cut flashes red (Tab). Burn them off (2, LMB), then hold R at the cut.
7. Zapper (on the floor): LMB zaps up to 3 bugs in front for 3 fuel each; E on the bodies harvests +2 each. Space stomps (free, but you're in reach).
8. Pack up and move: E on the lamp, E on the cable to coil it, empty your hands, hold E on the generator, carry it on, set up again.

### Decisions where the GDD was open
Q5–Q9 in `docs/QUESTIONS.md`: port counts (generator 2 outputs), only the held item works (flashlight must be in hand), lifting the generator needs empty hands, zapper costs 3 fuel per kill, flashlight battery 240 s.

### Deviations
- Wire-cutting rate is split by role: the sabotage tendril (wire-cutters) chews at full rate, other bugs only nibble (15%). Without this, every massing bug shredded any cable in the dark within a second.
- The starting kit is a test kit on the floor; the house, the van and the GDD's progression come in M5.

## Next
Milestone 3: the queen and director.
