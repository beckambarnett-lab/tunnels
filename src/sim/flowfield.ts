// Pure flow-field builder. Runs inside the Web Worker in the game and directly in Node tests.
//
// Graph: every cell has a surface node (index i) and an under node (index i + n).
//  - surface OPEN   : openCost + lightCost * effectiveLight   (light is a path cost)
//  - surface SOLID  : digCost (route through earth; bugs dig it open as they go)
//  - under          : underCost, or burrowCost where the hive has already crawled
//  - ROCK           : impassable on both layers
// Built outward from the goals (reverse Dijkstra), so `next[node]` is the step a bug at
// `node` should take toward the cheapest goal. Bugs never path themselves; they read this.

export const OPEN = 0, SOLID = 1, ROCK = 2;
/** light at or above this on a wall face forbids breaking out there (LIGHT.darkThreshold) */
export const BREACH_LIGHT = 0.04;

export interface FieldParams {
  allowDig: boolean;
  allowUnder: boolean;
  openCost: number;
  digCost: number;
  underCost: number;
  burrowCost: number;
  layerChangeCost: number;
  lightCost: number;
  /** Light below this adds no cost (bugs don't mind faint spill). */
  lightFloor: number;
}

export interface FieldInput {
  w: number;
  h: number;
  cells: Uint8Array;
  burrow: Uint8Array;
  light: Float32Array; // effective repel light per cell
  goals: number[]; // node indices (surface = cell index, under = cell + n)
  params: FieldParams;
}

export interface FieldResult {
  dist: Float32Array; // 2n
  next: Int32Array; // 2n, -1 = goal or unreachable
  ms: number;
}

const SQRT2 = Math.SQRT2;

class Heap {
  idx: Int32Array;
  key: Float32Array;
  size = 0;
  constructor(cap: number) {
    this.idx = new Int32Array(cap);
    this.key = new Float32Array(cap);
  }
  push(i: number, k: number) {
    if (this.size >= this.idx.length) this.grow();
    let p = this.size++;
    const idx = this.idx, key = this.key;
    while (p > 0) {
      const parent = (p - 1) >> 1;
      if (key[parent] <= k) break;
      idx[p] = idx[parent];
      key[p] = key[parent];
      p = parent;
    }
    idx[p] = i;
    key[p] = k;
  }
  pop(): number {
    const idx = this.idx, key = this.key;
    const top = idx[0];
    const li = idx[--this.size], lk = key[this.size];
    let p = 0;
    const n = this.size;
    for (;;) {
      let c = 2 * p + 1;
      if (c >= n) break;
      if (c + 1 < n && key[c + 1] < key[c]) c++;
      if (key[c] >= lk) break;
      idx[p] = idx[c];
      key[p] = key[c];
      p = c;
    }
    idx[p] = li;
    key[p] = lk;
    return top;
  }
  topKey() {
    return this.key[0];
  }
  grow() {
    const ni = new Int32Array(this.idx.length * 2);
    ni.set(this.idx);
    const nk = new Float32Array(this.key.length * 2);
    nk.set(this.key);
    this.idx = ni;
    this.key = nk;
  }
}

export function nodeCost(inp: FieldInput, node: number): number {
  const n = inp.w * inp.h;
  const p = inp.params;
  if (node < n) {
    const c = inp.cells[node];
    if (c === OPEN) {
      const l = inp.light[node];
      return p.openCost + (l > p.lightFloor ? (l - p.lightFloor) * p.lightCost : 0);
    }
    if (c === SOLID) {
      if (!p.allowDig) return Infinity;
      // the field agrees with the breach rule: a face with light on it can't be broken out of, so
      // routes go round to a dark face instead of queueing at a lit one
      const l = inp.light[node];
      return p.digCost + (l >= BREACH_LIGHT ? 800 : 0);
    }
    return Infinity;
  }
  const i = node - n;
  if (!p.allowUnder || inp.cells[i] === ROCK) return Infinity;
  return inp.burrow[i] ? p.burrowCost : p.underCost;
}

export function buildField(inp: FieldInput): FieldResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { w, h, cells } = inp;
  const n = w * h;
  const dist = new Float32Array(2 * n).fill(Infinity);
  const next = new Int32Array(2 * n).fill(-1);
  // Precompute per-node costs once.
  const cost = new Float32Array(2 * n);
  for (let i = 0; i < 2 * n; i++) cost[i] = nodeCost(inp, i);
  const heap = new Heap(Math.max(1024, n));
  for (const g of inp.goals) {
    if (g < 0 || g >= 2 * n || !isFinite(cost[g])) continue;
    dist[g] = 0;
    heap.push(g, 0);
  }
  const lc = inp.params.layerChangeCost;
  while (heap.size) {
    const dk = heap.topKey();
    const b = heap.pop();
    if (dk > dist[b]) continue;
    const db = dist[b];
    if (b < n) {
      const bx = b % w, by = (b / w) | 0;
      const bOpen = cells[b] === OPEN;
      // 8 neighbours on the surface
      for (let dy = -1; dy <= 1; dy++) {
        const ay = by + dy;
        if (ay < 0 || ay >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const ax = bx + dx;
          if (ax < 0 || ax >= w) continue;
          const a = ay * w + ax;
          const ca = cost[a];
          if (!isFinite(ca)) continue;
          let step = 1;
          if (dx && dy) {
            // diagonals only between open cells with both orthogonals open (no corner cutting)
            if (!bOpen || cells[a] !== OPEN || cells[by * w + ax] !== OPEN || cells[ay * w + bx] !== OPEN) continue;
            step = SQRT2;
          }
          const nd = db + step * ca;
          if (nd < dist[a]) {
            dist[a] = nd;
            next[a] = b;
            heap.push(a, nd);
          }
        }
      }
      // surface <- under (a bug under this cell comes up here; open cells only)
      const u = b + n;
      if (bOpen && isFinite(cost[u])) {
        const nd = db + cost[u] + lc;
        if (nd < dist[u]) {
          dist[u] = nd;
          next[u] = b;
          heap.push(u, nd);
        }
      }
    } else {
      const i = b - n;
      const bx = i % w, by = (i / w) | 0;
      // 4 neighbours in the under layer
      for (let k = 0; k < 4; k++) {
        const ax = bx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ay = by + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
        const a = ay * w + ax + n;
        const ca = cost[a];
        if (!isFinite(ca)) continue;
        const nd = db + ca;
        if (nd < dist[a]) {
          dist[a] = nd;
          next[a] = b;
          heap.push(a, nd);
        }
      }
      // under <- surface (a bug on this cell dives down here)
      const s = i;
      if (cells[s] === OPEN && isFinite(cost[s])) {
        const nd = db + cost[s] + lc;
        if (nd < dist[s]) {
          dist[s] = nd;
          next[s] = b;
          heap.push(s, nd);
        }
      }
    }
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { dist, next, ms: t1 - t0 };
}

export function paramsKey(p: FieldParams) {
  return `${+p.allowDig}${+p.allowUnder}:${p.digCost}:${p.underCost}:${p.lightCost}`;
}
