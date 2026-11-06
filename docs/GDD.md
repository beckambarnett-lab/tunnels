# Tunnels — Game Design Document

Oct 31, 2026 · @Beckam

Tunnels is a 2–4 player first-person co-op horror game for the browser. The hometown crew of Xterminator's ("Bugs worst nightmare") takes a routine bug job at a suburban house, find a hole in the basement, and spend one night carrying a moving camp through a vast alien nest, past the junkyard ruins of a forgotten company, to a queen who can only die in sunlight. **Decided** marks your locked choices; **Proposed** marks my recommendations, which you approved as the working plan; all numbers are starting points for tuning.

## Design pillars

Every feature must serve at least one pillar and break none. If an idea fights a pillar, the idea loses.

1. **Light is life.** Players see, survive and hold ground only with fire and light. Darkness belongs to the hive.
2. **Carry the light forward.** Progress means moving your camp deeper. Every push leaves darkness behind you as well as ahead, so you are always surrounded.
3. **The hive digs; you don't.** Digging is the swarm's fundamental advantage. No wall, floor or ceiling is safe, and the tunnels change around you all night. Players only share the ability late, through Enlite suits.
4. **Avoid, don't conquer.** Repelling the swarm is far more effective than killing it. The only true kill is the queen, and only sunlight does it.
5. **Every flame costs the night.** One shared fuel pool is weapon, light, respawn and clock. Every decision spends time the whole team shares.
6. **The hive learns, and you can see it learn.** The queen adapts to how players play, and every adaptation has a readable tell.
7. **Friends first, then fear.** Hometown exterminators, a simple job, chaotic comedy with friends, growing out of all proportion into genuine horror.

**Inspirations:** Left 4 Dead (pacing, teamwork), Alien: Isolation (learning, unkillable threat), Lethal Company (proximity chat, horror-comedy), Deep Rock Galactic (swarm alarms, shared resources), They Are Billions (holding a line against a horde).

## Core loop

Progress means carrying your camp forward. The team sets up camp, holds it, harvests and scavenges around it, then packs up and pushes the whole camp deeper toward the queen (**Decided**). Every step spends the same shared fuel, and every loop the queen has learned something new.

> *Diagram (transcribed from the source doc): "Carry the camp forward; the dark closes in behind".* A loop: **1 · Set up camp** (generator, wire, lamps) → **2 · Hold the bubble** (attacks from every side) → **3 · Harvest and scavenge** (hive oil, flares, salvage) → **4 · Push forward** (carry camp toward the queen) → back to 1, labelled "queen adapts". In the centre: **Shared fuel** — every step spends it; harvest refills a little.

**The bubble (Decided):** a moving camp is a bubble of light with darkness on every side, and because the hive digs, that includes the walls, floor and ceiling. Each push leaves the dark behind you as well as ahead, so the team always feels surrounded. A bigger base is possible, but the goal is always forward. **Proposed:** packing up is the most dangerous moment, because the generator is two-handed, lights go out while you move, and the swarm knows it. The Hive Director decides how long each hold lasts; the queen decides how it's attacked.

## Session structure and the five acts

One continuous, pausable run of about 1–2 hours over a single night. The house is a short comedic opening and most of the night happens in the nest. The safe base comes first and the moving camp second, so safety shrinks across the whole night (**Decided**). Act names and lengths are **Proposed**.

> *Diagram (transcribed): "Safety shrinks all night: a safe base first, then the bubble". Durations are targets.*
> 1 · The Job — house · ~10 min — sprayers, zapper, find flashlights → *turn: a hole in the basement* →
> 2 · The Base — nest mouth · ~20 min — safe base, cabled to the outside → *turn: leaving the base* →
> 3 · The Bubble — deep nest · ~30 min — moving camp; fuel tanks, oil rigs → *turn: forgotten logos* →
> 4 · The Junkyard — ruins · ~20 min — Enlite suits, dig; provoke the queen → *turn: the queen gives chase* →
> 5 · Sunrise — dawn · ~10 min — digging-truck escape to sunlight

| Act | Where | Players' goal | The hive | Comedy left |
| --- | --- | --- | --- | --- |
| 1 The Job | The house | Finish a routine bug job with sprayers and the generator zapper; find flashlights and the hole in the basement | Conceals itself; acts almost like normal bugs | Lots: jingle, boss radio, sprayers treated as serious gear |
| 2 The Base | Nest mouth, cabled to the house | Build a base of operations; scout, harvest and collect junk | Probes the base; first readable tells; first deaths | Boss radio, players' own chaos |
| 3 The Bubble | Deep nest | Carry the camp to the intersection, strap on fuel tanks, push on past ever-larger oil rigs | Surrounds the bubble; sabotage and flanking; learning visibly unlocks | Radio out of range; players' own humour |
| 4 The Junkyard | Ruins of Enlite | Find Enlite suits and dig; reach and provoke the queen; find the digging truck | Near-constant pressure | Little; the mood turns solemn |
| 5 Sunrise | Up through the earth | Escape in the digging truck with the queen in pursuit | Swarm clumps attack the truck; the queen stampedes | Chaos returns as screaming |

