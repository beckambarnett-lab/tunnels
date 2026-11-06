import * as THREE from 'three';
import { CELL, CHUNK, WALL_H } from '../config';
import { hash2 } from '../core/rng';
import { Grid, OPEN } from '../sim/grid';

/**
 * Chunked terrain: for each 16x16-cell chunk, one merged geometry of floor, ceiling and the
 * exposed wall faces. Grid corners get a stable position-hashed jitter so tunnels look organic
 * and chunks stay watertight. A dig rebuilds only the touched chunk(s).
 */
export class TerrainMesh {
  group = new THREE.Group();
  chunks: (THREE.Mesh | null)[];
  cw: number;
  ch: number;
  material: THREE.MeshStandardMaterial;
  rebuilds = 0;

  /** `zone` (night mode): per-cell zone ids for house / junkyard / deep-nest looks. */
  constructor(public grid: Grid, public seed: number, public zone: Uint8Array | null = null) {
    this.cw = Math.ceil(grid.w / CHUNK);
    this.ch = Math.ceil(grid.h / CHUNK);
    this.chunks = new Array(this.cw * this.ch).fill(null);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, flatShading: true });
    for (let i = 0; i < this.chunks.length; i++) this.build(i);
  }

  private z(x: number, y: number) {
    if (!this.zone) return 0;
    const g = this.grid;
    const cx = Math.max(0, Math.min(g.w - 1, x)), cy = Math.max(0, Math.min(g.h - 1, y));
    return this.zone[cy * g.w + cx];
  }
  /** house corners: any of the four cells around a corner is house */
  private houseCorner(x: number, y: number) {
    return this.zone && (this.z(x, y) === 1 || this.z(x - 1, y) === 1 || this.z(x, y - 1) === 1 || this.z(x - 1, y - 1) === 1);
  }
  /** Jittered corner position (corner coords in cells). The house keeps straight walls. */
  private cx(x: number, y: number) {
    if (this.houseCorner(x, y)) return x * CELL;
    return (x + (hash2(x, y, this.seed) - 0.5) * 0.55) * CELL;
  }
  private cz(x: number, y: number) {
    if (this.houseCorner(x, y)) return y * CELL;
    return (y + (hash2(y, x, this.seed + 5) - 0.5) * 0.55) * CELL;
  }
  private ceil(x: number, y: number) {
    if (this.houseCorner(x, y)) return 2.6;
    return WALL_H - 0.1 + hash2(x * 3, y * 7, this.seed + 9) * 0.22 + Math.sin(x * 0.23 + y * 0.05) * 0.3 + Math.cos(y * 0.19 - x * 0.07) * 0.3;
  }

  onCellsChanged(cells: number[]) {
    const dirty = new Set<number>();
    for (const i of cells) {
      const x = i % this.grid.w, y = (i / this.grid.w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = Math.floor((x + dx) / CHUNK), cy = Math.floor((y + dy) / CHUNK);
          if (cx >= 0 && cy >= 0 && cx < this.cw && cy < this.ch) dirty.add(cy * this.cw + cx);
        }
    }
    for (const c of dirty) this.build(c);
  }

  private build(ci: number) {
    const g = this.grid;
    const ox = (ci % this.cw) * CHUNK, oy = Math.floor(ci / this.cw) * CHUNK;
    const pos: number[] = [];
    const col: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[], r: number, gg: number, bb: number) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let k = 0; k < 6; k++) col.push(r, gg, bb);
    };
    for (let y = oy; y < Math.min(oy + CHUNK, g.h); y++)
      for (let x = ox; x < Math.min(ox + CHUNK, g.w); x++) {
        if (g.get(x, y) !== OPEN) continue;
        const i = g.idx(x, y);
        const hive = g.dugAt[i] >= 0;
        const v = hash2(x, y, this.seed + 1) * 0.04;
        const zn = this.z(x, y);
        // per-zone palette: [floor, ceiling, wall-low, wall-high]
        const pal: number[][] | null =
          zn === 1
            ? [[0.36, 0.22, 0.12], [0.62, 0.6, 0.55], [0.52, 0.47, 0.36], [0.6, 0.55, 0.44]] // house: wood floor, wallpaper
            : zn === 5
              ? [[0.16, 0.15, 0.14], [0.12, 0.1, 0.09], [0.36, 0.2, 0.11], [0.3, 0.17, 0.1]] // junkyard: rust and scrap
              : zn === 6 || zn === 7
                ? [[0.15, 0.1, 0.1], [0.1, 0.07, 0.08], [0.2, 0.12, 0.14], [0.17, 0.1, 0.13]] // deep nest / queen: resin
                : null;
        // floor
        const p00 = [this.cx(x, y), 0, this.cz(x, y)];
        const p10 = [this.cx(x + 1, y), 0, this.cz(x + 1, y)];
        const p11 = [this.cx(x + 1, y + 1), 0, this.cz(x + 1, y + 1)];
        const p01 = [this.cx(x, y + 1), 0, this.cz(x, y + 1)];
        if (hive) quad(p00, p01, p11, p10, 0.16 + v, 0.11 + v, 0.08);
        else if (pal) quad(p00, p01, p11, p10, pal[0][0] + v, pal[0][1] + v, pal[0][2] + v);
        else quad(p00, p01, p11, p10, 0.2 + v, 0.15 + v, 0.11 + v);
        // ceiling
        const c00 = [p00[0], this.ceil(x, y), p00[2]];
        const c10 = [p10[0], this.ceil(x + 1, y), p10[2]];
        const c11 = [p11[0], this.ceil(x + 1, y + 1), p11[2]];
        const c01 = [p01[0], this.ceil(x, y + 1), p01[2]];
        if (pal) quad(c00, c10, c11, c01, pal[1][0] + v, pal[1][1] + v, pal[1][2] + v);
        else quad(c00, c10, c11, c01, 0.12 + v, 0.09 + v, 0.08 + v);
        // walls toward solid neighbours (two vertical bands, mid vertices bulge)
        const wall = (a: number[], b: number[], ha: number, hb: number, kx: number, ky: number) => {
          const ma = [a[0] + (hash2(kx, ky, this.seed + 3) - 0.5) * 0.25, ha * 0.5, a[2] + (hash2(ky, kx, this.seed + 4) - 0.5) * 0.25];
          const mb = [b[0] + (hash2(kx + 1, ky + 7, this.seed + 3) - 0.5) * 0.25, hb * 0.5, b[2] + (hash2(ky + 7, kx + 1, this.seed + 4) - 0.5) * 0.25];
          const ta = [a[0], ha, a[2]], tb = [b[0], hb, b[2]];
          const s = hive ? 0.75 : 1;
          const w1 = hash2(kx, ky, this.seed + 8) * 0.05;
          if (pal) {
            if (zn === 1) {
              // straight house walls: no bulge
              ma[0] = (a[0] + a[0]) / 2;
              ma[2] = a[2];
              mb[0] = b[0];
              mb[2] = b[2];
            }
            quad(b, a, ma, mb, (pal[2][0] + w1) * s, (pal[2][1] + w1) * s, (pal[2][2] + w1) * s);
            quad(mb, ma, ta, tb, (pal[3][0] + w1) * s, (pal[3][1] + w1) * s, (pal[3][2] + w1) * s);
          } else {
            quad(b, a, ma, mb, (0.24 + w1) * s, (0.17 + w1) * s, (0.13 + w1) * s);
            quad(mb, ma, ta, tb, (0.2 + w1) * s, (0.14 + w1) * s, (0.12 + w1) * s);
          }
        };
        if (g.get(x, y - 1) !== OPEN) wall(p10, p00, c10[1], c00[1], x * 2 + 1, y * 2);
        if (g.get(x + 1, y) !== OPEN) wall(p11, p10, c11[1], c10[1], x * 2 + 2, y * 2 + 1);
        if (g.get(x, y + 1) !== OPEN) wall(p01, p11, c01[1], c11[1], x * 2 + 1, y * 2 + 2);
        if (g.get(x - 1, y) !== OPEN) wall(p00, p01, c00[1], c01[1], x * 2, y * 2 + 1);
      }
    const old = this.chunks[ci];
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    if (!pos.length) {
      this.chunks[ci] = null;
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, this.material);
    m.receiveShadow = true;
    m.castShadow = true;
    this.group.add(m);
    this.chunks[ci] = m;
    this.rebuilds++;
  }
}
