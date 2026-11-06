import { CELL, VIS } from '../config';
import { Grid, OPEN } from './grid';

export interface Viewer {
  x: number;
  z: number;
  yaw: number; // radians; forward = (sin(yaw), cos(yaw)) in x/z — see player.ts
}

/**
 * Which cells any player can currently see (grid ray casts inside each player's view cone,
 * plus a small "felt" radius around them). The breach rule forbids opening a wall face or
 * erupting through the floor at any seen cell (GDD director lever: breaches only out of view).
 */
export class Visibility {
  seen: Uint8Array;
  constructor(public grid: Grid) {
    this.seen = new Uint8Array(grid.n);
  }
  update(viewers: Viewer[]) {
    const g = this.grid;
    this.seen.fill(0);
    const near = VIS.nearRadius / CELL;
    const range = VIS.range / CELL;
    const half = ((VIS.fovDeg / 2) * Math.PI) / 180;
    for (const v of viewers) {
      const cx = v.x / CELL, cz = v.z / CELL;
      // felt radius
      for (let dz = -Math.ceil(near); dz <= Math.ceil(near); dz++)
        for (let dx = -Math.ceil(near); dx <= Math.ceil(near); dx++) {
          if (dx * dx + dz * dz > near * near) continue;
          const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz;
          if (g.inBounds(x, z)) this.mark(z * g.w + x);
        }
      for (let r = 0; r < VIS.rays; r++) {
        const a = v.yaw - half + (2 * half * r) / (VIS.rays - 1);
        const dx = Math.sin(a), dz = Math.cos(a);
        let x = cx, z = cz;
        for (let s = 0; s < range * 2; s++) {
          x += dx * 0.5;
          z += dz * 0.5;
          const ix = Math.floor(x), iz = Math.floor(z);
          if (!g.inBounds(ix, iz)) break;
          const i = iz * g.w + ix;
          this.mark(i);
          if (g.cells[i] !== OPEN) break;
        }
      }
    }
  }
  private mark(i: number) {
    this.seen[i] = 1;
    this.grid.explored[i] = 1;
  }
  isSeen(i: number) {
    return this.seen[i] === 1;
  }
}
