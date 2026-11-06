import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { asciiLayout } from './helpers';
import { newItem } from '../src/sim/camp';
import { applyInput, emptyInput } from '../src/sim/actions';
import { makeLight } from '../src/sim/light';
import { CELL, FUEL } from '../src/config';

/** A long hall: the camp at the left, the queen's hive at the right end. */
function hall(players = 2) {
  const rows: string[] = [];
  for (let y = 0; y < 24; y++) rows.push('.'.repeat(70) + 'H'.repeat(20));
  const w = new World({ layout: asciiLayout(rows), bugs: 300 });
  w.director.scripted = true;
  const ps = [];
  for (let k = 0; k < players; k++) {
    const p = w.addPlayer('p' + k, 6 + k * 1.2, 6);
    p.slots = [newItem('flashlight'), null, null];
    ps.push(p);
  }
  const quiet = () => {
    console.log = () => {};
  };
  const orig = console.log;
  quiet();
  return { w, ps, restore: () => (console.log = orig) };
}
const run = (w: World, secs: number, each?: () => void) => {
  for (let t = 0; t < secs; t += 1 / 20) {
    each?.();
    w.step(1 / 20);
  }
};

describe('death, the hive and respawn', () => {
  it('an overwhelmed player is carried toward the queen and devoured', () => {
    const { w, ps, restore } = hall(2);
    try {
      const [a, b] = ps;
      a.overwhelm = 1;
      a.downed = true;
      b.x = 2; // teammate stays away and does nothing
      let carried = false, devoured = false;
      w.events.on('carried', () => (carried = true));
      w.events.on('devoured', () => (devoured = true));
      run(w, 2);
      expect(a.downed).toBe(true);
      const x0 = a.x;
      run(w, 70, () => (b.overwhelm = 0));
      expect(carried).toBe(true);
      expect(devoured).toBe(true);
      expect(a.hive).toBe(true);
      expect(a.x).toBeGreaterThan(x0);
    } finally {
      restore();
    }
  }, 120000);

  it('a teammate holding E revives a downed player', () => {
    const { w, ps, restore } = hall(2);
    try {
      const [a, b] = ps;
      a.downed = true;
      a.overwhelm = 1;
      b.x = a.x - 0.8;
      b.z = a.z;
      b.yaw = Math.PI / 2;
      let revived = false;
      w.events.on('revived', () => (revived = true));
      run(w, 4, () => {
        b.overwhelm = 0;
        b.x = a.x - 0.8;
        b.z = a.z;
        applyInput(w, b, { ...emptyInput(), interact: true }, 1 / 20);
      });
      expect(revived).toBe(true);
      expect(a.downed).toBe(false);
    } finally {
      restore();
    }
  }, 60000);

  function devouredInHive() {
    const env = hall(2);
    const [a] = env.ps;
    a.x = 80 * CELL;
    a.z = 12 * CELL;
    env.w.death.devour(a);
    return env;
  }

  it('in the hive you steer a group of bugs; resisting the queen drains your will', () => {
    const { w, ps, restore } = devouredInHive();
    try {
      const a = ps[0];
      run(w, 4);
      const t = w.death.hiveTendrils.get(a.id)!;
      expect(t.members).toBeGreaterThanOrEqual(55);
      expect(a.order.length).toBeGreaterThan(0);
      // push hard away from the order
      const startX = a.hiveX;
      run(w, 6, () => {
        const o = w.death.orders.get(a.id)!;
        const ox = o.x - a.hiveX, oz = o.z - a.hiveZ, l = Math.hypot(ox, oz) || 1;
        a.hiveMove = [-ox / l, -oz / l];
      });
      expect(a.will).toBeLessThan(0.6);
      void startX;
    } finally {
      restore();
    }
  }, 60000);

  it('the ritual: a body of 60 bugs forced into the light and shocked by a live wire returns the player for 150 fuel', () => {
    const { w, ps, restore } = devouredInHive();
    try {
      const [a, b] = ps;
      run(w, 4);
      // drag the body toward the camp, into a lamp's light, next to a live cable
      const gen = (() => {
        b.carrying = newItem('generator');
        b.x = 40 * CELL;
        b.z = 12 * CELL;
        b.yaw = Math.PI / 2;
        return w.camp.place(b)!;
      })();
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
      const fuel0 = w.fuel.value;
      let respawned = false;
      let atRespawn: any = null;
      w.events.on('respawned', () => {
        respawned = true;
        atRespawn = { hive: a.hive, overwhelm: a.overwhelm };
      });
      run(w, 90, () => {
        b.overwhelm = 0;
        const tx = 50 * CELL - a.hiveX, tz = 12 * CELL - a.hiveZ, l = Math.hypot(tx, tz) || 1;
        a.hiveMove = l > 0.5 ? [tx / l, tz / l] : [0, 0];
        a.will = Math.max(a.will, 0.6); // a determined player
        // the teammate defends the ritual: zaps the queen's bugs off the body
        if (a.ritualStage >= 1) {
          const sw = w.swarm, ht = w.death.hiveTendrils.get(a.id);
          sw.hash.forEachNear(a.hiveX, a.hiveZ, 3, (j) => {
            if (sw.alive[j] && sw.tendril[j] !== ht?.id) sw.kill(j, 'zap', w.events);
          });
        }
      });
      expect(respawned).toBe(true);
      // checked at the moment of return (after that, an undefended low-health player can fall again)
      expect(atRespawn.hive).toBe(false);
      expect(atRespawn.overwhelm).toBeGreaterThan(0.4);
      expect(fuel0 - w.fuel.value).toBeGreaterThanOrEqual(FUEL.respawn);
    } finally {
      restore();
    }
  }, 120000);

  it('lightning hits on the struggling body count as electrocution instead of killing it', () => {
    const { w, ps, restore } = devouredInHive();
    try {
      const a = ps[0];
      run(w, 4);
      a.ritualStage = 2;
      w.death.stage.set(a.id, 2);
      const t = w.death.hiveTendrils.get(a.id)!;
      let j = -1;
      for (let i = 0; i < w.swarm.count; i++) if (w.swarm.alive[i] && w.swarm.tendril[i] === t.id) j = i;
      expect(w.death.shockBody(j)).toBe(true);
      expect(a.ritual).toBeCloseTo(0.2, 5);
    } finally {
      restore();
    }
  });

  it('solo: with no bug zapper, being devoured fails the run; with one, the ritual can bring you back', () => {
    const env = hall(1);
    try {
      const a = env.ps[0];
      a.x = 80 * CELL;
      a.z = 12 * CELL;
      env.w.death.devour(a);
      run(env.w, 1);
      expect(env.w.runState).toBe('failed');
    } finally {
      env.restore();
    }
    const env2 = hall(1);
    try {
      const { w } = env2;
      const a = env2.ps[0];
      // a powered bug zapper in a lit spot
      a.carrying = newItem('generator');
      a.x = 50 * CELL;
      a.z = 12 * CELL;
      a.yaw = Math.PI / 2;
      const gen = w.camp.place(a)!;
      a.slots[0] = newItem('bugzapper');
      a.sel = 0;
      a.x = 54 * CELL;
      const zap = w.camp.place(a)!;
      a.slots[1] = newItem('spool');
      a.sel = 1;
      a.x = gen.x;
      a.z = gen.z;
      w.camp.startWire(a, gen);
      a.x = zap.x;
      w.camp.payOut(a);
      w.camp.connectWire(a, zap);
      w.staticLights.push(makeLight('lamp', { x: zap.x, z: zap.z, radius: 6, intensity: 1.3 }));
      a.x = 80 * CELL;
      w.death.devour(a);
      let respawned = false;
      w.events.on('respawned', () => (respawned = true));
      run(w, 120, () => {
        const tx = zap.x - a.hiveX, tz = zap.z - a.hiveZ, l = Math.hypot(tx, tz) || 1;
        a.hiveMove = l > 0.5 ? [tx / l, tz / l] : [0, 0];
        a.will = Math.max(a.will, 0.6);
      });
      expect(w.runState).toBe('playing');
      expect(respawned).toBe(true);
    } finally {
      env2.restore();
    }
  }, 240000);

  it('if every player is in the hive at once, the run fails', () => {
    const { w, ps, restore } = hall(2);
    try {
      for (const p of ps) {
        p.x = 80 * CELL;
        w.death.devour(p);
      }
      run(w, 1);
      expect(w.runState).toBe('failed');
      expect(w.failReason).toContain('every player');
    } finally {
      restore();
    }
  });
});
