import { CELL } from '../config';
import { Grid, OPEN, SOLID as SOLID_ } from './grid';

export type LightKind = 'fire' | 'burn' | 'flare' | 'flashlight' | 'lamp' | 'floodlight' | 'motion' | 'xmas';
export const ELECTRIC: LightKind[] = ['flashlight', 'lamp', 'floodlight', 'motion'];
/** index into LightMap.kindAt (0 = no electric light) */
export const ELECTRIC_INDEX: Record<string, number> = { flashlight: 1, lamp: 2, floodlight: 3, motion: 4, xmas: 5 };
export const isElectric = (k: LightKind) => k === 'flashlight' || k === 'lamp' || k === 'floodlight' || k === 'motion' || k === 'xmas';

export interface LightSource {
  id: number;
  kind: LightKind;
  x: number; // world metres
  z: number;
  y: number;
  dirX: number; // facing (cones)
  dirZ: number;
  radius: number; // metres
  cone: number; // half-angle in radians; >= PI means omni
  intensity: number;
  on: boolean;
  owner?: string; // player id, device id, etc.
}

let nextId = 1;
export function makeLight(kind: LightKind, opts: Partial<LightSource>): LightSource {
  return {
    id: nextId++,
    kind,
    x: 0,
    z: 0,
    y: 1,
    dirX: 0,
    dirZ: 1,
    radius: 5,
    cone: Math.PI,
    intensity: 1,
    on: true,
    ...opts,
  };
}

/**
 * The light map. `raw` is what players see by (and what decides dark spots);
 * `eff` is what bugs are repelled by: fire counts fully, electric light is multiplied by
 * the bugs' current belief in that device type (GDD "Electric belief").
 */
export class LightMap {
  raw: Float32Array;
  eff: Float32Array;
  fire: Float32Array; // fire contribution (real fire burns; electric only fools)
  kindAt: Uint8Array; // dominant electric light type per cell (ELECTRIC_INDEX)
  private elecMax: Float32Array;
  version = 0;
  belief: Record<string, number> = { flashlight: 1, lamp: 1, floodlight: 1, motion: 1, xmas: 1 };
  constructor(public grid: Grid) {
    this.raw = new Float32Array(grid.n);
    this.eff = new Float32Array(grid.n);
    this.fire = new Float32Array(grid.n);
    this.kindAt = new Uint8Array(grid.n);
    this.elecMax = new Float32Array(grid.n);
  }

  private last: LightSource[] = [];
  /**
   * Raw light at a point from every source except `exclude` (same falloff, cone and line of sight
   * as the map). Used to ask "is this player inside anyone else's light?".
   */
  lightAt(x: number, z: number, exclude?: LightSource | null, occluder?: { x: number; z: number; r: number } | null): number {
    const g = this.grid;
    const tx = Math.floor(x / CELL), tz = Math.floor(z / CELL);
    let sum = 0;
    for (const s of this.last) {
      if (s === exclude || !s.on || s.intensity <= 0) continue;
      const dx = x - s.x, dz = z - s.z;
      const d = Math.hypot(dx, dz);
      if (d > s.radius) continue;
      let a = 1;
      const omni = s.cone >= Math.PI - 1e-3;
      if (!omni && d > 0.35) {
        const c = (dx * s.dirX + dz * s.dirZ) / d;
        const cosCone = Math.cos(s.cone), cosSoft = Math.cos(Math.min(Math.PI, s.cone * 1.35));
        if (c < cosSoft) continue;
        a = c >= cosCone ? 1 : (c - cosSoft) / (cosCone - cosSoft);
      }
      const sx = Math.floor(s.x / CELL), sz = Math.floor(s.z / CELL);
      if (d / CELL > 1.2 && !los(g, sx, sz, tx, tz)) continue;
      if (occluder) {
        // a body between the source and the point casts a shadow on it
        const vx = x - s.x, vz = z - s.z, l2 = vx * vx + vz * vz || 1;
        const t = ((occluder.x - s.x) * vx + (occluder.z - s.z) * vz) / l2;
        if (t > 0 && t < 0.97) {
          const ox = s.x + vx * t - occluder.x, oz = s.z + vz * t - occluder.z;
          if (ox * ox + oz * oz < occluder.r * occluder.r) continue;
        }
      }
      sum += s.intensity * a * Math.pow(1 - d / s.radius, 1.15);
    }
    return sum;
  }

