import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { NightLayout } from '../src/sim/night';
import { newItem } from '../src/sim/camp';

describe('sim performance on the night map', () => {
  it('600 bugs in act 3 on the full night map', () => {
    const orig = console.log;
    console.log = () => {};
    const w = new World({ seed: 2, night: true, bugs: 600 });
    const L = w.layout as NightLayout;
    for (const i of L.plugCells) w.grid.cells[i] = 0;
    w.run!.act = 3;
    const rig = L.marks.find((m) => m.kind === 'rig')!;
    const p = w.addPlayer('p', rig.x, rig.z);
    p.slots = [newItem('flashlight'), null, null];
    for (let s = 0; s < 20 * 10; s++) w.step(1 / 20);
    const t0 = performance.now();
    for (let s = 0; s < 300; s++) {
      p.overwhelm = 0;
      w.step(1 / 60);
    }
    const ms = (performance.now() - t0) / 300;
    console.log = orig;
    console.log(`night map ${w.grid.w}x${w.grid.h} cells, ${w.swarm.active} bugs: ${ms.toFixed(2)} ms/step`);
    expect(ms).toBeLessThan(10);
  }, 120000);
});
