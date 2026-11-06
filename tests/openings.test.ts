import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { asciiLayout } from './helpers';
import { makeLight } from '../src/sim/light';
import { newItem } from '../src/sim/camp';
import { CELL } from '../src/config';

/**
 * A camp as it really sits: the player beside their own lamp (east, toward the hive pocket), the
 * rest of the camp's lamps 6 m away, flashlight pointing west (away from the hive).
 */
function bubble(bugs = 300) {
  const rows: string[] = [];
  for (let y = 0; y < 40; y++) rows.push('.'.repeat(70) + 'H'.repeat(14));
  const w = new World({ layout: asciiLayout(rows), bugs });
  w.director.scripted = true; // hold Build Up: the hive may push whenever there is an opening
  w.director.act = 3;
  const p = w.addPlayer('p', 25 * CELL, 20 * CELL);
  p.yaw = -Math.PI / 2; // facing west, back to the hive
  p.slots[0] = newItem('flashlight');
  const lamps = [
    [1.5, 0], // the player's own lamp
    [-6, 0],
    [0, -6],
    [0, 6],
  ].map(([dx, dz]) => makeLight('lamp', { x: p.x + dx, z: p.z + dz, radius: 5, intensity: 1.2 }));
  w.staticLights.push(...lamps);
  const ev: { name: string; e: any; t: number }[] = [];
  for (const n of ['openingFound', 'openingSensed', 'openingClosed', 'strike']) w.events.on(n, (e) => ev.push({ name: n, e, t: w.time }));
  const orig = console.log;
  console.log = () => {};
  return { w, p, lamps, ev, restore: () => (console.log = orig) };
}
const run = (w: World, secs: number, each?: () => void) => {
  for (let t = 0; t < secs; t += 1 / 20) {
    each?.();
    w.step(1 / 20);
  }
};

