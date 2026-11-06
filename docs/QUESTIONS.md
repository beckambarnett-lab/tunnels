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
**Reading:** you recruit up to 60 nearby bugs into your own group, and WASD (relative to where you look) steers it. The queen's order points at her current intent's goal; while you push against it your will drains, and as will falls your bugs drift toward her goal instead (with no will left, they go where she wants). Obeying refills will. Being in the light as a body also drains it.

## Q14. Electrocuting the body "with the lightning gun or a live wire".
**Reading:** a live (powered) cable with any point within 1.2 m of the body shocks it continuously; each lightning-gun hit on a body bug adds 2 s of the 10 s needed (and doesn't kill it); a powered solo bug zapper within 2 m shocks it at 6 fuel/s on top of the 150-fuel respawn cost. Fifteen or more queen-controlled bugs on the body reverse progress, and a big enough crowd breaks the body apart.

