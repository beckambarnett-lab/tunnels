import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { makeTendril } from '../src/sim/tendril';
import { defaultParams } from '../src/sim/fieldManager';
import { asciiLayout, room } from './helpers';
import { CELL } from '../src/config';
import { BURN } from '../src/sim/swarm';

describe('fire', () => {
  it('a burning bug ignites a packed group (fire spreads)', () => {
    const w = new World({ layout: asciiLayout(room(40, 40)), noQueen: true, bugs: -1 });
    const t = makeTendril({ params: defaultParams(), mode: 'mass', fieldName: 'c', gx: 10, gz: 10, holdDist: 0 });
    t.goals = w.goalCellsAt(10, 10, 1);
    w.tendrils.set(t.id, t);
    for (let k = 0; k < 100; k++) w.swarm.spawn(9 + (k % 10) * 0.2, 9 + Math.floor(k / 10) * 0.2, t.id);
    for (let s = 0; s < 30; s++) w.step(1 / 60);
    w.swarm.ignite(0);
    let fireDeaths = 0;
    w.events.on('bugDeath', (e) => e.cause === 'fire' && fireDeaths++);
    for (let s = 0; s < 60 * 4; s++) w.step(1 / 60);
    console.log(`fire deaths from one ignition: ${fireDeaths}/100`);
    expect(fireDeaths).toBeGreaterThan(40);
  });

  it('a flamethrower burst kills bugs in front of it', () => {
    const w = new World({ layout: asciiLayout(room(40, 20)), noQueen: true, bugs: -1 });
    for (let k = 0; k < 40; k++) w.swarm.spawn(6 + (k % 5) * 0.25, 4.5 + Math.floor(k / 5) * 0.2);
    let fireDeaths = 0;
    w.events.on('bugDeath', (e) => e.cause === 'fire' && fireDeaths++);
    for (let s = 0; s < 60 * 3; s++) {
      if (s < 60) w.fire.emit(2, 1.2, 5, 1, 0, 0, 1 / 60);
      w.step(1 / 60);
    }
    expect(fireDeaths).toBeGreaterThan(20);
  });

  it('fire poured into a fresh hole collapses it', () => {
    const rows = ['..........', '..........', '#####.####', '#####.####', '#####.####'];
    const w = new World({ layout: asciiLayout(rows), noQueen: true, bugs: -1 });
    const hole = w.grid.idx(6, 3);
    // pretend the hive just dug it
    w.grid.cells[hole] = 1;
    w.grid.dig(hole, 0);
    let collapsed = false;
    w.events.on('collapse', () => (collapsed = true));
    for (let s = 0; s < 60 * 2; s++) {
      w.fire.emit(6.5 * CELL, 1, 1.5 * CELL, 0, -0.1, 1, 1 / 60);
      w.step(1 / 60);
    }
    expect(collapsed).toBe(true);
    expect(w.grid.cells[hole]).toBe(1);
  });
});

describe('flares', () => {
  it('a thrown flare is real fire for ~30 s: it lights, burns bugs that step on it, then goes out', async () => {
    const { newItem } = await import('../src/sim/camp');
    const { applyInput, emptyInput } = await import('../src/sim/actions');
    const w = new World({ layout: asciiLayout(room(40, 20)), noQueen: true, bugs: -1 });
    const p = w.addPlayer('p', 2, 5);
    p.yaw = Math.PI / 2;
    p.slots = [newItem('flare'), null, null];
    applyInput(w, p, { ...emptyInput(), usePressed: true, use: true }, 1 / 20);
    expect(p.slots[0]).toBeNull();
    expect(w.flares.length).toBe(1);
    const f = w.flares[0];
    const j = w.swarm.spawn(f.x, f.z);
    for (let s = 0; s < 40; s++) w.step(1 / 20);
    expect(w.light.fire[w.grid.cellAt(f.x + 1, f.z)]).toBeGreaterThan(0.2);
    expect(w.swarm.alive[j] === 0 || w.swarm.state[j] === BURN).toBe(true);
    for (let s = 0; s < 20 * 31; s++) w.step(1 / 20);
    expect(w.flares.length).toBe(0);
  });
});