describe('openings: the strike rule', () => {
  it('without an opening the swarm masses at the edge of the light and does not strike', () => {
    const { w, p, ev, restore } = bubble();
    try {
      w.queen!.force('reroute'); // a small digging party; the rest surround the bubble
      let maxTouch = 0, nearRing = 0;
      run(w, 35, () => {
        p.overwhelm = 0;
        maxTouch = Math.max(maxTouch, p.touching);
      });
      const sw = w.swarm;
      for (let j = 0; j < sw.count; j++) if (sw.alive[j] && Math.hypot(sw.x[j] - p.x, sw.z[j] - p.z) < 9) nearRing++;
      restore();
      console.log(`no opening: max touching ${maxTouch}, strikes ${ev.filter((x) => x.name === 'strike').length}, bugs within 9 m ${nearRing}`);
      expect(ev.filter((x) => x.name === 'strike').length).toBe(0);
      expect(maxTouch).toBe(0);
      expect(nearRing).toBeGreaterThan(60); // they came, and they wait
    } finally {
      restore();
    }
  }, 120000);

  it('a lamp dies: the hole is found, sensed and struck through, nearest tendrils first; relit, they fall back', () => {
    const { w, p, lamps, ev, restore } = bubble();
    try {
      w.queen!.force('reroute');
      run(w, 25, () => (p.overwhelm = 0));
      const t0 = w.time;
      lamps[0].on = false; // the player's own lamp, between them and the hive
      let firstTouch = -1;
      run(w, 8, () => {
        p.overwhelm = 0;
        if (firstTouch < 0 && p.touching > 0) firstTouch = w.time - t0;
      });
      const found = ev.find((x) => x.name === 'openingFound' && x.e.kind === 'lightDied');
      const strike = ev.find((x) => x.name === 'strike');
      const waves = [...w.tendrils.values()].filter((t) => t.strike).map((t) => t.strike!.at - t0);
      // relight: the opening closes and the strike ends
      lamps[0].on = true;
      let lastStrikeAt = -1;
      run(w, 8, () => {
        p.overwhelm = 0;
        if ([...w.tendrils.values()].some((t) => t.strike)) lastStrikeAt = w.time - t0 - 8;
      });
      let touch = 0;
      run(w, 3, () => {
        p.overwhelm = 0;
        touch = Math.max(touch, p.touching);
      });
      restore();
      console.log(`lamp dies: found after ${((found?.t ?? 99) - t0).toFixed(2)} s, strike after ${((strike?.t ?? 99) - t0).toFixed(2)} s, first touch after ${firstTouch.toFixed(2)} s, wave start offsets ${waves.map((x) => x.toFixed(2)).join(', ')}; strikes held until ${lastStrikeAt.toFixed(2)} s after relight; touching after: ${touch}`);
      expect(found).toBeTruthy();
      expect(found!.t - t0).toBeLessThan(0.5);
      expect(strike).toBeTruthy();
      expect(firstTouch).toBeGreaterThan(0);
      expect(firstTouch).toBeLessThan(6);
      expect(lastStrikeAt).toBeLessThan(3); // pressed on briefly, then let go
      expect(touch).toBe(0); // and they fell back out of the light
    } finally {
      restore();
    }
  }, 120000);

  it('the cause names the opening: a cut cable is a wireCut', () => {
    const { w, p, lamps, ev, restore } = bubble();
    try {
      // the player's own lamp is a device on a cable from the generator behind them
      lamps[0].on = false;
      w.staticLights.splice(0, 1);
      const px = p.x, pz = p.z;
      p.carrying = newItem('generator');
      p.x = px - 1.6;
      p.yaw = -Math.PI / 2;
      const gen = w.camp.place(p)!;
      p.x = px + 0.6;
      p.yaw = Math.PI / 2;
      p.slots[1] = newItem('lamp');
      p.sel = 1;
      const lamp = w.camp.place(p)!;
      p.slots[1] = newItem('spool');
      p.x = gen.x;
      p.z = gen.z;
      w.camp.startWire(p, gen);
      p.z = pz + 1;
      w.camp.payOut(p);
      p.x = lamp.x;
      w.camp.payOut(p);
      w.camp.connectWire(p, lamp);
      p.x = px;
      p.z = pz;
      p.yaw = -Math.PI / 2;
      run(w, 3);
      expect(lamp.powered).toBe(true);
      const wr = w.camp.wires[0];
      wr.cuts.add(1);
      w.events.emit('wireCut', { id: wr.id, seg: 1, x: wr.points[1].x, z: wr.points[1].z });
      run(w, 0.6);
      restore();
      const found = ev.filter((x) => x.name === 'openingFound').map((x) => x.e.kind);
      console.log(`cut cable: openings ${found.join(', ')}`);
      expect(found).toContain('wireCut');
    } finally {
      restore();
    }
  }, 60000);

  it('the flamethrower stopping after a burst is an opening; firing again closes it', () => {
    const { w, p, ev, restore } = bubble(0);
    try {
      p.slots[1] = newItem('flamethrower');
      run(w, 1.5, () => (p.firing = true));
      run(w, 0.5, () => (p.firing = false));
      const found = ev.find((x) => x.name === 'openingFound' && x.e.kind === 'fireStopped');
      run(w, 0.4, () => (p.firing = true));
      const closed = ev.find((x) => x.name === 'openingClosed' && x.e.kind === 'fireStopped');
      restore();
      expect(found).toBeTruthy();
      expect(closed).toBeTruthy();
    } finally {
      restore();
    }
  });

  it('no omniscience: an opening no bug can sense is never struck', () => {
    const { w, lamps, ev, restore } = bubble(-1); // no swarm at all
    try {
      run(w, 1);
      lamps[0].on = false;
      run(w, 2);
      restore();
      expect(ev.some((x) => x.name === 'openingFound')).toBe(true);
      expect(ev.some((x) => x.name === 'openingSensed')).toBe(false);
      expect(ev.some((x) => x.name === 'strike')).toBe(false);
      expect(w.queen!.openings.active().length).toBe(0);
    } finally {
      restore();
    }
  });

  it('the director decides when: during Relax an opening is noticed but not struck', () => {
    const { w, p, lamps, ev, restore } = bubble();
    try {
      w.queen!.force('reroute');
      run(w, 20, () => (p.overwhelm = 0));
      w.director.state = 'Relax';
      lamps[0].on = false;
      run(w, 4, () => (p.overwhelm = 0));
      restore();
      expect(ev.some((x) => x.name === 'openingSensed')).toBe(true);
      expect(ev.some((x) => x.name === 'strike')).toBe(false);
    } finally {
      restore();
    }
  }, 120000);

  it('standing against an unlit wall: the tendrils massed in the walls break through behind you', () => {
    // earth along the top; the player puts their back to it
    const rows: string[] = [];
    for (let y = 0; y < 40; y++) rows.push((y < 6 ? '#' : '.').repeat(70) + (y < 6 ? '#' : 'H').repeat(14));
    const w = new World({ layout: asciiLayout(rows), bugs: 300 });
    w.director.scripted = true;
    w.learning.unlock('flank', 'test');
    const p = w.addPlayer('p', 25 * CELL, 7.6 * CELL);
    p.yaw = 0; // facing +z (into the room): the wall is behind
    p.slots[0] = newItem('flashlight');
    w.staticLights.push(makeLight('lamp', { x: p.x, z: p.z + 2.5, radius: 3.6, intensity: 1.2 })); // lights the player, not the wall behind
    const ev: string[] = [];
    let breach = 0;
    w.events.on('strike', (e) => ev.push(e.kind));
    w.events.on('breach', () => breach++);
    const orig = console.log;
    console.log = () => {};
    let digs = 0, maxTouch = 0, strikeAt = -1;
    w.events.on('dig', () => digs++);
    w.events.on('strike', () => strikeAt < 0 && (strikeAt = w.time));
    try {
      w.queen!.force('flank');
      run(w, 60, () => {
        p.overwhelm = 0;
        maxTouch = Math.max(maxTouch, p.touching);
      });
    } finally {
      console.log = orig;
    }
    console.log(`unlit wall: strike at ${strikeAt.toFixed(1)} s, digs ${digs}, breaches ${breach}, max touching ${maxTouch}, strikes ${ev.join(', ')}`);
    expect(ev).toContain('unlitWall');
  }, 120000);

  it('a damaged generator sputters, and every sputter is an opening', () => {
    const { w, p, lamps, ev, restore } = bubble(0);
    try {
      for (const l of lamps) l.on = false;
      w.staticLights.length = 0;
      p.carrying = newItem('generator');
      const gen = w.camp.place(p)!;
      gen.hp = 0.3;
      p.slots[1] = newItem('lamp');
      p.sel = 1;
      p.yaw = -Math.PI / 2;
      const lamp = w.camp.place(p)!;
      p.slots[1] = newItem('spool');
      w.camp.startWire(p, gen);
      w.camp.connectWire(p, lamp);
      p.yaw = Math.PI / 2;
      let sputters = 0;
      w.events.on('sputter', () => sputters++);
      run(w, 20, () => (p.overwhelm = 0));
      restore();
      const kinds = ev.filter((x) => x.name === 'openingFound').map((x) => x.e.kind);
      console.log(`sputter: ${sputters} coughs, openings ${[...new Set(kinds)].join(', ')} (${kinds.length})`);
      expect(sputters).toBeGreaterThan(3);
      expect(kinds).toContain('flicker');
    } finally {
      restore();
    }
  }, 60000);

  it('what worked is remembered: openings that hurt someone push her toward the intents that make them', () => {
    const { w, restore } = bubble(0);
    try {
      w.learning.unlock('sabotage', 'test');
      const q = w.queen!;
      for (let k = 0; k < 3; k++) w.events.emit('openingClosed', { id: k, kind: 'wireCut', x: 10, z: 10, harm: 0.4, responders: 50 });
      expect(q.openingWins.wireCut).toBe(3);
      expect(q.influence.at(q.influence.memory, 10, 10)).toBeGreaterThan(2);
    } finally {
      restore();
    }
  });
});