Leaving the base is the game's big tonal turn. The team can walk back to it, but there is no real value in doing so: progression is forward (**Decided**). The social, war and horror layers run in every act; only their weight changes.

## Controls and interface

Standard browser first-person controls, plus the wiring reel. The HUD stays minimal and mostly diegetic so the darkness does the work. **Proposed** unless noted.

### Controls (keyboard and mouse)

| Input | Action |
| --- | --- |
| WASD, mouse | Move, look |
| Shift / Ctrl | Sprint (noisy) / crouch (quiet) |
| 1, 2, 3 or scroll | Select inventory slot |
| Left mouse | Use held item (fire, light on, zap) |
| Right mouse | Alternate use (aim, focus beam, place) |
| E | Interact: pick up, connect wire, revive, carry bodies |
| Q | Drop held item |
| R | Repair wire or device |
| V | Push-to-talk on walkie-talkie (proximity voice is always on) |
| Tab | Map: explored tunnels, camp, wires, teammates |
| Esc | Pause (host pauses everyone) |

### The wiring reel (**Decided**)

1. Hold a wire spool and press **E** on a source (generator or a powered device).
2. Walk; cable pays out behind you.
3. To back up, press **left and right alternately**, like cranking a reel, to wind cable in.
4. Press **E** on the next device to connect it. It powers on if the chain is live.

**Proposed rules:** each spool holds about 15 m of cable; devices chain one to the next; a cut anywhere kills everything downstream. *Decided: alternate the left and right mouse buttons, so you can still walk while reeling.*

### HUD

- **Shared fuel gauge** on a wrist display, visible to everyone.
- **Three slot icons**, bottom of screen.
- **No minimap.** The Tab map is the war map: your camp's lit area, live wires, cut wires flashing.
- **Damage** shows as bugs crawling in from the screen edges, not a health bar.
- **Hive tells are audio-first:** chittering, silence and scratching inside walls.

## Light, fuel and electricity

One shared fuel pool powers everything, and the run ends when it hits zero. The tuning target matters more than any single number: **a team that never harvests runs dry during act 4; a team that harvests well reaches sunrise with a little to spare.**

### Rules (**Decided**)

- Fuel is shared by the whole team. Running out is a failure (see Failure, checkpoints and endings).
- Real fire repels and kills. It is the only direct way to destroy bugs, but it destroys their hive oil.
- Electricity costs fuel through the generator, gives no real protection, and repels only while bugs believe it is fire.
- Players see only within light. Darkness is the hive's territory.
- Bugs can't see in light, but can attack light sources from the dark.
- Light doesn't reach into the earth. To a digging hive, every wall is a dark highway.
- Bugs cut wires; a cut powers off everything downstream until repaired.

### Electric belief (**Decided** concept, **Proposed** values)

Each electric device type has a **belief** value from 1.0 (bugs fully fooled) down to a floor of 0.1. Its repel strength is multiplied by belief.

- Drops 0.02 each time a bug touches that light type and doesn't burn.
- Rises 0.05 for each lightning-gun kill within 5 m of that light type.
- Belief is per device type, so floodlights and lamps can lose credibility at different rates.

### Hive oil harvesting (**Decided**)

- Bugs killed by fire yield nothing.
- Bugs killed by lightning, crushing or the generator zapper leave bodies worth fuel. Press E on a body pile to collect.
- On average, harvesting returns less than it cost. It extends the night; it never wins it.
- Once the queen notices harvesting, bugs drag their dead into the dark.
- Oil rigs between upgrades give large refuels and pull the team forward (see Progression).

### Starting values (**Proposed**, for tuning)

| Item | Fuel cost |
| --- | --- |
| Starting tank | 1,500 |
| Flamethrower | 6 per second of firing |
| Lightning gun | 12 per shot |
| Generator, running | 1 per minute |
| Lamp | 0.5 per minute |
| Floodlight | 2 per minute |
| Flashlight recharge at generator | 3 per full charge |
| Respawn ritual | 150 plus electrocution time |
| Hive oil per intact body | +2 |

### Light as territory

Every light writes into the swarm's flow-field cost grid. Bugs route around lit areas and mass at the edge of the light. When a light dies, its cost vanishes and the swarm floods in.

## Gear and inventory

Each player carries three items. With no classes, roles come from loadouts: the person with the flamethrower, generator and wire is the team's "engineer" only because of what they chose to carry.

### Slot rules

- **3 slots per player** (**Decided**).
- Placed devices (lamps, floodlights, traps, the generator) free their slot once set down (**Proposed**).
- The generator is two-handed: carrying it fills all three slots and slows you, which is what makes moving camp dangerous (**Proposed**).
- Early gear comes from the van and the base. Deeper in, better tech is salvaged from the junkyard's wreckage (**Decided** gradient; exact availability belongs to the progression chat).

