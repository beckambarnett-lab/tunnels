import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { makeSave, applySave } from '../src/net/save';
import { newItem } from '../src/sim/camp';

describe('save and load', () => {
  it('restores dug cells, camp, fuel, learning and director, and marks the run', () => {
    const a = new World({ seed: 6, bugs: 200 });
    const pristine = a.grid.cells.slice();
    const p = a.addPlayer('local', a.layout.start.x, a.layout.start.z);
    const orig = console.log;
    console.log = () => {};
    for (let t = 0; t < 5; t += 1 / 20) a.step(1 / 20);
    let dug = -1;
    for (let i = 0; i < a.grid.n && dug < 0; i++) if (a.grid.cells[i] === 1 && a.grid.isFace(i)) dug = i;
    a.grid.dig(dug, a.time);
    p.carrying = newItem('generator');
    a.camp.place(p);
    a.fuel.drain(321, 'test');
    a.learning.unlock('flank', 'test');
    a.director.act = 4;
    const save = JSON.parse(JSON.stringify(makeSave(a, pristine)));
    const b = new World({ seed: 6, bugs: 200 });
    b.addPlayer('local', b.layout.start.x, b.layout.start.z);
    applySave(b, save);
    console.log = orig;
    expect(b.grid.cells[dug]).toBe(0);
    expect(b.camp.devices.map((d) => d.kind)).toEqual(['generator']);
    expect(b.fuel.value).toBeCloseTo(a.fuel.value, 3);
    expect(b.learning.has('flank')).toBe(true);
    expect(b.director.act).toBe(4);
    expect(b.swarm.active).toBe(a.swarm.active);
    expect(b.usedSave).toBe(true);
  });
});
