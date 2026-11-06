import { CELL } from '../config';

export const OPEN = 0;
export const SOLID = 1;
export const ROCK = 2;

// The terrain: a 2D grid of 0.5 m cells, each open tunnel, diggable earth or rock.
// Every cell also has an "under" node (earth below the floor) used by the flow field;
// `burrow` marks under-layer cells the hive has already crawled through.
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  cells: Uint8Array;
  digProgress: Float32Array; // 0..1 per cell
  dugAt: Float32Array; // sim time a cell was dug open by the hive (-1 = never)
  burrow: Uint8Array; // under-layer burrows
  explored: Uint8Array; // seen by any player (for the map)
  version = 0;
  changed: number[] = []; // cell indices changed since last drain (render)
  netChanged: number[] = []; // same, drained by the host's network session
  trackNet = false;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    this.cells = new Uint8Array(this.n).fill(SOLID);
    this.digProgress = new Float32Array(this.n);
    this.dugAt = new Float32Array(this.n).fill(-1);
    this.burrow = new Uint8Array(this.n);
    this.explored = new Uint8Array(this.n);
    for (let x = 0; x < w; x++) {
      this.cells[x] = ROCK;
      this.cells[(h - 1) * w + x] = ROCK;
    }
    for (let y = 0; y < h; y++) {
      this.cells[y * w] = ROCK;
      this.cells[y * w + w - 1] = ROCK;
    }
  }

  idx(x: number, y: number) {
    return y * this.w + x;
  }
  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number) {
    if (!this.inBounds(x, y)) return ROCK;
    return this.cells[y * this.w + x];
  }
  isOpen(x: number, y: number) {
    return this.get(x, y) === OPEN;
  }
  /** world metres -> cell coordinate */
  static toCell(m: number) {
    return Math.floor(m / CELL);
  }
  cellAt(wx: number, wz: number) {
    const x = Math.floor(wx / CELL), y = Math.floor(wz / CELL);
    if (!this.inBounds(x, y)) return -1;
    return y * this.w + x;
  }
  isOpenAt(wx: number, wz: number) {
    return this.get(Math.floor(wx / CELL), Math.floor(wz / CELL)) === OPEN;
  }
  centerX(i: number) {
    return ((i % this.w) + 0.5) * CELL;
  }
  centerZ(i: number) {
    return (Math.floor(i / this.w) + 0.5) * CELL;
  }

  /** Set during generation (no change tracking). */
  setRaw(x: number, y: number, v: number) {
    if (!this.inBounds(x, y)) return;
    if (this.cells[y * this.w + x] === ROCK && (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1)) return;
    this.cells[y * this.w + x] = v;
  }

  /** Open a cell at runtime (digging). Returns true if it changed. */
  dig(i: number, time: number): boolean {
    if (this.cells[i] !== SOLID) return false;
    this.cells[i] = OPEN;
    this.digProgress[i] = 0;
    this.dugAt[i] = time;
    this.version++;
    this.changed.push(i);
    if (this.trackNet) this.netChanged.push(i);
    return true;
  }

  /** Refill a cell (fire collapsing a fresh breach). */
  fill(i: number): boolean {
    if (this.cells[i] !== OPEN) return false;
    this.cells[i] = SOLID;
    this.digProgress[i] = 0;
    this.dugAt[i] = -1;
    this.version++;
    this.changed.push(i);
    if (this.trackNet) this.netChanged.push(i);
    return true;
  }

  /** Apply a cell change received from the host. */
  applyRemote(i: number, v: number, dugAt: number) {
    if (this.cells[i] === v) return;
    this.cells[i] = v;
    this.dugAt[i] = dugAt;
    this.digProgress[i] = 0;
    this.version++;
    this.changed.push(i);
  }

  drainChanges(): number[] {
    const c = this.changed;
    this.changed = [];
    return c;
  }

  /** Is this solid cell a wall face (touches an open cell)? */
  isFace(i: number) {
    const x = i % this.w, y = (i / this.w) | 0;
    return this.get(x + 1, y) === OPEN || this.get(x - 1, y) === OPEN || this.get(x, y + 1) === OPEN || this.get(x, y - 1) === OPEN;
  }
}