### Items

| Item | Status | Fuel | Role |
| --- | --- | --- | --- |
| Bug sprayer | Decided | — | Over-the-back pest sprayer from the house; teaches the flamethrower's feel, useless against the hive |
| Generator zapper | Decided | Per kill | Electrified wire tool from the house; teaches wiring and harvests the first hive oil |
| Flashlight | Decided | 3/recharge | Found in the house and needed to enter the nest; battery recharges at the generator |
| Flamethrower | Decided | 6/sec | A sprayer plus a large fuel tank from the intersection; kills and lights, but burns hive oil away |
| Lightning gun | Decided | 12/shot | Enlite salvage; chains through bugs, leaves bodies to harvest, restores electric belief nearby |
| Generator | Decided | 1/min + devices | Powers everything electric; loud, so it attracts the hive |
| Wire spool | Decided | — | About 15 m of cable to chain devices |
| Floodlight | Decided | 2/min | Wide placed cone; the main way to hold the bubble |
| Junk mods | Decided | — | House items taped onto gear for small tradeoffs (see Progression) |
| Lamp | Approved | 0.5/min | Small placed light for tunnels and wire runs |
| Walkie-talkie | Approved | — | Talk beyond proximity range; costs a slot |
| Motion lamp | Approved | Low idle | Switches on when bugs approach; saves fuel, but the queen learns to bait it |
| Wire splitter | Approved | — | Branches one wire into two |
| Flare | Approved | Found, not fuel | Thrown real fire for about 30 seconds; scavenged in the nest and ruins |

Crushing bugs is a stomp action, not an item. It harvests a body but puts you within reach of the swarm. Enlite suits are worn rather than carried, so they don't take a slot (**Proposed**).

## The swarm

Thousands of alien bugs act as limbs of one mind. Individual bugs never plan; the queen decides, tendrils path, bugs steer. They wait in the dark and strike only when there is an opening.

### The creatures (**Decided** concept)

- Unnatural and alien: insect-like at a glance, wrong on a second look. One hive mind; bugs are its extensions.
- Extremely flammable and hate light. They can't see in it.
- **Decided:** one bug species with *roles* rather than special enemy types (biters, wire-cutters, carriers, body-builders). This keeps it feeling like one organism.

### Scale (**Proposed** values)

| Measure | Value |
| --- | --- |
| Total population in the nest | about 3,000 |
| Visible in a corridor at the peak | up to about 500 |
| Tendril size | 20 to 200 bugs |
| Speed in darkness | about 1.5× player walking speed |
| Speed in light | stops and retreats |

### Behaviour layers (**Proposed**)

1. **Queen** chooses intents about once a second (see The queen).
2. **Tendrils** each follow one goal and share one flow field to it.
3. **Bugs** steer each frame: flow direction + separation, alignment, cohesion + push away from light. States: flow, mass, strike, carry, burn.

### Attack rules (**Decided** spirit, **Proposed** details)

- A tendril strikes only when the queen's intent allows it **and** an opening exists: a light flickers or dies, a player is alone or out of light, someone stands against an unlit wall, the flamethrower stops firing, a wire is cut.
- Without an opening, bugs **mass at the edge of the light**, or inside the walls around it, and wait.
- Touching bugs fill a player's **overwhelm meter**. Full meter means downed.
- **Fire spreads.** A burning bug can ignite its neighbours, so a good burst can torch a packed tendril. The queen learns to spread out against heavy flamethrower use.

### Digging: the hive's advantage (**Decided** concept, **Proposed** details)

Digging tunnels is what the swarm *is*. It is the hive's fundamental edge over players, who can't dig at all until the Enlite suits.

- **Anywhere, through earth.** Bugs can reach almost any point by digging. Digging is slower than moving through open tunnel, so the hive digs to flank, ambush and undermine, and runs to chase.
- **Breaches from every side.** Bugs can burst out of any wall, floor or ceiling, always at a dark spot: the shadow behind a crate, the unlit side of a floodlight, the floor under the generator.
- **A living map.** Fresh hive tunnels stay open, so the nest's layout changes all night. A route that was safe an hour ago may now have three new entrances.
- **Every hole is theirs.** The hive uses the tunnels it digs and the ones players dig with Enlite suits. A shortcut you carve is also a new way to be flanked.
- **Tells:** scratching inside the walls, dirt trickling from the ceiling, a wall bulging and cracking just before a breach.
- **Closing a breach:** fire poured into a fresh hole collapses it, a short-term way to seal a flank at the cost of fuel.

### Carrying players (**Decided**)

- A downed player is lifted by a carrier group and walked toward the queen.
- Teammates can chase, scatter the carriers with fire or light, and revive the player.
- **Proposed:** the trip takes about 45 seconds; the deeper the team has pushed, the closer the queen and the shorter the trip.

## The queen

The queen is the hive's mind and the game's only true boss. She picks the swarm's intentions, learns from the players, can only be killed by sunlight, and ends the night in a chase.

