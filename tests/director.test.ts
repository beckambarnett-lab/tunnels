import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { generateWorld } from '../src/sim/worldgen';
import { newItem } from '../src/sim/camp';

describe('Hive Director', () => {
  it('cycles Build Up -> Sustain Peak -> Peak Fade -> Relax -> Build Up, and logs it', () => {
    const w = new World({ layout: generateWorld(3), bugs: 400 });
    w.director.act = 4; // short relax (15 s) keeps the test quick
    const p = w.addPlayer('p', w.layout.start.x, w.layout.start.z);
    p.slots[0] = newItem('flashlight');
    const states: string[] = [];
    w.events.on('directorState', (e) => states.push(e.state));
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: any[]) => (String(a[0]).startsWith('[director') ? logs.push(String(a[0])) : void 0);
    try {
      for (let t = 0; t < 240 && states.filter((s) => s === 'Build Up').length < 1; t += 1 / 20) {
        // a player who keeps getting overwhelmed and respawning drives intensity up
        p.yaw += 0.02;
        w.step(1 / 20);
      }
    } finally {
      console.log = orig;
    }
    console.log(states.join(' -> '));
    for (const l of logs) console.log(l);
    const seq = ['Sustain Peak', 'Peak Fade', 'Relax', 'Build Up'];
    let k = 0;
    for (const s of states) if (s === seq[k]) k++;
    expect(k).toBe(4);
    expect(logs.length).toBeGreaterThanOrEqual(4);
  }, 120000);

  it('Relax forbids breaches and pulls the swarm back; Peak Fade launches nothing new', () => {
    const w = new World({ layout: generateWorld(3), bugs: 200 });
    w.addPlayer('p', w.layout.start.x, w.layout.start.z);
    (w.director as any).set('Relax', 'test');
    w.step(1 / 20);
    w.director.step(0);
    expect(w.breachAllowed).toBe(false);
    expect(w.director.budget).toBe(0);
    w.queen!.thinkTimer = 0;
    w.step(1 / 20);
    expect(w.queen!.intent).toBe('retreat');
    (w.director as any).set('Peak Fade', 'test');
    expect(w.director.allowNewTendrils).toBe(false);
  });
});
