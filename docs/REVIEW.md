# Morning report

Everything is in `/home/user/tunnels` (local git repo, tags `milestone-N`). **There is no remote**: I couldn't attach or create a GitHub repo from this session, and the cloud container is temporary. Push it somewhere before the session is reclaimed:

```bash
cd /home/user/tunnels && git remote add origin <your-repo-url> && git push -u origin main --tags
```

A single-file copy of the whole repo (all history and tags) is also at `/tmp/claude-0/-home-user/01ccde54-0de1-55bc-aa7a-cce3dcc29450/scratchpad/tunnels.bundle` (it lives in the same temporary container, so download it). Restore it with:

```bash
git clone tunnels.bundle tunnels
```

## At a glance
| Milestone | State | Tag |
| --- | --- | --- |
| 1 Swarm prototype | gate passed | `milestone-1` |
| 2 The moving camp | gate passed | `milestone-2` |
| 3 The queen and director | gate passed (the real gate, "testers can read her plan", needs people) | `milestone-3` |
| 4 Multiplayer and the hive | gate passed (two tabs, 10 min, hive death + respawn) | `milestone-4` |
| 5 The full night | vertical slice: every act and beat once, dusk to sunrise, both endings | `milestone-5-slice` |

95 Node tests (`npm test`), 5 browser checks (`scripts/gate1-4.mjs`, `scripts/night.mjs`). Biggest unknowns: real-GPU fps, online (WebRTC) play and voice. None could be measured in this container.

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

## Milestone 3 — The queen and director (tag `milestone-3`)

### What was built
- **The queen** scores her ten intents about once a second from three influence maps (danger, opportunity, memory) within the director's budget, and turns the winner into tendril goals, field parameters and bravery. Each intent has its GDD tell, shown as an event, a console line and a generated sound.
- **The learning tree**: nine habits unlock nine counters, with the GDD's fairness rules.
- **Electric belief** per light type: lamps stop scaring them once they've touched enough of them without burning; lightning kills nearby restore it.
- **The Hive Director**: intensity per player, the four-state loop, the act curve and its levers. Never shown in game (only in the debug overlay).
- **Lightning gun** (in the test kit), device damage and repair.

### Playtest this
1. Open `?act=3` for a harder night (default is act 2). Watch the overlay's `director` and `queen intent` lines and the `last tell` line while you play. Try to call the queen's plan from the sounds before reading the overlay; that's the real gate for this milestone.
2. Use the panel's **force intent** dropdown to hear and see each intent in turn:
   - *siege*: light a lamp (generator + cable). A ring grows at its edge and gets bolder until they rush and break it (hold R to fix).
   - *assault*: the chitter and drone cut out for 3 s, then music starts and everything comes at you.
   - *undermine*: the camera and generator tremble, dirt trickles, and they come up through the floor behind you.
   - *flank / reroute*: scratching in the walls at your sides; new holes appear in walls you've seen.
   - *bait*: a small group stands in your light. Burning them is what the queen wants.
3. Learning: run long cables, burn a lot, harvest a lot, keep your back to a wall. Watch `unlocked` in the overlay (also logged to the console as `[learning] unlocked …`).
4. Belief: let bugs crowd a lamp for a minute and watch `belief lamp` fall; zap a few near it with the lightning gun to push it back up.

