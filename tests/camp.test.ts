import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { asciiLayout, room } from './helpers';
import { newItem } from '../src/sim/camp';
import { applyInput, emptyInput, PlayerInput } from '../src/sim/actions';
import { FUEL, CAMP } from '../src/config';

function setup() {
  const w = new World({ layout: asciiLayout(room(80, 30)), noQueen: true, bugs: -1 });
  const p = w.addPlayer('p', 3, 7.5);
  p.yaw = Math.PI / 2; // facing +x
  return { w, p };
}
const at = (p: any, x: number, z: number) => ((p.x = x), (p.z = z));
const placeHeld = (w: World, p: any, kind: any) => {
  p.slots[p.sel] = newItem(kind);
  return w.camp.place(p)!;
};
const step = (w: World, secs: number, dt = 1 / 30) => {
  for (let t = 0; t < secs; t += dt) w.step(dt);
};
const inp = (o: Partial<PlayerInput>): PlayerInput => ({ ...emptyInput(), ...o });

describe('fuel', () => {
  it('starts at 1,500 and drains per the GDD table', () => {
    const { w, p } = setup();
    expect(w.fuel.value).toBe(FUEL.start);
    const gen = placeHeld(w, p, 'generator');
    at(p, 6, 7.5);
    const l1 = placeHeld(w, p, 'lamp');
    at(p, 9, 7.5);
    const l2 = placeHeld(w, p, 'lamp');
    at(p, 12, 7.5);
    const fl = placeHeld(w, p, 'floodlight');
    // wire them in a chain: gen -> l1 -> l2 -> fl
    for (const [a, b] of [[gen, l1], [l1, l2], [l2, fl]]) {
      at(p, a.x, a.z);
      p.slots[p.sel] = newItem('spool');
      expect(w.camp.startWire(p, a)).toBe(true);
      at(p, b.x, b.z);
      w.camp.payOut(p);
      expect(w.camp.connectWire(p, b)).toBe(true);
    }
    w.camp.computePower();
    expect([gen, l1, l2, fl].every((d) => d.powered)).toBe(true);
    const before = w.fuel.value;
    step(w, 600, 1 / 20); // 10 minutes
    const spent = before - w.fuel.value;
    const expected = 10 * (FUEL.generatorPerMin + 2 * FUEL.lampPerMin + FUEL.floodlightPerMin);
    expect(spent).toBeCloseTo(expected, 0);
    expect(w.fuel.spent.generator).toBeCloseTo(10, 0);
    expect(w.fuel.spent.floodlight).toBeCloseTo(20, 0);
  }, 60000);
  it('the flamethrower burns 6 per second of firing', () => {
    const { w, p } = setup();
    p.slots[0] = newItem('flamethrower');
    const before = w.fuel.value;
    for (let k = 0; k < 60; k++) {
      applyInput(w, p, inp({ use: true, aim: [1, 0, 0], eye: [p.x, 1.6, p.z] }), 1 / 30);
      w.step(1 / 30);
    }
    expect(before - w.fuel.value).toBeCloseTo(12, 1);
  });
  it('running out of fuel ends the run and cuts all power', () => {
    const { w, p } = setup();
    const gen = placeHeld(w, p, 'generator');
    let out = false;
    w.events.on('fuelOut', () => (out = true));
    w.fuel.drain(FUEL.start - 0.01, 'test');
    step(w, 2);
    expect(out).toBe(true);
    expect(w.runState).toBe('failed');
    expect(w.failReason).toContain('fuel');
    w.camp.computePower();
    expect(gen.powered).toBe(false);
  });
});

