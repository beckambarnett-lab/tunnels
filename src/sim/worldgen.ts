import { SEG, CELL } from '../config';
import { Rng, hash2 } from '../core/rng';
import { Grid, OPEN, SOLID, ROCK } from './grid';
import { SEGMENTS, N, E, S, W, rotateConnectors, rotatePoint, SegmentDef, Op } from './segments';

export interface Placed {
  gx: number;
  gy: number;
  def: SegmentDef;
  rot: number;
  mask: number;
}

export interface WorldLayout {
  grid: Grid;
  placed: Placed[];
  start: { x: number; z: number }; // world metres
  hive: { x: number; z: number };
  hiveCells: number[]; // open cells inside the hive segment
  pad: number;
}

const DIRS = [
  { bit: N, dx: 0, dy: -1, opp: S },
  { bit: E, dx: 1, dy: 0, opp: W },
  { bit: S, dx: 0, dy: 1, opp: N },
  { bit: W, dx: -1, dy: 0, opp: E },
];

/** Stitch hand-built segments into a nest layout. Same seed -> same layout. */
export function generateWorld(seed: number, gw = 4, gh = 3, pad = 4): WorldLayout {
  const rng = new Rng(seed);
  const masks = new Array(gw * gh).fill(0);
  // Random spanning tree (DFS) so every segment is reachable.
  const startSlot = { gx: 0, gy: Math.floor(gh / 2) };
  const visited = new Array(gw * gh).fill(false);
  const depth = new Array(gw * gh).fill(0);
  const stack = [startSlot.gy * gw + startSlot.gx];
  visited[stack[0]] = true;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const cx = cur % gw, cy = (cur / gw) | 0;
    const opts = DIRS.filter((d) => {
      const nx = cx + d.dx, ny = cy + d.dy;
      return nx >= 0 && ny >= 0 && nx < gw && ny < gh && !visited[ny * gw + nx];
    });
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const d = rng.pick(opts);
    const nx = cx + d.dx, ny = cy + d.dy, ni = ny * gw + nx;
    masks[cur] |= d.bit;
    masks[ni] |= d.opp;
    visited[ni] = true;
    depth[ni] = depth[cur] + 1;
    stack.push(ni);
  }
  // Hive: deepest leaf of the tree (single connector), far from the start.
  let hiveSlot = -1;
  for (let i = 0; i < gw * gh; i++) {
    const single = [N, E, S, W].includes(masks[i]);
    if (single && i !== startSlot.gy * gw + startSlot.gx && (hiveSlot < 0 || depth[i] > depth[hiveSlot])) hiveSlot = i;
  }
  // A few extra loops so the nest isn't a pure tree (never touching the hive slot).
  for (let i = 0; i < gw * gh; i++) {
    if (i === hiveSlot) continue;
    const cx = i % gw, cy = (i / gw) | 0;
    for (const d of [DIRS[1], DIRS[2]]) {
      const nx = cx + d.dx, ny = cy + d.dy;
      if (nx >= gw || ny >= gh) continue;
      const ni = ny * gw + nx;
      if (ni === hiveSlot || masks[i] & d.bit) continue;
      if (rng.next() < 0.22) {
        masks[i] |= d.bit;
        masks[ni] |= d.opp;
      }
    }
  }

  const W_ = gw * SEG + pad * 2, H_ = gh * SEG + pad * 2;
  const grid = new Grid(W_, H_);
  const placed: Placed[] = [];
  for (let i = 0; i < gw * gh; i++) {
    const mask = masks[i];
    const gx = i % gw, gy = (i / gw) | 0;
    const cands: { def: SegmentDef; rot: number }[] = [];
    for (const def of SEGMENTS) {
      const isHive = def.tags?.includes('hive');
      if (i === hiveSlot ? !isHive : isHive) continue;
      for (let rot = 0; rot < 4; rot++) if (rotateConnectors(def.connectors, rot) === mask) cands.push({ def, rot });
    }
    if (!cands.length) throw new Error('no segment for mask ' + mask);
    const c = rng.pick(cands);
    placed.push({ gx, gy, def: c.def, rot: c.rot, mask });
  }

  // Carve, then pillars, then roughen edges.
  const pillars: { ox: number; oy: number; op: Op; rot: number }[] = [];
  for (const p of placed) {
    const ox = pad + p.gx * SEG, oy = pad + p.gy * SEG;
    for (const op of p.def.ops) {
      if (op.op === 'pillar') pillars.push({ ox, oy, op, rot: p.rot });
      else carve(grid, ox, oy, op, p.rot, true);
    }
  }
  for (const pl of pillars) carve(grid, pl.ox, pl.oy, pl.op, pl.rot, false);
  roughen(grid, seed);

  const sx = pad + startSlot.gx * SEG + SEG / 2, sy = pad + startSlot.gy * SEG + SEG / 2;
  const hx = pad + (hiveSlot % gw) * SEG, hy = pad + ((hiveSlot / gw) | 0) * SEG;
  const hiveCells: number[] = [];
  for (let y = hy; y < hy + SEG; y++) for (let x = hx; x < hx + SEG; x++) if (grid.get(x, y) === OPEN) hiveCells.push(grid.idx(x, y));
  // Make sure the start cell is open (it always is for authored segments, but be safe).
  const start = nearestOpen(grid, sx, sy);
  const hc = hiveCells.length ? hiveCells[(hiveCells.length / 2) | 0] : grid.idx(hx + SEG / 2, hy + SEG / 2);
  return {
    grid,
    placed,
    start: { x: grid.centerX(start), z: grid.centerZ(start) },
    hive: { x: grid.centerX(hc), z: grid.centerZ(hc) },
    hiveCells,
    pad,
  };
}

