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

