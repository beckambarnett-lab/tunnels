import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { newItem } from '../src/sim/camp';

describe('carry in the real nest', () => {
  it('a player downed in the dark is carried to the queen within about a minute', () => {
    const w = new World({ seed: 3, bugs: 500 });
    const host = w.addPlayer('host', w.layout.start.x, w.layout.start.z);
    host.slots = [newItem('flashlight'), null, null];
    const p = w.addPlayer('c', w.layout.start.x, w.layout.start.z);
    const orig = console.log;
    console.log = () => {};
    try {
      for (let t = 0; t < 10; t += 1 / 20) w.step(1 / 20);
      // the darkest far spot, as the browser gate picks it
      let spot: any = null, best = -1;
      for (let i = 0; i < w.grid.n; i += 3) {
        if (w.grid.cells[i] !== 0 || w.light.rawAt(w.grid.centerX(i), w.grid.centerZ(i)) > 0.02) continue;
        const x = w.grid.centerX(i), z = w.grid.centerZ(i);
        const d = Math.hypot(x - host.x, z - host.z), dh = Math.hypot(x - w.layout.hive.x, z - w.layout.hive.z);
        const score = Math.min(d, 25) + Math.min(dh, 15);
        if (d > 8 && dh > 8 && score > best) (best = score), (spot = { x, z });
      }
      p.x = spot.x;
      p.z = spot.z;
      p.downed = true;
      p.overwhelm = 1;
      let t = 0;
      const trace: string[] = [];
      for (; t < 150 && !p.hive; t += 1 / 20) {
        host.overwhelm = 0;
        w.step(1 / 20);
        if (Math.round(t * 20) % 100 === 0) {
          const ct = [...w.tendrils.values()].find((x) => x.carryTarget === 'c');
          let near = 0;
          w.swarm.hash.forEachNear(p.x, p.z, 1.3, (j) => void (w.swarm.alive[j] && near++));
          trace.push(`t=${t.toFixed(0)} carriedT=${p.carriedT.toFixed(1)} near=${near} carrier=${ct ? ct.members + ' ' + ct.mode : 'none'} dir=${w.director.state} intent=${w.queen!.intent} light=${w.light.rawAt(p.x, p.z).toFixed(2)}`);
        }
      }
      console.log = orig;
      console.log(trace.join('\n'));
      console.log(`devoured after ${t.toFixed(1)} s: ${p.hive}`);
      expect(p.hive).toBe(true);
      expect(t).toBeLessThan(80);
    } finally {
      console.log = orig;
    }
  }, 300000);
});