function carve(grid: Grid, ox: number, oy: number, op: Op, rot: number, open: boolean) {
  const v = open ? OPEN : SOLID;
  if (op.op === 'tube') {
    const a = rotatePoint(op.a, rot), b = rotatePoint(op.b, rot);
    const r = op.r;
    const minx = Math.floor(Math.min(a[0], b[0]) - r), maxx = Math.ceil(Math.max(a[0], b[0]) + r);
    const miny = Math.floor(Math.min(a[1], b[1]) - r), maxy = Math.ceil(Math.max(a[1], b[1]) + r);
    for (let y = miny; y <= maxy; y++)
      for (let x = minx; x <= maxx; x++) {
        if (distSeg(x, y, a, b) <= r) setIn(grid, ox, oy, x, y, v);
      }
  } else {
    const at = rotatePoint(op.at, rot);
    let rx = op.r, ry = op.op === 'blob' && op.ry ? op.ry : op.r;
    if (rot % 2 === 1) [rx, ry] = [ry, rx];
    for (let y = Math.floor(at[1] - ry); y <= Math.ceil(at[1] + ry); y++)
      for (let x = Math.floor(at[0] - rx); x <= Math.ceil(at[0] + rx); x++) {
        const dx = (x - at[0]) / rx, dy = (y - at[1]) / ry;
        if (dx * dx + dy * dy <= 1) setIn(grid, ox, oy, x, y, v);
      }
  }
}

function setIn(grid: Grid, ox: number, oy: number, lx: number, ly: number, v: number) {
  // Tubes may poke 2 cells past the segment edge so connectors meet; clamp to the segment ±2.
  if (lx < -2 || ly < -2 || lx > SEG + 1 || ly > SEG + 1) return;
  const x = ox + lx, y = oy + ly;
  if (x <= 0 || y <= 0 || x >= grid.w - 1 || y >= grid.h - 1) return;
  if (grid.get(x, y) === ROCK) return;
  grid.setRaw(x, y, v);
}

function distSeg(px: number, py: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy || 1;
  let t = ((px - a[0]) * vx + (py - a[1]) * vy) / l2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (a[0] + vx * t), dy = py - (a[1] + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Organic edges: random flips on the boundary, then one smoothing pass. */
function roughen(grid: Grid, seed: number) {
  const { w, h } = grid;
  const src = grid.cells.slice();
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      if (src[i] === ROCK) continue;
      let open = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (src[i + dy * w + dx] === OPEN) open++;
      if (open > 0 && open < 9) {
        const r = hash2(x, y, seed);
        if (src[i] === SOLID && r < 0.28) grid.cells[i] = OPEN;
        else if (src[i] === OPEN && r < 0.12) grid.cells[i] = SOLID;
      }
    }
  const s2 = grid.cells.slice();
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (s2[i] === ROCK) continue;
      let open = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && s2[i + dy * w + dx] === OPEN) open++;
      if (open >= 5) grid.cells[i] = OPEN;
      else if (open <= 2) grid.cells[i] = SOLID;
    }
}

function nearestOpen(grid: Grid, x: number, y: number) {
  for (let r = 0; r < 20; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (grid.isOpen(x + dx, y + dy)) return grid.idx(x + dx, y + dy);
  return grid.idx(x, y);
}

export const metresPerCell = CELL;
