import { SEG, CELL } from '../config';
import { Rng } from '../core/rng';
import { Grid, OPEN, ROCK } from './grid';
import { SEGMENTS, N, E, S, W, rotateConnectors, SegmentDef, Op } from './segments';
import { WorldLayout, carveOp, roughenGrid } from './worldgen';

// Zones (per cell), used by the run structure, the renderer and the director's act curve.
export const Z = { nest: 0, house: 1, base: 2, intersection: 3, rig: 4, junkyard: 5, queen: 6, deep: 7 };
export const ZONE_NAMES = ['nest', 'house', 'base', 'intersection', 'oil rig', 'junkyard', "queen's chamber", 'deep nest'];

export interface Mark {
  kind: string; // 'start' | 'flashlights' | 'tank' | 'rig' | 'suit' | 'egg' | 'queen' | 'truck' | 'plug' | 'logo' | 'junk' | 'hivepocket' | 'mains'
  x: number;
  z: number;
  data?: any;
}

export interface NightLayout extends WorldLayout {
  zone: Uint8Array;
  marks: Mark[];
  plugCells: number[]; // the basement floor: rock until the end of act 1
  columns: number; // set-piece columns along the main path
  pockets: { x: number; z: number; cells: number[] }[]; // nest pockets the swarm lives in along the way
}

/**
 * The house (act 1), drawn by hand: straight walls, rooms, a hallway, the basement stairs at the
 * east end. 'P' is the basement floor plug (rock until the hive breaks through). 'F' marks the
 * cupboard with flashlights, 'S' the start, 'L' the house lamps, 'V' a vent the hive uses.
 */
const HOUSE = [
  '################################',
  '#..........#.........#.........#',
  '#..........#.........#.........#',
  '#...L......#....L....#....L....#',
  '#..........#.........#.........#',
  '#..........#.........#.........#',
  '#..........#.........#.........#',
  '#####..#########..#######..#####',
  '#..............................#',
  '#..............................#',
  '#....S.........L...............#',
  '#..............................#',
  '#####..#####################..##',
  '#..........#..........#........P',
  '#..........#..........#........P',
  '#....L.....#....L.....#....L...P',
  '#..........#..........#........P',
  '#..........#..........#........P',
  '#........F.#..........#........P',
  '#####..#########..#####........P',
  '#..............................#',
  '#..........V...................#',
  '#..............................#',
  '################################',
];

const C = SEG / 2;
const edgeW: [number, number] = [-2, C], edgeE: [number, number] = [SEG + 1, C];

/** Set pieces: carve ops (local cells) + marks (local cells) + zone. Connected west <-> east. */
interface SetPiece {
  zone: number;
  ops: Op[];
  marks: { kind: string; at: [number, number]; data?: any }[];
}
const PIECES: Record<string, SetPiece> = {
  base: {
    zone: Z.base,
    ops: [
      { op: 'tube', a: edgeW, b: [10, C], r: 3.2 },
      { op: 'blob', at: [C, C], r: 12, ry: 10 },
      { op: 'tube', a: [22, C], b: edgeE, r: 3.4 },
      { op: 'pillar', at: [C + 4, C - 5], r: 1.5 },
    ],
    marks: [{ kind: 'hivepocket', at: [C, C + 8] }],
  },
  intersection: {
    zone: Z.intersection,
    ops: [
      { op: 'tube', a: edgeW, b: edgeE, r: 3.4 },
      { op: 'tube', a: [C, -2], b: [C, SEG + 1], r: 3.4 },
      { op: 'blob', at: [C, C], r: 8 },
    ],
    marks: [
      { kind: 'tank', at: [C - 3, C - 2] },
      { kind: 'tank', at: [C - 3, C + 2] },
      { kind: 'tank', at: [C + 3, C - 2] },
      { kind: 'tank', at: [C + 3, C + 2] },
      { kind: 'lightning', at: [C, C + 5] },
    ],
  },
  rig: {
    zone: Z.rig,
    ops: [
      { op: 'tube', a: edgeW, b: edgeE, r: 3.4 },
      { op: 'blob', at: [C, C], r: 10, ry: 9 },
      { op: 'pillar', at: [C - 6, C + 5], r: 1.2 },
    ],
    marks: [{ kind: 'rig', at: [C, C], data: { fuel: 350 } }],
  },
  junkyard: {
    zone: Z.junkyard,
    ops: [
      { op: 'tube', a: edgeW, b: edgeE, r: 3.6 },
      { op: 'blob', at: [C, C], r: 13, ry: 12 },
      // crushed Enlite machines as solid wrecks
      { op: 'pillar', at: [C - 6, C - 4], r: 2 },
      { op: 'pillar', at: [C + 5, C + 5], r: 2.4 },
      { op: 'pillar', at: [C + 6, C - 6], r: 1.4 },
      { op: 'pillar', at: [C - 4, C + 6], r: 1.6 },
    ],
    marks: [
      { kind: 'suit', at: [C - 2, C] },
      { kind: 'suit', at: [C, C - 2] },
      { kind: 'suit', at: [C + 2, C] },
      { kind: 'suit', at: [C, C + 2] },
      { kind: 'logo', at: [C - 6, C - 4] },
      { kind: 'logo', at: [C + 5, C + 5] },
      { kind: 'rig', at: [C + 8, C], data: { fuel: 500 } },
    ],
  },
  queen: {
    zone: Z.queen,
    ops: [
      { op: 'tube', a: edgeW, b: [8, C], r: 3.6 },
      { op: 'blob', at: [C + 2, C], r: 13, ry: 13 },
    ],
    marks: [
      { kind: 'queen', at: [C + 6, C] },
      { kind: 'egg', at: [C - 2, C - 7] },
      { kind: 'egg', at: [C + 2, C + 8] },
      { kind: 'egg', at: [C + 9, C - 6] },
      { kind: 'egg', at: [C - 4, C + 5] },
      { kind: 'egg', at: [C + 11, C + 4] },
      { kind: 'truck', at: [7, C] },
      { kind: 'hivepocket', at: [C + 6, C] },
    ],
  },
};

