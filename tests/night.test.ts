import { describe, it, expect } from 'vitest';
import { generateNight, Z } from '../src/sim/night';
import { OPEN } from '../src/sim/grid';

function reach(L: ReturnType<typeof generateNight>) {
  const g = L.grid;
  const s = g.cellAt(L.start.x, L.start.z);
  const seen = new Uint8Array(g.n);
  const q = [s];
  seen[s] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % g.w, y = (i / g.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!g.inBounds(x + dx, y + dy)) continue;
      const j = g.idx(x + dx, y + dy);
      if (!seen[j] && g.cells[j] === OPEN) (seen[j] = 1), q.push(j);
    }
  }
  return (x: number, z: number) => {
    const c = g.cellAt(x, z);
    // a mark may sit next to a wall: accept any open neighbour
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (seen[c + dz * g.w + dx]) return true;
    return false;
  };
}

describe('the night layout', () => {
  for (const seed of [1, 2, 3, 7]) {
    it(`seed ${seed}: the house is sealed until the basement opens, then every set piece is reachable`, () => {
      const L = generateNight(seed);
      const queen = L.marks.find((m) => m.kind === 'queen')!;
      expect(reach(L)(queen.x, queen.z)).toBe(false);
      for (const i of L.plugCells) L.grid.cells[i] = OPEN;
      const r = reach(L);
      for (const k of ['flashlights', 'tank', 'rig', 'suit', 'egg', 'queen', 'truck']) {
        const ms = L.marks.filter((m) => m.kind === k);
        expect(ms.length, k).toBeGreaterThan(0);
        for (const m of ms) expect(r(m.x, m.z), `${k} at ${m.x.toFixed(1)},${m.z.toFixed(1)}`).toBe(true);
      }
      expect(L.pockets.length).toBeGreaterThan(2);
      const zones = new Set(L.zone);
      for (const z of [Z.house, Z.base, Z.intersection, Z.rig, Z.junkyard, Z.queen]) expect(zones.has(z)).toBe(true);
    });
  }
});
