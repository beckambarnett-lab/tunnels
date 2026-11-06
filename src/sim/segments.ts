import { SEG } from '../config';

// Hand-built tunnel segments. Each is authored once in a canonical orientation as a short list
// of carve operations in local cell coordinates (0..SEG-1) and declares its edge connectors.
// The stitcher rotates them in 90° steps so connectors match their neighbours.
// Connector bits: N=1 (y=0 edge), E=2 (x=SEG-1), S=4 (y=SEG-1), W=8 (x=0).

export const N = 1, E = 2, S = 4, W = 8;

export type Op =
  | { op: 'tube'; a: [number, number]; b: [number, number]; r: number }
  | { op: 'blob'; at: [number, number]; r: number; ry?: number }
  | { op: 'pillar'; at: [number, number]; r: number };

export interface SegmentDef {
  name: string;
  connectors: number; // canonical orientation
  ops: Op[];
  tags?: string[];
}

const C = SEG / 2; // 16
const R = 3.4; // connector half-width in cells (≈ 3.4 m wide tunnels)
const edge = {
  N: [C, -2] as [number, number],
  E: [SEG + 1, C] as [number, number],
  S: [C, SEG + 1] as [number, number],
  W: [-2, C] as [number, number],
};

export const SEGMENTS: SegmentDef[] = [
  {
    name: 'dead-end chamber',
    connectors: N,
    tags: ['deadend'],
    ops: [
      { op: 'tube', a: edge.N, b: [C, 12], r: R },
      { op: 'blob', at: [C, 18], r: 9, ry: 8 },
      { op: 'pillar', at: [C - 3, 19], r: 1.4 },
    ],
  },
  {
    name: 'hive pocket',
    connectors: N,
    tags: ['deadend', 'hive'],
    ops: [
      { op: 'tube', a: edge.N, b: [C + 2, 10], r: R - 0.4 },
      { op: 'blob', at: [C, 19], r: 11, ry: 9 },
      { op: 'blob', at: [C + 8, 24], r: 4 },
      { op: 'pillar', at: [C + 4, 17], r: 1.2 },
      { op: 'pillar', at: [C - 5, 22], r: 1.6 },
    ],
  },
  {
    name: 'straight wiggle',
    connectors: N | S,
    ops: [
      { op: 'tube', a: edge.N, b: [C + 4, 11], r: R },
      { op: 'tube', a: [C + 4, 11], b: [C - 3, 21], r: R + 0.5 },
      { op: 'tube', a: [C - 3, 21], b: edge.S, r: R },
    ],
  },
  {
    name: 'straight gallery',
    connectors: N | S,
    ops: [
      { op: 'tube', a: edge.N, b: edge.S, r: R },
      { op: 'blob', at: [C, C], r: 7, ry: 9 },
      { op: 'pillar', at: [C + 2, C - 2], r: 1.3 },
      { op: 'pillar', at: [C - 2, C + 3], r: 1.1 },
    ],
  },
  {
    name: 'bend',
    connectors: N | E,
    ops: [
      { op: 'tube', a: edge.N, b: [C, 13], r: R },
      { op: 'tube', a: [C, 13], b: [19, C], r: R + 0.6 },
      { op: 'tube', a: [19, C], b: edge.E, r: R },
    ],
  },
  {
    name: 'bend cave',
    connectors: N | E,
    ops: [
      { op: 'tube', a: edge.N, b: [C - 1, C], r: R },
      { op: 'blob', at: [C, C + 1], r: 6.5 },
      { op: 'tube', a: [C, C + 1], b: edge.E, r: R },
    ],
  },
  {
    name: 'tee',
    connectors: N | E | S,
    ops: [
      { op: 'tube', a: edge.N, b: edge.S, r: R },
      { op: 'tube', a: [C, C], b: edge.E, r: R },
      { op: 'blob', at: [C + 1, C], r: 5 },
    ],
  },
  {
    name: 'tee chamber',
    connectors: N | E | S,
    ops: [
      { op: 'tube', a: edge.N, b: [C, 10], r: R },
      { op: 'tube', a: [C, 22], b: edge.S, r: R },
      { op: 'tube', a: [22, C], b: edge.E, r: R },
      { op: 'blob', at: [C, C], r: 8.5 },
      { op: 'pillar', at: [C - 2, C], r: 1.8 },
    ],
  },
  {
    name: 'crossroads',
    connectors: N | E | S | W,
    ops: [
      { op: 'tube', a: edge.N, b: edge.S, r: R },
      { op: 'tube', a: edge.W, b: edge.E, r: R },
      { op: 'blob', at: [C, C], r: 6 },
    ],
  },
  {
    name: 'pillar hall',
    connectors: N | E | S | W,
    tags: ['hall'],
    ops: [
      { op: 'tube', a: edge.N, b: edge.S, r: R },
      { op: 'tube', a: edge.W, b: edge.E, r: R },
      { op: 'blob', at: [C, C], r: 11, ry: 10 },
      { op: 'pillar', at: [C - 5, C - 4], r: 1.5 },
      { op: 'pillar', at: [C + 5, C - 4], r: 1.5 },
      { op: 'pillar', at: [C - 5, C + 4], r: 1.5 },
      { op: 'pillar', at: [C + 5, C + 4], r: 1.5 },
    ],
  },
];

/** Rotate connector bits 90° clockwise `k` times. */
export function rotateConnectors(c: number, k: number) {
  for (let i = 0; i < k; i++) {
    let r = 0;
    if (c & N) r |= E;
    if (c & E) r |= S;
    if (c & S) r |= W;
    if (c & W) r |= N;
    c = r;
  }
  return c;
}

/** Rotate a local point 90° clockwise `k` times around the segment centre. */
export function rotatePoint(p: [number, number], k: number): [number, number] {
  let [x, y] = p;
  const m = SEG - 1;
  for (let i = 0; i < k; i++) {
    const nx = m - y;
    const ny = x;
    x = nx;
    y = ny;
  }
  return [x, y];
}
