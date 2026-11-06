import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { asciiLayout } from './helpers';
import { newItem } from '../src/sim/camp';
import { makeLight } from '../src/sim/light';
import { CELL } from '../src/config';

describe('ritual without help', () => {
  it('a hive player steering honestly (no will cheats) gets rebuilt', () => {
    const rows: string[] = [];
    for (let y = 0; y < 24; y++) rows.push('.'.repeat(70) + 'H'.repeat(20));
    const w = new World({ layout: asciiLayout(rows), bugs: 300 });
    const a = w.addPlayer('a', 6, 6), b = w.addPlayer('b', 7, 6);
    const orig = console.log;
    console.log = () => {};
    try {
      b.carrying = newItem('generator');
      b.x = 40 * CELL;
      b.z = 12 * CELL;
      b.yaw = Math.PI / 2;
      const gen = w.camp.place(b)!;
      w.staticLights.push(makeLight('lamp', { x: 52 * CELL, z: 12 * CELL, radius: 6, intensity: 1.3 }));
      b.slots[1] = newItem('spool');
      b.sel = 1;
      b.x = gen.x;
      b.z = gen.z;
      w.camp.startWire(b, gen);
      for (let k = 0; k < 60; k++) {
        b.x += 0.1;
        w.camp.payOut(b);
      }
      w.camp.dropWireEnd(b);
      b.x = gen.x - 2;
      a.x = 80 * CELL;
      a.z = 12 * CELL;
      w.death.devour(a);
      const target = { x: 50 * CELL, z: 12 * CELL };
      let t = 0, back = false;
      const trace: string[] = [];
      for (; t < 300 && !back; t += 1 / 20) {
        b.overwhelm = 0;
        const dx = target.x - a.hiveX, dz = target.z - a.hiveZ, l = Math.hypot(dx, dz);
        a.hiveMove = l < 0.4 ? [0, 0] : [dx / l, dz / l];
        w.step(1 / 20);
        back = !a.hive;
        if (Math.round(t * 20) % 200 === 0) trace.push(`t=${t.toFixed(0)} d=${l.toFixed(1)} will=${a.will.toFixed(2)} stage=${a.ritualStage} ritual=${a.ritual.toFixed(2)} members=${w.death.hiveTendrils.get('a')?.members} order="${a.order}" intent=${w.queen?.intent} dir=${w.director.state}`);
      }
      console.log = orig;
      console.log(trace.join('\n'));
      console.log(`back after ${t.toFixed(1)} s: ${back}`);
      expect(back).toBe(true);
    } finally {
      console.log = orig;
    }
  }, 300000);
});
