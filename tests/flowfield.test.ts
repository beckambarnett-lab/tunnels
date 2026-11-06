import { describe, it, expect } from 'vitest';
import { buildField } from '../src/sim/flowfield';
import { defaultParams } from '../src/sim/fieldManager';
import { asciiLayout } from './helpers';

function follow(next: Int32Array, from: number, n: number, max = 5000) {
  const path = [from];
  let c = from;
  for (let k = 0; k < max; k++) {
    const nx = next[c];
    if (nx < 0) break;
    path.push(nx);
    c = nx;
  }
  return path;
}

describe('flow field', () => {
  // two routes from A (left) to G (right): a short one through the middle and a long detour
  const rows = [
    '..........................',
    '.########################.',
    '.########################.',
    '..........................',
    '.########################.',
    '.########################.',
    '..........................',
  ];
  it('takes the short route when it is dark', () => {
    const L = asciiLayout(rows);
    const g = L.grid;
    const goal = g.idx(26, 4), from = g.idx(1, 4);
    const r = buildField({ w: g.w, h: g.h, cells: g.cells, burrow: g.burrow, light: new Float32Array(g.n), goals: [goal], params: defaultParams({ allowDig: false }) });
    const path = follow(r.next, from, g.n);
    expect(path[path.length - 1]).toBe(goal);
    expect(path.every((c) => ((c / g.w) | 0) === 4)).toBe(true);
  });
  it('routes around a lit stretch when a dark detour exists (light is a path cost)', () => {
    const L = asciiLayout(rows);
    const g = L.grid;
    const light = new Float32Array(g.n);
    for (let x = 8; x < 18; x++) light[g.idx(x, 4)] = 1; // light the middle corridor
    const goal = g.idx(26, 4), from = g.idx(1, 4);
    const r = buildField({ w: g.w, h: g.h, cells: g.cells, burrow: g.burrow, light, goals: [goal], params: defaultParams({ allowDig: false }) });
    const path = follow(r.next, from, g.n);
    expect(path[path.length - 1]).toBe(goal);
    expect(path.some((c) => light[c] > 0)).toBe(false);
  });
  it('digs through earth when that is far cheaper than walking round', () => {
    const L = asciiLayout([
      '.....#.....',
      '.....#.....',
      '.....#.....',
      '.....#.....',
      '.....#.....',
    ]);
    const g = L.grid;
    const goal = g.idx(10, 3), from = g.idx(2, 3);
    const r = buildField({ w: g.w, h: g.h, cells: g.cells, burrow: g.burrow, light: new Float32Array(g.n), goals: [goal], params: defaultParams() });
    const path = follow(r.next, from, g.n);
    expect(path[path.length - 1]).toBe(goal);
    expect(path.some((c) => g.cells[c] === 1)).toBe(true);
  });
  it('never goes through rock', () => {
    const L = asciiLayout(['...', '...']);
    const g = L.grid;
    const r = buildField({ w: g.w, h: g.h, cells: g.cells, burrow: g.burrow, light: new Float32Array(g.n), goals: [g.idx(1, 1)], params: defaultParams({ allowUnder: true }) });
    expect(r.dist[0]).toBe(Infinity);
    expect(r.dist[g.n]).toBe(Infinity);
  });
  it('the under layer reaches a goal sealed behind earth when walls may not be dug', () => {
    const L = asciiLayout(['...#...', '...#...', '...#...']);
    const g = L.grid;
    const goal = g.idx(6, 2), from = g.idx(1, 2);
    const r = buildField({ w: g.w, h: g.h, cells: g.cells, burrow: g.burrow, light: new Float32Array(g.n), goals: [goal], params: defaultParams({ allowDig: false, allowUnder: true }) });
    const path = follow(r.next, from, g.n);
    expect(path[path.length - 1]).toBe(goal);
    expect(path.some((c) => c >= g.n)).toBe(true);
  });
});