### Decisions where the GDD was open
- Q10: belief drops are rate-limited (each bug once per 3 s, each light type once per 2 s), or a crowd breaks belief in seconds.
- Intent choice is "dual utility" (weighted random among near-best scores) so the queen is readable in spirit but not predictable in detail.
- Siege bravery grows over time until the ring can rush an electric lamp (bravery up to 7×); bait bugs are brave enough to stand in a flashlight. Without that, an omni lamp's own base is always lit and could never be attacked.
- The run opens with a 45 s Relax and the prototype plays as act 2 by default (the GDD's base act) so you can set up camp.

### Deviations
- Wire chewing by the M2 sabotage tendril now waits for the Sabotage counter to be learned (25 m of cable, or a 7-minute fallback), as the learning tree says.
- Director oil-yield lever is 0.75–1.25× (not open-ended) so harvesting never beats its own cost.

## Milestone 4 — Multiplayer and the hive (tag `milestone-4`)

### What was built
- **Host / join** from the title screen (or `?host=CODE` / `?join=CODE`), over BroadcastChannel for tabs on one machine or PeerJS/WebRTC online (free public signalling server). Room codes are 4 letters.
- **Sync**: the host runs the queen, director, learning, digging, camp, fuel and health. Every machine steers the bugs locally from the host's tendrils and its own flow fields (per the GDD), corrected by quantised host keyframes 4× a second per bug. Terrain changes, camp, players, fuel and tells are streamed. A dropped player leaves their body as a downed player.
- **Death and the hive**: downed players are lifted by a carrier group and walked to the queen (~45 s); teammates can scatter them and hold E to revive. The devoured play as the hive: a group of ~60 bugs, the queen's orders, a will meter, swarm vision where light is a glare.
- **Respawn ritual**: gather a body of 60, force it into the light, get it electrocuted ~10 s (a live cable, lightning-gun hits, or the solo bug zapper), return at low health for 150 fuel. The queen sends a tendril to break it up. Everyone in the hive = run lost.
- **Pause** (host pauses everyone), **save/load** (K saves, Shift+K exports, `?load` continues), **proximity voice** (online only; see below).

### Playtest this
1. Open two browser tabs. In one: *Host (tabs on this machine)*; note the room code bottom-right. In the other: type the code, *Join (this machine)*.
2. Walk both players around; check the swarm, digs, cables and fuel match in both tabs (overlay shows `bug err` on the client).
3. Let one player get overwhelmed in the dark (god mode off). The other should see carriers drag them toward the hive; burn the carriers and hold E on them to revive.
4. Let the carry finish. The devoured tab switches to swarm vision with the queen's order on screen. Steer the bugs (WASD) back to a lit spot next to a live cable (or zap the body with the lightning gun) until they're rebuilt. It's a team job: the living player has to keep the camp lit and burn or zap the queen's bugs off the body, and the hive player has to stop pushing (obey) when will runs low, then push again. That's how the automated gate passes; tell me if it feels too hard or too easy.
5. Online: *Host online* / *Join online* on two machines (needs WebRTC to 0.peerjs.com). Click once to grant the mic: proximity voice, V for the walkie-talkie (carry one).

### Decisions where the GDD was open
Q2 (sync = local steering + keyframes), Q11 (solo hive failure), Q12 (gear drops where you're devoured), Q13 (hive control and will), Q14 (what counts as electrocution).

### Deviations / not verified
- Voice and the PeerJS transport could not be tested in the build container (no microphone, no outbound WebRTC). The code is defensive: any failure just disables voice.
- The gate's "four friends finish two acts" was replaced by your two-tab, 10-minute stand-in.

## Milestone 5 — The full night (vertical slice; tag `milestone-5-slice`)

### What was built
- **The night layout**: the hand-drawn house (act 1) with its basement plug, then the base, procedural nest with side loops, the intersection, an oil rig, the deep nest, the junkyard and the queen's chamber, stitched along one main path.
- **Run structure**: acts follow the team (the director's act curve follows); checkpoints at the flashlights, the intersection, rigs, the suits and the junkyard; failure screen with Restart or Continue from checkpoint (continuing marks the run).
- **Act 1**: the job (zap 8 bugs; the sprayer is gloriously useless), flashlights in the bathroom cupboard, the boss on the radio, the Xterminator's jingle; then the power dies and the basement floor breaks open.
- **The ladder**: fuel tanks turn sprayers into flamethrowers; oil rigs refuel once (+350, +500); Enlite suits make you faster with a bigger flame and let you dig (X); the lightning gun waits at the intersection.
- **The boss**: burn her five egg sacs to fill her rage; then the truck starts.
- **The finale**: the Enlite digging truck (fast in open tunnel, slow while digging), roles by player count, the queen stampeding after you, queen-keeper knock-aside / stun, x-ray map for the driver; bursting into the house at sunrise kills her. True ending, or the hollow ending if the run used a checkpoint.

### Playtest this
Title screen → *Play solo*. Or `?night&seed=2`. Zap 8 bugs in the house, grab a flashlight, go down when the floor opens, set up a base, push east: tanks at the crossroads, a rig, suits in the rusted junkyard, egg sacs in the chamber, then the truck: hold W/A/S/D toward the west (where you came from) and RMB for x-ray.

## Known bugs and rough edges (all milestones)
- **fps on a real GPU is unmeasured.** The container has no GPU; CPU per frame is 2 ms at 500 bugs, but please run `?bench` and read the FPS line.
- Online play (PeerJS) and proximity voice are written but untested (no WebRTC or mic here). Same-machine tabs are tested.
- The night is a vertical slice: one of each set piece, ~9 segments end to end. The truck drive takes about half a minute to a minute; the GDD wants a ~10-minute chase.
- The house is one flat floor (the grid is 2D); "the basement" is a plug at the house's east wall.
- Hive tunnels are one cell (0.5 m) wide, so players usually can't follow bugs through them. Enlite-suit digging (X) opens one cell at a time.
- With the test autopilot (god mode, never fights back) the director's Peak Fade ends by its 30 s timeout rather than by the fight resolving.
- In-game text is placeholder; the boss radio is subtitles plus static (no voice).
- Not built: the bad ending's "replay the finale inside the swarm's mind" (the hollow ending is a screen), flares, the hive voice for hive players over tabs (voice is online-only), between-run meta-progression.

## What I'd do next
1. Playtest the M3 gate for real: can people read the queen's plan from her tells? Tune the sound signatures and the intent mix from that.
2. Measure fps on a mid-range laptop with `?bench` (and `?bench&bugs=1000`), then decide on LOD or shadow budgets.
3. Test online play on two machines; fix PeerJS and voice issues.
4. Grow the night: more hand-built segments and a second oil rig per act, a longer truck chase (route planning with the x-ray), the bad-ending replay loop, flares.
5. Proper art: bug silhouettes, the queen, the house interior, the Enlite junkyard landmarks.