describe('wires', () => {
  function chain() {
    const { w, p } = setup();
    const gen = placeHeld(w, p, 'generator');
    at(p, 8, 7.5);
    const a = placeHeld(w, p, 'lamp');
    at(p, 14, 7.5);
    const b = placeHeld(w, p, 'lamp');
    const wire = (x: any, y: any) => {
      at(p, x.x, x.z);
      p.slots[p.sel] = newItem('spool');
      w.camp.startWire(p, x);
      for (let s = 0; s <= 20; s++) {
        at(p, x.x + ((y.x - x.x) * s) / 20, x.z + ((y.z - x.z) * s) / 20);
        w.camp.payOut(p);
      }
      w.camp.connectWire(p, y);
      return w.camp.wires[w.camp.wires.length - 1];
    };
    const w1 = wire(gen, a), w2 = wire(a, b);
    return { w, p, gen, a, b, w1, w2 };
  }
  it('connect powers the chain; a cut kills everything downstream; repair restores it', () => {
    const { w, p, a, b, w2 } = chain();
    w.camp.computePower();
    expect(a.powered && b.powered).toBe(true);
    w2.cuts.add(2);
    w.camp.computePower();
    expect(a.powered).toBe(true);
    expect(b.powered).toBe(false);
    const m = w2.points[2];
    at(p, m.x, m.z);
    for (let k = 0; k < 60; k++) w.camp.repair(p, 1 / 30);
    w.camp.computePower();
    expect(w2.cuts.size).toBe(0);
    expect(b.powered).toBe(true);
  });
  it('cable pays out behind you, the spool tethers you at 15 m, and alternating LMB/RMB reels it in', () => {
    const { w, p } = setup();
    const gen = placeHeld(w, p, 'generator');
    p.slots[p.sel] = newItem('spool');
    w.camp.startWire(p, gen);
    for (let k = 0; k < 400; k++) {
      p.x += 0.1; // walk 40 m
      w.camp.payOut(p);
    }
    const wr = w.camp.wires[0];
    expect(w.camp.wireLength(wr, p)).toBeLessThanOrEqual(CAMP.spoolLength + 0.05);
    expect(p.x - gen.x).toBeLessThan(15.2);
    const n0 = wr.points.length;
    w.camp.crank(p, 'L');
    w.camp.crank(p, 'L'); // no alternation: no wind
    expect(wr.points.length).toBe(n0 - 1);
    w.camp.crank(p, 'R');
    w.camp.crank(p, 'L');
    expect(wr.points.length).toBe(n0 - 3);
  });
  it('bugs in the dark chew through cable; in light they do not', () => {
    const { w, w2, b } = chain();
    const m = w2.points[3];
    for (let k = 0; k < 6; k++) w.swarm.spawn(m.x + (k % 3) * 0.1, m.z + Math.floor(k / 3) * 0.1);
    let cut = false;
    w.events.on('wireCut', () => (cut = true));
    // the lamps light the wire near them; switch everything off so the cable is dark
    for (const d of w.camp.devices) if (d.kind === 'generator') d.running = false;
    step(w, 3);
    expect(cut).toBe(true);
    for (const d of w.camp.devices) if (d.kind === 'generator') d.running = true;
    w.camp.computePower();
    expect(b.powered).toBe(false);
  });
  it('a lit stretch of cable is not chewed', () => {
    const { w, w1 } = chain();
    const m = w1.points[w1.points.length - 2]; // right next to a powered lamp
    for (let k = 0; k < 6; k++) w.swarm.spawn(m.x + (k % 3) * 0.05, m.z + Math.floor(k / 3) * 0.05);
    let cut = false;
    w.events.on('wireCut', () => (cut = true));
    for (let t = 0; t < 1.5; t += 1 / 30) {
      w.step(1 / 30);
      // hold the bugs in place (they would flee the light)
      for (let k = 0; k < 6; k++) {
        w.swarm.x[k] = m.x;
        w.swarm.z[k] = m.z;
      }
    }
    expect(cut).toBe(false);
  });
});

