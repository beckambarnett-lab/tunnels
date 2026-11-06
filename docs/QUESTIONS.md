# Open questions and the readings I chose

Each entry: what was unclear, the reading I chose, and where it shows up in code. None of these change a GDD decision; they fill gaps.

## Q1. How do floor and ceiling breaches work on a 2D cell grid?
The GDD's pathfinding grid is "a 0.5 m grid in which every cell is open tunnel or solid earth", but it also says bugs breach through floors and ceilings ("the floor under the generator"; Undermine intent).
**Reading:** each cell has two nodes: the surface node (open or solid) and an *under* node (earth below the floor, always diggable, never opens). Flow fields run over both layers. Bugs in the under layer are hidden; they erupt onto a surface cell (floor breach, sometimes shown dropping from the ceiling) only at a dark, unseen cell. Digging through walls happens on the surface layer and opens cells (living map). Under-layer cells a tendril has crawled through get cheaper (hive burrows).

## Q2. "Deterministic bug steering from tendril state plus a shared seed" vs keeping thousands of float sims identical across browsers.
Pure float determinism across machines and frame rates isn't reliable in JS.
**Reading:** every machine runs the same steering code locally from the same tendril state and seed (as the GDD says), and the host additionally sends low-rate quantised keyframes of bug positions so clients blend back toward the host. Bandwidth stays small and drift can't accumulate. (M4.)

## Q3. The milestone-1 gate ("swarm is scary and smooth at 500 bugs, 60 fps") on a headless machine.
There is no GPU in the build container; headless Chromium renders WebGL in software.
**Reading:** the benchmark reports two numbers: measured fps in headless Chromium, and the CPU time per frame for simulation + render submission. The gate counts as passed when sim+submit time fits inside a 16.7 ms frame with headroom (< 8 ms) at 500 bugs; the headless fps is recorded honestly next to it. Real-GPU fps needs a human playtest.

## Q4. "Mass at the edge of the light" when the target has dark all round it.
A player holding a flashlight lights a cone ahead; behind them there's no light edge at all, so pure light-edge massing would let a non-striking tendril walk right up to their back.
**Reading:** massing tendrils also keep a stand-off distance (3.5 m) from their goal point and wait there in the dark; striking tendrils close in. The light edge still stops them wherever light is nearer.

## Q5. Ports: how many wires can a generator or device take?
GDD: "devices chain one to the next"; the splitter "branches one wire into two".
**Reading:** lamps, floodlights and motion lamps have one input and one output (chain); the splitter has one input and two outputs; the generator has two outputs (so one generator can feed two directions without a splitter). Power flows along any uncut wire from a powered device; a cut kills everything past it unless another live path reaches it.

## Q6. Does the flashlight shine while it isn't the held item?
GDD controls: "Left mouse: use held item (fire, light on, zap)" and the flashlight is a slot item.
**Reading:** only the held item works. The flashlight shines only while selected (LMB toggles it). Carrying the two-handed generator therefore means no flashlight, which is exactly the GDD's "lights go out while you move".

## Q7. Picking up the generator.
"Carrying it fills all three slots."
**Reading:** you need all three slots empty to lift it (drop or place your gear first). E on the generator starts/stops it; holding E for half a second lifts it. Right mouse sets it down in front of you.

## Q8. Fuel cost of the generator zapper.
GDD lists "per kill" without a number and says harvesting returns less than it cost.
**Reading:** 3 fuel per zap kill (a body is worth 2). Stomping is free but puts you in reach. The lightning gun (M3) is 12 per shot and chains through up to 5 bugs.

## Q9. Flashlight battery life.
Not given. **Reading:** a full charge lasts 240 s of light; recharging at a running generator costs 3 fuel for a full charge (pro rata).

## Q10. How often does a "touch" lower electric belief?
GDD: belief "drops 0.02 each time a bug touches that light type and doesn't burn". A massed swarm jostling at a lamp's edge produces hundreds of touches a minute, which would break belief (to the 0.1 floor) in seconds and make every lamp useless almost at once.
**Reading:** each bug can teach the lesson at most once every 3 s, and each light type can lose belief at most once every 2 s. Breaking belief fully (1.0 → 0.1, 45 drops) therefore takes at least ~90 s of sustained contact; probing scouts (and "Testing the light" once unlocked) are what keep it falling. Lightning kills within 5 m restore +0.05 each.

## Q11. Solo play vs "if every player is in the hive, the run fails".
A solo player who is devoured is, by definition, every player in the hive; but the GDD also gives solo players a bug zapper so they can do the respawn ritual alone.
**Reading:** in solo, being devoured fails the run only if there's no powered bug zapper in the camp, or if the ritual isn't finished within 3 minutes. With two or more players, everyone in the hive at once fails immediately.

## Q12. What happens to a devoured player's gear?
Not specified. **Reading:** it drops on the floor where they were devoured (deep in the hive), so a bold team can go and get it back.

## Q13. The hive player's "dim control over a group of bugs".
**Reading:** you recruit up to 60 nearby bugs into your own group, and WASD (relative to where you look) steers it. The queen's order points at her current intent's goal; while you push against it your will drains, and as will falls your bugs drift toward her goal instead (with no will left they mostly go where she wants, but you keep a quarter of the control). Obeying refills will. Being in the light as a body also drains it.