/** Main-path columns: house, base, nest, intersection, nest, oil rig, deep nest, junkyard, queen. */
const COLUMNS = ['house', 'base', 'nest', 'intersection', 'nest', 'rig', 'deep', 'junkyard', 'queen'];

/** Stitch the night: hand-built set pieces in order along the main row, procedural nest between. */
export function generateNight(seed: number): NightLayout {
  const rng = new Rng(seed * 977 + 3);
  const gw = COLUMNS.length, gh = 3, pad = 4;
  const W_ = gw * SEG + pad * 2, H_ = gh * SEG + pad * 2;
  const grid = new Grid(W_, H_);
  const zone = new Uint8Array(grid.n);
  const marks: Mark[] = [];
  const plugCells: number[] = [];
  const pockets: NightLayout['pockets'] = [];
  const mainRow = 1;
  const at = (gx: number, gy: number, lx: number, ly: number) => ({ x: (pad + gx * SEG + lx + 0.5) * CELL, z: (pad + gy * SEG + ly + 0.5) * CELL });
  // side branches off nest columns (up or down), making small loops
  const masks = new Array(gw * gh).fill(0);
  for (let c = 0; c < gw - 1; c++) {
    masks[mainRow * gw + c] |= E;
    masks[mainRow * gw + c + 1] |= W;
  }
  for (let c = 2; c < gw - 2; c++) {
    if (COLUMNS[c] !== 'nest' && COLUMNS[c] !== 'deep' && COLUMNS[c] !== 'intersection') continue;
    for (const gy of [0, 2]) {
      if (rng.next() < (COLUMNS[c] === 'intersection' ? 1 : 0.6)) {
        const dir = gy === 0 ? N : S, opp = gy === 0 ? S : N;
        masks[mainRow * gw + c] |= dir;
        masks[gy * gw + c] |= opp;
        // sometimes run along the side row and rejoin (a loop)
        if (c + 1 < gw - 2 && rng.next() < 0.5 && (COLUMNS[c + 1] === 'nest' || COLUMNS[c + 1] === 'deep' || COLUMNS[c + 1] === 'rig')) {
          masks[gy * gw + c] |= E;
          masks[gy * gw + c + 1] |= W;
          if (COLUMNS[c + 1] !== 'rig') {
            masks[gy * gw + c + 1] |= opp;
            masks[mainRow * gw + c + 1] |= dir;
          }
        }
      }
    }
  }
  const pillars: { ox: number; oy: number; op: Op; rot: number }[] = [];
  const zoneRect = (gx: number, gy: number, z: number) => {
    for (let y = 0; y < SEG; y++) for (let x = 0; x < SEG; x++) zone[(pad + gy * SEG + y) * W_ + pad + gx * SEG + x] = z;
  };
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const mask = masks[gy * gw + gx];
      if (!mask) continue;
      const ox = pad + gx * SEG, oy = pad + gy * SEG;
      const kind = gy === mainRow ? COLUMNS[gx] : 'nest';
      if (kind === 'house') {
        zoneRect(gx, gy, Z.house);
        HOUSE.forEach((row, y) =>
          [...row].forEach((ch, x) => {
            const cx = ox + x, cy = oy + y;
            if (ch === '#') return;
            if (ch === 'P') {
              grid.setRaw(cx, cy, ROCK);
              plugCells.push(grid.idx(cx, cy));
              return;
            }
            grid.setRaw(cx, cy, OPEN);
            const m = at(gx, gy, x, y);
            if (ch === 'S') marks.push({ kind: 'start', ...m });
            if (ch === 'F') marks.push({ kind: 'flashlights', ...m });
            if (ch === 'L') marks.push({ kind: 'houselamp', ...m });
            if (ch === 'V') marks.push({ kind: 'vent', ...m });
          }),
        );
        continue;
      }
      const piece = PIECES[kind];
      if (piece) {
        zoneRect(gx, gy, piece.zone);
        for (const op of piece.ops) {
          if (op.op === 'pillar') pillars.push({ ox, oy, op, rot: 0 });
          else carveOp(grid, ox, oy, op, 0, true);
        }
        // side connectors on set pieces (the intersection)
        if (mask & N) carveOp(grid, ox, oy, { op: 'tube', a: [C, -2], b: [C, C], r: 3.4 }, 0, true);
        if (mask & S) carveOp(grid, ox, oy, { op: 'tube', a: [C, C], b: [C, SEG + 1], r: 3.4 }, 0, true);
        for (const mk of piece.marks) {
          const m = at(gx, gy, mk.at[0], mk.at[1]);
          if (mk.kind === 'hivepocket') pockets.push({ ...m, cells: [] });
          else marks.push({ kind: mk.kind, ...m, data: mk.data });
        }
        continue;
      }
      // procedural nest segment
      const cands: { def: SegmentDef; rot: number }[] = [];
      for (const def of SEGMENTS) for (let rot = 0; rot < 4; rot++) if (rotateConnectors(def.connectors, rot) === mask) cands.push({ def, rot });
      const c = rng.pick(cands);
      if (kind === 'deep') zoneRect(gx, gy, Z.deep);
      for (const op of c.def.ops) {
        if (op.op === 'pillar') pillars.push({ ox, oy, op, rot: c.rot });
        else carveOp(grid, ox, oy, op, c.rot, true);
      }
      if (c.def.tags?.includes('deadend') || gy !== mainRow) pockets.push({ ...at(gx, gy, C, C), cells: [] });
    }
  for (const pl of pillars) carveOp(grid, pl.ox, pl.oy, pl.op, pl.rot, false);
  // organic edges everywhere except the house
  const houseCells = new Set<number>();
  for (let i = 0; i < grid.n; i++) if (zone[i] === Z.house) houseCells.add(i);
  roughenGrid(grid, seed, houseCells);
  // the plug stays rock until the end of act 1
  for (const i of plugCells) grid.cells[i] = ROCK;
  // the swarm's pockets: open cells within 5 m of each pocket centre
  for (const pk of pockets) {
    const cx = Math.floor(pk.x / CELL), cz = Math.floor(pk.z / CELL);
    for (let dz = -10; dz <= 10; dz++)
      for (let dx = -10; dx <= 10; dx++) if (dx * dx + dz * dz <= 100 && grid.isOpen(cx + dx, cz + dz)) pk.cells.push(grid.idx(cx + dx, cz + dz));
  }
  const start = marks.find((m) => m.kind === 'start')!;
  const queen = marks.find((m) => m.kind === 'queen')!;
  const qp = pockets[pockets.length - 1];
  return {
    grid,
    placed: [],
    start: { x: start.x, z: start.z },
    hive: { x: queen.x, z: queen.z },
    hiveCells: qp ? qp.cells : [],
    pad,
    zone,
    marks,
    plugCells,
    columns: gw,
    pockets: pockets.filter((p) => p.cells.length > 20),
  };
}