  rebuild(sources: LightSource[]) {
    this.last = sources.slice();
    this.raw.fill(0);
    this.eff.fill(0);
    this.fire.fill(0);
    this.kindAt.fill(0);
    this.elecMax.fill(0);
    this.touched.length = 0;
    for (const s of sources) if (s.on && s.intensity > 0) this.add(s);
    this.lightFaces();
    this.version++;
  }

  private touched: number[] = [];
  /**
   * Wall faces carry the light that falls on them (in `eff`, which bugs route by): digging out
   * through a lit face is expensive, so tendrils plan their breaches at dark spots (GDD).
   */
  private lightFaces() {
    // the same measure as surfaceRaw (brightest of the 8 neighbours, raw light), so the field and the
    // breach rule always agree about which faces can be broken out of
    const g = this.grid, e = this.eff, r = this.raw, c = g.cells, w = g.w;
    for (const i of this.touched) {
      const v = r[i];
      if (c[i] !== OPEN) continue;
      for (const j of [i + 1, i - 1, i + w, i - w, i + w + 1, i + w - 1, i - w + 1, i - w - 1]) if (j >= 0 && j < g.n && c[j] === SOLID_ && e[j] < v) e[j] = v;
    }
  }

  private add(s: LightSource) {
    const g = this.grid;
    const r = s.radius / CELL;
    const sx = s.x / CELL, sz = s.z / CELL;
    const scx = Math.floor(sx), scz = Math.floor(sz);
    if (!g.isOpen(scx, scz)) return; // a light inside earth lights nothing
    const elec = isElectric(s.kind);
    const mult = elec ? this.belief[s.kind] ?? 1 : 1;
    const ki = ELECTRIC_INDEX[s.kind] || 0;
    const omni = s.cone >= Math.PI - 1e-3;
    const cosCone = Math.cos(s.cone);
    const cosSoft = Math.cos(Math.min(Math.PI, s.cone * 1.35));
    const x0 = Math.max(0, Math.floor(sx - r)), x1 = Math.min(g.w - 1, Math.ceil(sx + r));
    const z0 = Math.max(0, Math.floor(sz - r)), z1 = Math.min(g.h - 1, Math.ceil(sz + r));
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        const i = cz * g.w + cx;
        if (g.cells[i] !== OPEN) continue;
        const dx = cx + 0.5 - sx, dz = cz + 0.5 - sz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > r) continue;
        let a = 1;
        if (!omni && i === scz * g.w + scx) a = 0.6;
        else if (!omni) {
          const c = (dx * s.dirX + dz * s.dirZ) / d;
          if (c < cosSoft) continue;
          a = c >= cosCone ? 1 : (c - cosSoft) / (cosCone - cosSoft);
        }
        if (d > 1.2 && !los(g, scx, scz, cx, cz)) continue;
        const f = s.intensity * a * Math.pow(1 - d / r, 1.15);
        if (this.raw[i] === 0) this.touched.push(i);
        this.raw[i] += f;
        this.eff[i] += f * mult;
        if (elec) {
          if (f > this.elecMax[i]) {
            this.elecMax[i] = f;
            this.kindAt[i] = ki;
          }
        } else this.fire[i] += f;
      }
  }

  rawAt(wx: number, wz: number) {
    const i = this.grid.cellAt(wx, wz);
    return i < 0 ? 0 : this.raw[i];
  }
  effAt(wx: number, wz: number) {
    const i = this.grid.cellAt(wx, wz);
    return i < 0 ? 0 : this.eff[i];
  }
  /** Light on a cell's surface. For a solid cell (a wall face) it's the brightest open neighbour. */
  surfaceRaw(i: number) {
    const g = this.grid;
    if (g.cells[i] === OPEN) return this.raw[i];
    const x = i % g.w, y = (i / g.w) | 0;
    let m = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!g.inBounds(x + dx, y + dy)) continue;
        const j = (y + dy) * g.w + x + dx;
        if (g.cells[j] === OPEN && this.raw[j] > m) m = this.raw[j];
      }
    return m;
  }
}

/** Grid line of sight between two cell centres, through open cells only (endpoints excluded). */
export function los(g: Grid, x0: number, y0: number, x1: number, y1: number): boolean {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  for (;;) {
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x === x1 && y === y1) return true;
    if (g.cells[y * g.w + x] !== OPEN) return false;
  }
}
