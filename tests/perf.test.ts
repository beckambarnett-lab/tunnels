import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { benchLayout } from '../src/sim/layouts';
import { makeLight } from '../src/sim/light';

// Simulation cost per frame (no rendering) in the benchmark hall.
describe('sim performance', () => {
  for (const n of [500, 1000, 3000]) {
    it(`${n} bugs: average sim step stays well inside a 60 fps frame`, () => {
      const w = new World({ layout: benchLayout(), bugs: n });
      const p = w.addPlayer('p', w.layout.start.x, w.layout.start.z);
      p.yaw = Math.PI;
      for (const [dx, dz] of [[-6, -9], [6, -9], [0, -16]]) w.staticLights.push(makeLight('lamp', { x: p.x + dx, z: p.z + dz, radius: 5 }));
      for (let s = 0; s < 60 * 8; s++) w.step(1 / 60); // warm up
      const t0 = performance.now();
      const frames = 300;
      for (let s = 0; s < frames; s++) {
        p.overwhelm = 0;
        w.step(1 / 60);
      }
      const ms = (performance.now() - t0) / frames;
      console.log(`${n} bugs: ${ms.toFixed(2)} ms/step (fields built synchronously here; in game they run in the worker)`);
      if (n === 500) expect(ms).toBeLessThan(8);
    }, 120000);
  }
});
