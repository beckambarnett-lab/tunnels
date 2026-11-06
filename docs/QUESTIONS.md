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

