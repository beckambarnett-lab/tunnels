import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { asciiLayout, room } from './helpers';
import { newItem } from '../src/sim/camp';
import { makeLight } from '../src/sim/light';
import { CELL } from '../src/config';

function world(rows = room(80, 40)) {
  const w = new World({ layout: asciiLayout(rows), noQueen: true, bugs: -1 });
  const p = w.addPlayer('p', 10, 10);
  return { w, p };
}
/** a few bugs nearby so the hive can sense what happens (no omniscience) */
const witnesses = (w: World, x: number, z: number, n = 5) => {
  for (let k = 0; k < n; k++) w.swarm.spawn(x + 6 + k * 0.3, z);
};
const run = (w: World, secs: number, each?: () => void) => {
  for (let t = 0; t < secs; t += 1 / 20) {
    each?.();
    w.step(1 / 20);
    w.learning.step(1 / 20);
  }
};

describe('learning tree: player habits unlock counters', () => {
  it('bugs touching electric light without burning -> Testing the light, and belief drops', () => {
    const { w } = world();
    w.staticLights.push(makeLight('lamp', { x: 20, z: 10, radius: 5 }));
    for (let k = 0; k < 60; k++) w.swarm.spawn(20 + (k % 10) * 0.1 - 0.5, 10 + Math.floor(k / 10) * 0.1);
    run(w, 70, () => {
      // shove them into the light (as probing scouts would)
      for (let k = 0; k < 10; k++) {
        w.swarm.x[k] = 20.6;
        w.swarm.z[k] = 10;
      }
    });
    expect(w.learning.has('testLight')).toBe(true);
    expect(w.light.belief.lamp).toBeLessThan(0.6);
    expect(w.light.belief.lamp).toBeGreaterThanOrEqual(0.1);
  });

  it('camping in the same kind of spot twice -> Flanking', () => {
    const { w, p } = world();
    witnesses(w, p.x, p.z);
    w.step(1 / 20);
    p.carrying = newItem('generator');
    w.camp.place(p);
    p.x = 30;
    p.carrying = newItem('generator');
    w.camp.place(p);
    run(w, 0.2);
    expect(w.learning.has('flank')).toBe(true);
  });

  it('keeping your back to a wall -> Breaching that wall', () => {
    const rows = room(40, 20);
    const { w, p } = world(rows);
    p.x = 6;
    p.z = 0.5 * CELL + 1 * CELL + 0.2; // right against the top wall
    p.yaw = 0; // facing +z, wall behind
    witnesses(w, p.x, p.z);
    run(w, 30, () => (w.swarm.x[0] = p.x + 6));
    expect(w.learning.has('breach')).toBe(true);
    expect(w.learning.lastWall).not.toBeNull();
  });

  it('long cable runs -> Sabotage of cables, then cuts -> the generator', () => {
    const { w, p } = world();
    witnesses(w, p.x, p.z);
    w.step(1 / 20);
    p.carrying = newItem('generator');
    const gen = w.camp.place(p)!;
    p.slots[0] = newItem('spool');
    p.sel = 0;
    w.camp.startWire(p, gen);
    for (let k = 0; k < 130; k++) {
      p.x += 0.1;
      w.camp.payOut(p);
    }
    p.slots[0] = newItem('spool');
    w.camp.dropWireEnd(p);
    const p2 = w.addPlayer('p2', gen.x, gen.z + 1);
    p2.slots[0] = newItem('spool');
    w.camp.startWire(p2, gen);
    for (let k = 0; k < 130; k++) {
      p2.z += 0.1;
      w.camp.payOut(p2);
    }
    run(w, 0.2);
    expect(w.learning.has('sabotage')).toBe(true);
    for (let k = 0; k < 3; k++) w.events.emit('wireCut', { id: 0, seg: 0, x: 0, z: 0 });
    run(w, 0.2);
    expect(w.learning.has('sabotageGenerator')).toBe(true);
  });

  it('heavy flamethrower use -> Spreading out and Baiting', () => {
    const { w, p } = world();
    witnesses(w, p.x, p.z);
    run(w, 22, () => (p.firing = true));
    expect(w.learning.has('spreadOut')).toBe(true);
    expect(w.learning.has('bait')).toBe(true);
  });

  it('harvesting bodies -> Dragging the dead', () => {
    const { w, p } = world();
    witnesses(w, p.x, p.z);
    w.step(1 / 20);
    for (let k = 0; k < 12; k++) w.camp.bodies.push({ x: p.x + 0.3, z: p.z });
    w.camp.collectBodies(p);
    run(w, 0.2);
    expect(w.learning.has('dragDead')).toBe(true);
  });

  it('motion lamps -> Triggering them from range', () => {
    const { w, p } = world();
    witnesses(w, p.x, p.z);
    w.step(1 / 20);
    for (let k = 0; k < 9; k++) w.events.emit('motionOn', { id: 1, x: p.x, z: p.z });
    run(w, 0.2);
    expect(w.learning.has('triggerMotion')).toBe(true);
  });

  it('fuel running low -> Dark rush', () => {
    const { w } = world();
    w.fuel.drain(1100, 'test');
    run(w, 0.2);
    expect(w.learning.has('darkRush')).toBe(true);
  });
});

describe('learning fairness', () => {
  it('the hive cannot learn what its bugs did not sense (no omniscience)', () => {
    const { w, p } = world();
    // no bugs anywhere near: an hour of flamethrower would teach nothing (we check 25 s)
    run(w, 25, () => (p.firing = true));
    expect(w.learning.has('spreadOut')).toBe(false);
  });
  it('nothing unlocks from a player dying', () => {
    const { w, p } = world();
    witnesses(w, p.x, p.z);
    p.downed = true;
    run(w, 25, () => (p.firing = true));
    expect(w.learning.has('spreadOut')).toBe(false);
  });
  it('time-based fallbacks keep pace with strong teams', () => {
    const { w } = world();
    w.time = 60 * 12.5;
    run(w, 0.1);
    expect(w.learning.has('testLight')).toBe(true);
    expect(w.learning.has('spreadOut')).toBe(true);
    expect(w.learning.log.find((l) => l.unlock === 'testLight')!.why).toBe('time fallback');
  });
});