describe('camp setup, packing and moving', () => {
  it('the generator needs all three slots empty and fills them while carried', () => {
    const { w, p } = setup();
    w.camp.drop('generator', p.x + 1, p.z);
    p.slots[0] = newItem('flashlight');
    const fi = w.camp.floor[0];
    expect(w.camp.pickUpFloor(p, fi)).toBe(false);
    p.slots[0] = null;
    expect(w.camp.pickUpFloor(p, fi)).toBe(true);
    expect(w.camp.freeSlot(p)).toBe(-1);
  });
  it('set up -> pack up -> move -> set up again works through player inputs', () => {
    const { w, p } = setup();
    // set up: place generator, a lamp, cable between them
    p.carrying = newItem('generator');
    applyInput(w, p, inp({ altPressed: true }), 1 / 30);
    const gen = w.camp.devices.find((d) => d.kind === 'generator')!;
    expect(gen).toBeTruthy();
    p.slots[0] = newItem('lamp');
    p.sel = 0;
    at(p, 9, 7.5);
    applyInput(w, p, inp({ altPressed: true }), 1 / 30);
    const lamp = w.camp.devices.find((d) => d.kind === 'lamp')!;
    p.slots[0] = newItem('spool');
    at(p, gen.x - 0.8, gen.z);
    applyInput(w, p, inp({ interactPressed: true, interact: true }), 1 / 30);
    expect(p.layingWire).not.toBeNull();
    for (let x = gen.x; x < lamp.x - 0.8; x += 0.1) {
      at(p, x, 7.5);
      w.step(1 / 30);
    }
    applyInput(w, p, inp({ interactPressed: true, interact: true }), 1 / 30);
    expect(p.layingWire).toBeNull();
    w.step(1 / 30);
    expect(lamp.powered).toBe(true);
    expect(lamp.light!.on).toBe(true);
    // pack up: the lamp goes into a slot, the cable coils, the generator is lifted (hold E)
    applyInput(w, p, inp({ interactPressed: true, interact: true }), 1 / 30);
    expect(w.camp.devices.includes(lamp)).toBe(false);
    expect(p.slots.some((s) => s?.kind === 'lamp')).toBe(true);
    const wr = w.camp.wires[0];
    const mid = wr.points[3];
    at(p, mid.x - 0.5, mid.z);
    applyInput(w, p, inp({ interactPressed: true, interact: true }), 1 / 30);
    expect(w.camp.wires.length).toBe(0);
    expect(p.slots.some((s) => s?.kind === 'spool')).toBe(true);
    // empty hands to lift the generator
    p.slots = [null, null, null];
    at(p, gen.x - 0.8, gen.z);
    applyInput(w, p, inp({ interactPressed: true, interact: true }), 1 / 30);
    for (let k = 0; k < 20; k++) applyInput(w, p, inp({ interact: true }), 1 / 30);
    expect(p.carrying?.kind).toBe('generator');
    expect(w.camp.devices.length).toBe(0);
    // move 20 m and set up again
    at(p, 30, 7.5);
    applyInput(w, p, inp({ altPressed: true }), 1 / 30);
    const gen2 = w.camp.devices.find((d) => d.kind === 'generator')!;
    expect(gen2.x).toBeGreaterThan(29);
    p.slots[0] = newItem('lamp');
    p.sel = 0;
    at(p, 34, 7.5);
    applyInput(w, p, inp({ altPressed: true }), 1 / 30);
    const lamp2 = w.camp.devices.find((d) => d.kind === 'lamp')!;
    p.slots[0] = newItem('spool');
    p.sel = 0;
    at(p, gen2.x - 0.8, 7.5);
    applyInput(w, p, inp({ interactPressed: true, interact: true }), 1 / 30);
    for (let x = gen2.x; x < lamp2.x - 0.8; x += 0.1) {
      at(p, x, 7.5);
      w.step(1 / 30);
    }
    applyInput(w, p, inp({ interactPressed: true, interact: true }), 1 / 30);
    w.step(1 / 30);
    expect(lamp2.powered).toBe(true);
  });
});

describe('hive oil', () => {
  it('zap kills leave bodies worth 2 fuel each; fire kills leave nothing', () => {
    const { w, p } = setup();
    for (let k = 0; k < 3; k++) w.swarm.spawn(p.x + 1 + k * 0.2, p.z);
    p.slots[0] = newItem('zapper');
    w.step(1 / 60);
    const f0 = w.fuel.value;
    applyInput(w, p, inp({ usePressed: true, use: true }), 1 / 30);
    expect(w.camp.bodies.length).toBe(3);
    expect(f0 - w.fuel.value).toBeCloseTo(3 * CAMP.zapperFuelPerKill, 5);
    const f1 = w.fuel.value;
    expect(w.camp.collectBodies(p)).toBe(3);
    expect(w.fuel.value - f1).toBeCloseTo(3 * FUEL.oilPerBody, 5);
    // net: harvesting returns less than it cost
    expect(w.fuel.value).toBeLessThan(f0);
    const i = w.swarm.spawn(p.x + 1, p.z);
    w.swarm.ignite(i);
    step(w, 2);
    expect(w.camp.bodies.length).toBe(0);
  });
  it('stomping harvests a body for free', () => {
    const { w, p } = setup();
    w.swarm.spawn(p.x + 0.5, p.z);
    w.step(1 / 60);
    applyInput(w, p, inp({ stomp: true }), 1 / 30);
    expect(w.camp.bodies.length).toBe(1);
  });
  it('flashlight battery drains while lit and recharges at a running generator for 3 fuel', () => {
    const { w, p } = setup();
    const gen = placeHeld(w, p, 'generator');
    p.slots[0] = newItem('flashlight');
    p.sel = 0;
    for (let k = 0; k < 120 * 30; k++) applyInput(w, p, inp({}), 1 / 30);
    expect(p.slots[0]!.battery).toBeLessThan(CAMP.flashlightBattery - 100);
    const before = w.fuel.value;
    p.slots[0]!.battery = 0;
    expect(w.camp.recharge(p, gen)).toBe(true);
    expect(before - w.fuel.value).toBeCloseTo(FUEL.flashlightRecharge, 5);
  });
});
