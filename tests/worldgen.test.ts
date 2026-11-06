import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/sim/worldgen';
import { OPEN, ROCK } from '../src/sim/grid';

function reachable(seed: number) {
  const L = generateWorld(seed);
  const g = L.grid;
  const start = g.cellAt(L.start.x, L.start.z);
  const seen = new Uint8Array(g.n);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % g.w, y = (i / g.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!g.inBounds(nx, ny)) continue;
      const j = g.idx(nx, ny);
      if (!seen[j] && g.cells[j] === OPEN) {
        seen[j] = 1;
        q.push(j);
      }
    }
  }
  let open = 0, reached = 0;
  for (let i = 0; i < g.n; i++) if (g.cells[i] === OPEN) {
    open++;
    if (seen[i]) reached++;
  }
  return { L, open, reached, hiveReached: seen[g.cellAt(L.hive.x, L.hive.z)] === 1 };
}

describe('worldgen', () => {
  it('same seed gives the same layout', () => {
    const a = generateWorld(7), b = generateWorld(7);
    expect(Buffer.from(a.grid.cells).equals(Buffer.from(b.grid.cells))).toBe(true);
  });
  it('different seeds differ', () => {
    expect(Buffer.from(generateWorld(1).grid.cells).equals(Buffer.from(generateWorld(2).grid.cells))).toBe(false);
  });
  for (const seed of [1, 2, 3, 4, 5, 11, 99]) {
    it(`seed ${seed}: the hive and nearly all open cells are reachable from the start`, () => {
      const r = reachable(seed);
      expect(r.hiveReached).toBe(true);
      expect(r.reached / r.open).toBeGreaterThan(0.97);
      expect(r.L.hiveCells.length).toBeGreaterThan(50);
    });
  }
  it('the border is rock', () => {
    const g = generateWorld(3).grid;
    for (let x = 0; x < g.w; x++) expect(g.get(x, 0)).toBe(ROCK);
  });
});