## Q14. Electrocuting the body "with the lightning gun or a live wire".
**Reading:** a live (powered) cable with any point within 1.2 m of the body shocks it continuously; each lightning-gun hit on a body bug adds 2 s of the 10 s needed (and doesn't kill it); a powered solo bug zapper within 2 m shocks it at 6 fuel/s on top of the 150-fuel respawn cost. Fifteen or more queen-controlled bugs on the body reverse progress, and a big enough crowd breaks the body apart.

## Q15. "Up through the earth toward the surface" on a flat 2D grid.
The world is one walkable layer, so there is no literal "up".
**Reading:** the night runs east and downward from the house; the truck escape heads back west, digging its own route, and the surface is wherever it breaks into the house's zone (first light pours down the hole and through the windows, as the GDD says). The x-ray map shows every open space and the hive's tunnels (fast lanes, full of bugs).

## Q16. Night pacing and size.
The GDD's night is 1–2 hours across hundreds of tunnel segments. **Reading for this build:** a vertical slice: every act, set piece and beat is present once, along a 9-segment main path with side loops. Act lengths come from the director curve and how fast you push, not from content volume.

## Q17. How hard should resisting the queen be?
GDD: "Resisting is hard … Giving in and betraying your friends is always the easier choice." With full loss of control at zero will, the respawn ritual became impossible whenever the queen's order pointed away from the camp (her Relax-phase "Come home" lasts 30–75 s).
**Reading:** resisting drains will at 0.09/s (light 0.05/s), obeying refills 0.1/s; at zero will your bugs go three-quarters of the way toward her goal (you keep a quarter of the control); while your body is being electrocuted her pull is suspended. In testing the ritual takes about 1–2 minutes with a teammate who keeps the camp lit and the body defended.

## Q18. The base's cable "run down from the house".
GDD: at the end of act 1 the hive chews through the mains and the house goes dark; later "the base: a power cable run down from the house is its lifeline and its light, and the hive targets it".
**Reading:** the house's mains are dead, so the lifeline is the team's own generator: carry it down (or leave it in the house and run cable down through the basement). Either way the cable is what the hive's Sabotage goes for. There is no separate mains object.


## Q19. What counts as an "attack opening", and how the hive knows about one.
GDD: the hive attacks through openings ("a light flickers or dies, a wire is cut, someone wanders alone, someone stands against an unlit wall") and has no omniscience.
**Reading:** openings are events the hive *senses*, not facts it reads off the map. Every 0.2 s the light grid near each player is compared with the last one; a patch of 6+ cells that went dark is an opening, named by its cause (a cut cable, a broken or packed device, a generator off or sputtering, a flamethrower that stopped after a long burst). Player openings are: alone (12 m from everyone, multiplayer only), out of light, and back to a dark wall. An opening only counts once a bug is within the queen's sense range of it. When one is sensed, the nearest permitted tendrils strike, staggered by distance (arrival is a wave, not a teleport), sized to the director's budget; the strike holds 1.6 s after the opening closes and then the tendril goes back to its plan. Outside Build Up / Sustain Peak, and during the assault silence, the hive notes openings but doesn't take them.

## Q20. "Standing against an unlit wall" when the grid has no shadows.
The light grid has no body shadows, so a player's own lamp lit the wall behind them and the wall could never count as dark.
**Reading:** a wall face counts as unlit when the light reaching it, with the player's body blocking (0.32 m radius) and their own flashlight left out, is below twice the dark threshold. Those faces are marked dark for the breach rule while the player stands there. Also, the 1-cell "felt" radius that counted as seen now only covers cells in front of the player: you can't see the wall at your back.

## Q21. Flank and Undermine as intents vs. strikes.
**Reading:** Flank and Undermine now only position: flank tendrils dig pockets in the earth 3–7 m behind the target's back (dark faces only); undermine tendrils wait under the floor. They take an opening when one appears (a flank prefers an unlit wall; undermine anything but "alone"). Openings that hurt someone are remembered and push the queen toward the intent that exploits that kind of opening.

## Q22. The director's tension when nothing gets through.
Bugs massing close used to drive intensity to a peak before any attack.
**Reading:** ambient tension (dark, bugs nearby, fuel being spent) can raise intensity only to a ceiling that starts at 0.55 and rises to 0.9 over the act's ramp (150 s of Build Up in act 1, 120 / 80 / 45 / 30 s in acts 2–5, following the slow curve); actual contact only counts from bugs that are striking. Peaks come from openings being taken.

## Q23. How big is the house job, and what does the sprayer do?
GDD: act 1 is a routine job with sprayers and the generator zapper; the hive "conceals itself; acts almost like normal bugs" (tell: "slightly too organised"); "the house's walls and vents double as hive highways"; the sprayer is "useless against the hive".
**Reading:** 70 bugs are scattered through every room at the start (on top of the hive's numbers); the job is 50 zapped or stomped. They're one tendril the queen leaves alone, steering like pests: stop-start scuttling, running along walls, scattering from anyone within 1.7 m (a sprint catches them), ignoring the house lamps. The tell: about every 19 s every bug in the house freezes at the same instant for about a second. While the job is unfinished and fewer than 14 are left, more crawl out of the vent. The sprayer makes house pests play dead for 2.6 s (so they can be zapped in a heap); it still does nothing to the hive proper. When the power dies, the survivors drop the act and join the queen's tendrils.