### How she thinks (**Proposed**)

- Utility AI that scores intents about once a second, reading three influence maps of the area around the team: **danger** (fire, light, recent burn deaths), **opportunity** (isolated players, dark gaps, cut wires, a silent flamethrower), and **memory** (what worked before).
- She has no omniscience. She knows what her bugs sense: light, heat, footsteps, the generator's noise, and **players' voices** (loud talking draws bugs, as with Lethal Company's voice-sensing monsters).
- The Hive Director gives her an aggression budget; she decides how to spend it.

### Intents and their tells (**Proposed**)

| Intent | What the swarm does | Tell players can read |
| --- | --- | --- |
| Conceal | Acts like ordinary bugs; hides its size | Bugs that are slightly too organised |
| Probe | Lone scouts test the edge of a light | Single bugs tapping into the light and retreating |
| Sabotage | A tendril goes for a wire's darkest stretch | Bugs lining up along the cable like ants on sugar |
| Flank | Tendrils dig through the walls to hit the bubble from the side | Scratching moves into the walls; the space ahead goes quiet |
| Undermine | Tendrils dig beneath the camp and erupt through the floor | Dirt trickling; the ground under the generator trembling |
| Reroute | Digs new tunnels to cut off the way ahead or behind | Fresh holes in walls you already passed |
| Siege | Masses against one light and attacks the fixture | A growing ring of bugs at the edge of one lamp |
| Bait | A small, oddly brave group draws fire | Bugs in the open with nothing behind them |
| Assault | All-in strike through an opening | The whole nest goes silent for a few seconds |
| Retreat | Withdraws to regroup during Relax | Scratching fades, bodies get dragged away |

### The learning tree (**Decided** concept, **Proposed** contents)

Behaviours start locked and unlock when players' habits trigger them, so the hive visibly answers what *they* do.

| Player habit | Unlocked counter |
| --- | --- |
| Bugs touch electric light without burning | **Testing the light:** scouts walk into lamps; electric belief drops |
| Teams camp in the same kind of spot | **Flanking** through the walls around it |
| Teams keep their backs to a wall | **Breaching** through that wall |
| Long wire runs | **Sabotage** of cables, then the generator |
| Heavy flamethrower use | **Spreading out** so fire can't chain; **baiting** to waste fuel |
| Harvesting bodies | **Dragging the dead** into the dark |
| Motion lamps | **Triggering** them from range to drain fuel |
| Players dig with Enlite suits | **Taking over** player-dug tunnels and lying in wait inside them |
| Fuel running low | **Dark rush:** fewer probes, more assaults |

**Fairness rules**, borrowed from Alien: Isolation: nothing unlocks from a player dying, so a mistake is never punished invisibly; time-based fallback unlocks keep pace with strong teams; the queen never knows what her bugs haven't sensed.

### Boss fight in the nest (**Proposed**)

The queen can't be hurt enough to die. The fight is about **provoking** her: burn her egg sacs and nest organs while she throws the swarm at you. When her rage fills, she abandons the nest.

### The finale: the digging-truck escape (**Decided**)

Once provoked, the queen hunts the team. The final upgrade, an Enlite digging truck found near her chamber, carries everyone up through the earth toward the surface. It's a desperate chase, not a timing puzzle, and it ends when the truck bursts out into the sunrise and the queen dies in the light. Everyone has a job.

| Role | Players | Job | The key decision |
| --- | --- | --- | --- |
| Driver | 1 | Steers toward the surface. An x-ray button shows every open space ahead. | The truck is fast in open spaces and slow while digging, so the route has to be planned in seconds. |
| Side gunners | 2 | Flamethrowers on the left and right burn off anything tearing at the wheels or trying to stop the truck. | A shared fuel supply burns away slowly. Big bursts stop crashing enemies but drain it, so they balance saving fuel against saving the truck. |
| Queen-keeper | 1 | Rides in the middle, charging energy to hold the queen back. | Spend a charge on a **stun burst** (she stops briefly but comes back stronger) or a **knock-aside** (she careens left or right, buying room but stampeding alongside). |

- **The swarm turns solid.** In the finale, bugs gather into tangible clumps instead of a diffuse threat, so focused fire on a clump keeps it down.
- **The hive digs alongside you.** Tendrils tunnel parallel to the truck and burst in from the sides, floor and roof. Gunners' fire collapses fresh breaches.
- **The x-ray shows their tunnels too.** Hive tunnels are open space, so they're fast lanes, but they're full of bugs. The driver chooses between a fast, crowded route and slow, safer digging.
- **Knock-aside teamwork.** When the queen stampedes alongside, the driver has to swerve away from her, and the gunner on her side has to hit her with a massive burst to drive her back behind the truck.
- **Fewer than four players (Decided):** the queen and swarm are less aggressive. With three, the driver is also the queen-keeper, alongside two side gunners. With two, one drives and one flames. Solo is just the driver.
- **Proposed:** tunnels the team dug or cleared earlier show up on the x-ray as fast lanes, so the night's work pays off in the escape.

## Death, the hive and respawn

Dying doesn't take you out of the game. You join the hive, take orders from the queen, and fight to get yourself rebuilt. It is the game's most original mechanic and its best source of both comedy and betrayal.

### The path to death (**Decided**)

1. Overwhelmed players go down and are carried toward the queen.
2. Teammates can chase off the carriers, save and revive them.
3. A player who reaches the queen is devoured and joins the hive.
4. If every player is in the hive, the run fails (see Failure, checkpoints and endings).

### Playing as the hive (**Decided** concept, **Proposed** details)

- You see as the swarm sees: the dark is clear to you, and light is a blinding glare.
- You have dim control over a group of bugs.
- The queen gives **forceful orders**, such as "cut the wire in the kitchen." Obeying is easy: your bugs move willingly.
- **Resisting is hard.** A *will* meter drains while you push against orders, and your bugs drag toward the queen's goal. Obeying refills it. Giving in and betraying your friends is always the easier choice.
- Your voice comes out of your bugs, distorted, and only living players near them can hear it. Leaking the queen's plans is possible but risky.

### The respawn ritual (**Decided** concept, **Proposed** steps)

1. **Gather a body.** Mass enough bugs (about 60) into a human shape.
2. **Force it into the light.** The bugs hate light and pull away; dragging them into a lit area drains your will.
3. **Electrocute it solid.** Living players hit the struggling mass with the lightning gun or a live wire for about 10 seconds.
4. **Return.** You re-form as a human at low health. Total cost: about 150 fuel.

The queen sees the ritual as an opportunity and may send a tendril to break it up, turning every respawn into a small holdout.

### Solo mode (**Decided**)

With nobody to electrocute you, solo players get a placeable **bug zapper** that runs the electrocution automatically for a higher fuel cost.

## Failure, checkpoints and endings

Tunnels has two endings, and the better one isn't unlocked by a menu setting. Finishing the night cleanly earns the true ending; anything less ends inside the swarm (**Decided**).

### What counts as failure (**Decided**)

- The shared fuel runs out.
- Every player is in the hive at once.
- The truck is stopped during the finale.

### After a failure (**Decided**)

| Choice | What happens |
| --- | --- |
| Restart the whole game | A fresh run; the true ending is still possible |
| Continue from the last checkpoint | You keep your progress, but the run can now only end badly |

### The bad ending (**Decided**)

- Failing the finale, or finishing any run that used a checkpoint, makes the team part of the entity.
- You then replay the finale inside the swarm's mind until you complete it. In the hidden lore, this is Enlite's curse: absorbed into its broken immortality and returned to the moment before you beat the queen, again and again (see The world).
- Completing it earns a hollow ending, no more deserved than the real one.
- **Proposed:** the sunrise plays out as the hive sees it, through glaring light, with the team's voices coming out of the bugs.

### The true ending (**Decided**)

- Complete the whole night without failing and without using a checkpoint.
- It's a hardcore challenge baked into the game, ready for players who want it, instead of a difficulty switch on a menu.
- *Decided: only a full failure counts against the true ending. Individual deaths fixed by the respawn ritual are fine.*

### Checkpoints (**Decided**)

A checkpoint is saved at each milestone space (flashlights, the intersection, the suits, the truck) and at each oil rig.

## Hive Director

An invisible pacing system, separate from the queen, decides *when* and *how hard* the hive may push. It runs a short Left 4 Dead-style tension loop inside a slow escalation across the night. **Proposed** throughout.

### Intensity

Each player's intensity rises with bug contact, damage, time in darkness, the swarm close by, a teammate being carried off, and fuel spent in the last minute. It decays during calm. The director uses the **highest** player's intensity.

### The fast loop (2–4 minutes)

| State | What happens | Ends when |
| --- | --- | --- |
| Build Up | Queen gets a full aggression budget | Team intensity crosses the peak threshold |
| Sustain Peak | Pressure holds | 3–5 seconds pass |
| Peak Fade | No new tendrils; current fight plays out | The fight resolves naturally |
| Relax | Swarm withdraws into the walls; time to rewire, harvest and joke | Relax timer for the current act runs out |

### The slow curve

| Act | Relax length | Peak ceiling |
| --- | --- | --- |
| 1 The Job | about 90 s | Low: small tendrils, mostly concealment |
| 2 The Base | about 75 s | Medium: probes and tests against a strong position |
| 3 The Bubble | about 30 s | High: attacks from every side, sabotage |
| 4 The Junkyard | about 15 s | Maximum |
| 5 Sunrise | none | Scripted chase |

### Levers the director controls

- The queen's aggression budget and maximum tendril size.
- **Where breaches may open.** Like L4D spawning hordes out of sight, the director only lets bugs break through walls where no player is looking.
- Hive oil yield per body, generous when the team struggles and lean when it cruises.
- Where scavengeable flares appear.
- How quickly learning-tree fallback unlocks arrive.

### Rules

- The boss fight and sunrise chase are scripted and **exempt** from the loop.
- The director is never shown or explained to players, so it can't be gamed.
- Tendril sizes scale quietly with player count; solo runs on a gentler budget.

## The world

A small suburban house sits on top of a vast alien nest, with the junkyard ruins of a forgotten company at the bottom (**Decided**). The house is a short, comedic opening; the nest is where most of the night happens, in an entirely different tone.

### Zones (**Decided** structure, **Proposed** details)

| Zone | Size | Tone and purpose |
| --- | --- | --- |
| The house | Small | Comedy. The routine job, the van at the curb, the hole in the basement |
| The base | Medium | The nest's mouth, cabled back to the house. Safe-ish; comedy lingers; stockpiling |
| Upper nest | Large | Organic tunnels; the first moving-camp pushes |
| Deep nest | Largest | Resin, eggs and hive-grown walls; always surrounded |
| The junkyard | Large | A facility so destroyed it's practically scrap; rusted logos; solemn |
| Queen's chamber | Set piece | The boss arena, somewhere inside the ruins |

**Enlite, the forgotten company (Decided):** no lab cliché and no explanation. Its logo is a black honeycomb hexagon around a bee whose body is a DNA double helix, with bright green wings, over the wordmark "Enlite" with a green-dotted i. It hints at engineered insects without explaining anything, and its name is a grim joke for a hive that hates light. Rusted Enlite logos, wrecked machines and hive growth fill the junkyard; the solemnity sits alongside the horror. Where the hive came from stays a mystery. The deeper the team goes, the more salvageable tech they find.

### Hidden lore: Enlite's broken immortality (**Decided**)

This is the truth beneath the game. **The game never states it.** Players piece it together or never do, and the hometown exterminators never learn the full story.

- **What happened:** Enlite was using the swarm to achieve eternal life. Right as they achieved it, or a broken version of it, the swarm overran them.
- **What it explains:**
  - Dead players joining the hive *is* the broken immortality. Dying doesn't end you; it absorbs you.
  - The bad ending loop is the curse. Overrun in the finale, the team returns to the moment just before beating the queen, fighting her forever until they win.
  - The junkyard is what's left of Enlite at the moment of its success.
- **The theme:** eternal life isn't a reward. Being unable to die is its own horror, and the true ending's sunrise is a release as much as a victory.

**Clues, never explanations (Proposed):**

- Rusted Enlite slogans about living forever on the junkyard's walls.
- The DNA helix in the logo, on everything.
- Hive players' distorted voices saying they can't die.
- In the bad ending loop, faint Enlite branding bleeding into the swarm's mind.
- No audio logs, no documents that explain it outright.

### Hand-built vs procedural (**Decided**)

- **Fully hand-built set pieces:** the house, the base site, the queen's chamber and boss arena, key junkyard landmarks and the milestone spaces. None of these are procedural.
- **Hand-built segments, stitched procedurally:** hundreds of hand-built tunnel segments joined at matching connectors into a new nest layout every run. Hive growth, salvage, flares and items are placed on top.
- **Live digging on top of that:** during the run, the hive (and later the players) dig new tunnels through the stitched layout, so the map never stays the same.

### How the world changes through the night (**Proposed**)

- **Act 1:** dusk light through the windows and working house lamps. It feels like a normal job.
- **End of act 1:** the hive chews through the mains, the house goes dark, and the basement floor opens onto the nest.
- **The base:** a power cable run down from the house is its lifeline and its light, and the hive targets it (Decided). Leaving the base means leaving the last steady light behind.
- **The junkyard:** rusted signage, dead machines and hive growth. Quiet and sad among the horror.
- **Sunrise:** first light pours down the hole and through the house's windows, marking safe ground during the escape.

### Pathfinding grid

Each tunnel segment carries its own 0.5 m grid in which every cell is open tunnel or solid earth, plus marked connectors. Bugs can path through solid cells at a high dig cost, so digging falls out of the same flow-field system, and a dug cell becomes open for everyone. Stitched segments link at their connectors, which maps directly onto Supreme Commander 2's sectors and portals. The house's walls and vents double as hive highways.

## Multiplayer, voice and solo mode

Two to four friends, one of them hosting in the browser, talking through proximity voice that the game itself plays with. Solo is supported with a gentler director.

### Sessions (**Decided**)

- 2–4 players, co-op against the swarm. A single-player option is wanted.
- One player hosts; the others join.
- One continuous run of about 1–2 hours that can be paused at any time.

### Session details (**Proposed**)

- Friends join with a short room code.
- The host can pause for everyone and save the run to resume later.
- A player who drops out leaves their body behind as a downed player; a rejoining player respawns at the base, or at the van if the base has fallen, for a fuel cost.

### Voice (**Proposed**)

| Feature | Behaviour |
| --- | --- |
| Proximity voice | Always on; fades with distance and muffles through walls and floors |
| Walkie-talkie | Push-to-talk at any range; takes an inventory slot |
| Death cut-off | A player being carried has their voice crushed and swallowed by the swarm |
| Hive voice | Dead players speak through their bugs, distorted, audible only nearby |
| Voice as noise | Loud talking registers on the queen's opportunity map (Decided: on by default, can be turned off in settings) |
| Text fallback | Short quick-chat lines for players without a mic |

### Solo mode (**Proposed**)

- The director runs a smaller aggression budget and shorter tendrils.
- A placeable bug zapper replaces teammates in the respawn ritual.
- The boss's comedic radio chatter partly stands in for friends early on.

## Tone, art and audio

The night moves from cheerful pest-control comedy to genuine horror. Players' own chaos stays the whole way; the game's built-in jokes are removed one by one until only the dark is left.

### Tone (**Decided**)

Humorous with spikes of horror, escalating gradually into horror. Humor comes from player voice chat plus typical chaotic friendslop elements, which fade as the game progresses.

### Where the game's comedy lives, and when it leaves (**Proposed**)

| Comedy source | Removed |
| --- | --- |
| Ordinary bug sprayers treated as serious gear | Act 3, when they become real flamethrowers |
| The cheerful Xterminator's jingle and van radio | End of act 1, when the power dies |
| The boss on the radio | When the team leaves the base and goes out of range |
| Slapstick physics: tripping on cables, tangled wires | Never removed; it simply turns deadly |
| Players' own jokes and screams | Never |

### Art direction (**Proposed**)

- **Low-poly, stylised 3D.** Realistic for one solo developer in a browser, and darkness hides detail anyway.
- **Light is the main art tool.** Warm suburban dusk in the house, cold alien darkness in the nest, rust and dead fluorescents in the junkyard, warm sunrise at the end.
- **The bugs** are glossy and wet-looking so they catch your flashlight, with too many joints. They never glow, because they hate light.
- **The exterminators** are the hometown crew of Xterminator's, slogan "Bugs worst nightmare", in goofy branded jumpsuits and masks.
- **The nest** is organic, wet and resin-covered, a completely different world from the house above.
- **The junkyard** is a crushed facility: rusted Enlite logos, dead machines, hive growth through everything. Muted and solemn.

### Audio direction (**Proposed**)

- **Sound carries the horror.** Chittering density tracks how many bugs are near.
- **Silence is a weapon:** the nest going quiet is the assault tell.
- **Music flips on assault**, the way Deep Rock Galactic switches from mining to survival mode.
- **The generator's hum** is comfort; its sputter is dread.
- Every queen intent has a sound signature players can learn.

## Progression

Progression is a ladder of big, guaranteed playstyle jumps at hand-built milestone spaces, with small taped-on junk mods in between and ever-larger oil rigs pulling the team forward (**Decided**).

### The upgrade ladder (**Decided**)

| Step | Where | What you get | What changes |
| --- | --- | --- | --- |
| 1 Starter kit | The house | Over-the-back bug sprayers and a generator zapper | Sprayers teach the flamethrower's feel; the zapper teaches wiring and harvests the first fuel |
| 2 Flashlights | The house | Flashlights | The barrier to the nest: no flashlights, no way down |
| 3 Fuel tanks | The intersection where the nest's areas meet | Large fuel tanks you strap to your back | Your sprayers become flamethrowers; real fire arrives |
| 4 Enlite suits | Deeper, toward the junkyard | Faster running, a larger flame radius and, above all, digging | You can physically dig through walls to reach other areas, so the bubble can cut its own route |
| 5 Digging truck | Near the queen's chamber | The final upgrade | The finale vehicle |

Each step happens in a hand-built milestone space that the procedural tunnel segments always stitch between, so every run hits the same arc in a different layout.

Digging is the hive's home advantage. The Enlite suits don't level the field; they only let players share it, and the hive moves into every tunnel they dig.

### Oil rigs (**Decided** concept)

- Between upgrades sit oil rigs, each larger than the last.
- **They are the relief valve.** Like the draining battery in Five Nights at Freddy's, the shrinking fuel pool builds constant pressure. Reaching the next rig releases it with a big refuel, and the promise of the next one is what keeps the team pushing forward.

### Junk mods (**Decided**)

- The hive has dragged house items into the nest, and they're scattered everywhere.
- Junk isn't a currency. You tape it onto gear on the spot for a small change with a tradeoff.
- It lies off the safe path, so grabbing it means leaving the bubble.
- **Example mods (Proposed):** a hubcap reflector widens your flashlight but drains it faster; a garden hose lengthens the sprayer but weakens it; a string of Christmas lights makes a cheap chain of weak lamps that the queen sees through quickly.

### The depth gradient (**Decided**)

The deeper you go, the better the stuff: house junk in the upper nest, Enlite salvage toward the junkyard. Since Enlite made lighting tech, deep salvage means better lights (**Proposed**), and the lightning gun is Enlite salvage found between the fuel tanks and the suits (**Proposed**).

### Between runs (**Proposed**)

Only light meta-progression: starting kits, cosmetics and nest variants. Never raw power, so the game stays scary.

## Technical architecture

The host runs the hive's brain and all authoritative events; every machine runs the bugs' bodies locally from the same inputs. That keeps thousands of bugs smooth without streaming each one over the network. **Proposed** throughout.

### Stack

- **Browser, no install.** Three.js for 3D, with instanced meshes so thousands of bugs draw in a handful of draw calls.
- **Diggable terrain.** Each tunnel segment is a grid of open and solid cells. A dig flips cells to open; the host broadcasts the change, and every machine rebuilds that chunk's mesh and flow field locally.
- **WebRTC peer-to-peer** with one player as host (PeerJS or similar for connection setup).
- **Web Audio** spatial panning, low-pass filters through walls and distortion for hive voices.
- **Web Workers** for flow-field rebuilds, so the main thread stays smooth.

### Who runs what

| System | Runs on | Synced how |
| --- | --- | --- |
| Queen, Hive Director, learning tree | Host | Intents and tendril goals sent to clients |
| Digging and terrain changes | Host | Dig events; each client updates its own terrain |
| Light map and flow fields | Every machine | Rebuilt locally whenever a light, wire, dig or goal changes |
| Individual bug steering | Every machine | Deterministic from tendril state plus a shared seed |
| Damage, downs, carries, deaths | Host | Event messages |
| Fuel pool, harvests, belief values | Host | Small state updates |
| Player movement | Each player | Position updates with interpolation |
| Voice | Peer to peer | WebRTC audio streams |

### Performance budget

- Target 60 fps on a mid-range laptop with about 500 bugs on screen.
- Spatial hash grid for boids neighbour checks, never every-bug-against-every-bug.
- Flow fields rebuilt only on change, spread across frames.
- Bugs far from all players simulate at reduced rate or as abstract tendril blobs.

### Save and pause

The host pauses everyone. A save is a snapshot of world state (including every dug cell), lights, wires, fuel, queen memory and director state, stored in the browser or exported as a file. Loading a checkpoint marks the run, so it can only reach the bad ending.

## Build plan

Build in five milestones, each ending at a playable gate, and prove the swarm before anything else (**Proposed**). The last project failed on swarm behaviour and bugs, so the swarm prototype is the foundation everything else rests on.

> *Diagram (transcribed): "Prove the swarm first; everything else builds on it". Each milestone ends at a gate that must pass before the next starts.*
>
> | Milestone | Contents | Gate |
> | --- | --- | --- |
> | 1 · Swarm prototype (solo, a few tunnel segments) | Flow fields, boids, light as path cost, digging and breaches, flamethrower | Swarm is scary and smooth at 500 bugs, 60 fps |
> | 2 · The moving camp | Generator, wiring reel, lamps, packing up, shared fuel, hive oil | Pushing a camp forward while surrounded is fun |
> | 3 · The queen and director | Intents, tells, learning tree, electric belief, pacing loop | Testers can read the queen's plan from her tells |
> | 4 · Multiplayer and the hive | Host P2P, bug and dig sync, proximity voice, hive death and respawn | Four friends finish two acts together without desync |
> | 5 · The full night | House, base, nest, junkyard, truck finale, endings, art and audio | A full night plays from dusk to sunrise |

Progression slots in once milestone 2 works, after its own design chat. No dates are set; each milestone ends when its gate passes, not on a schedule.

## Open questions

These are the decisions still yours to make. Tick them off as they're settled, and the matching sections change from Proposed to Decided.

- [x] **True ending:** only a full failure (everyone dead) counts against it.
- [x] **Checkpoints:** one at each milestone space and each oil rig.
- [x] **Digging:** the hive's fundamental advantage; it uses every tunnel, including the players'.
- [x] **Endings:** a hollow bad ending replayed inside the swarm's mind, and a true ending for finishing without failing or checkpoints.
- [x] **Oil rigs:** a relief valve for fuel pressure, like FNAF's draining battery.
- [x] **Enlite suits:** faster running, larger flame radius, and digging through walls.
- [x] **Finale with fewer players:** lower aggression; 3 = driver plus queen-keeper with two gunners, 2 = driver and flamer, 1 = driver only.
- [x] **Progression ladder:** sprayers and zapper, flashlights, fuel tanks, Enlite suits, digging truck, with oil rigs and junk mods between.
- [x] **Finale:** the digging-truck escape with driver, two side gunners and a queen-keeper.
- [x] **Names:** Tunnels; Xterminator's ("Bugs worst nightmare"); Enlite.
- [x] **Hand-built vs procedural:** hand-built set pieces; hundreds of hand-built tunnel segments stitched procedurally.
- [x] **Proposed systems:** approved as the working plan; numbers are tuning starting points.
- [x] **Base, controls, chase, solo death, voice, enemies:** settled earlier; see each section.
