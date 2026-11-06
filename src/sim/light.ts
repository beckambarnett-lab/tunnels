import { CELL } from '../config';
import { Grid, OPEN } from './grid';

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

  rebuild(sources: LightSource[]) {
    this.raw.fill(0);
    this.eff.fill(0);
    this.fire.fill(0);
    this.kindAt.fill(0);
    this.elecMax.fill(0);
    for (const s of sources) if (s.on && s.intensity > 0) this.add(s);
    this.version++;
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
