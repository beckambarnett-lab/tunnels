import { describe, it, expect } from 'vitest';
import { LightMap, makeLight } from '../src/sim/light';
import { asciiLayout, room } from './helpers';
import { CELL } from '../src/config';

describe('light map', () => {
  it('walls block light', () => {
    const L = asciiLayout(['.....#.....', '.....#.....', '.....#.....']);
    const lm = new LightMap(L.grid);
    lm.rebuild([makeLight('lamp', { x: 2.5 * CELL, z: 2.5 * CELL, radius: 5 })]);
    expect(lm.raw[L.grid.idx(3, 2)]).toBeGreaterThan(0.3);
    expect(lm.raw[L.grid.idx(9, 2)]).toBe(0);
  });
  it('cones respect their angle and falloff is monotonic', () => {
    const L = asciiLayout(room(40, 21));
    const g = L.grid;
    const lm = new LightMap(g);
    lm.rebuild([makeLight('flashlight', { x: 2 * CELL, z: 11.5 * CELL, dirX: 1, dirZ: 0, radius: 15, cone: 0.4 })]);
    let prev = Infinity;
    for (let x = 4; x < 30; x++) {
      const v = lm.raw[g.idx(x, 11)];
      expect(v).toBeLessThanOrEqual(prev + 1e-6);
      prev = v;
    }
    expect(lm.raw[g.idx(12, 1)]).toBe(0); // well outside the cone
    expect(lm.raw[g.idx(1, 11)]).toBe(0); // behind the light
  });
  it('electric light is scaled by belief; fire is not', () => {
    const L = asciiLayout(room(20, 20));
    const lm = new LightMap(L.grid);
    lm.belief.lamp = 0.3;
    lm.rebuild([makeLight('lamp', { x: 5, z: 5, radius: 4 })]);
    const i = L.grid.cellAt(5.6, 5);
    expect(lm.eff[i]).toBeCloseTo(lm.raw[i] * 0.3, 5);
    lm.rebuild([makeLight('fire', { x: 5, z: 5, radius: 4 })]);
    expect(lm.eff[i]).toBeCloseTo(lm.raw[i], 5);
  });
});
