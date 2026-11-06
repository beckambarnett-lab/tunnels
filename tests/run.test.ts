import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { newItem } from '../src/sim/camp';
import { applyInput, emptyInput } from '../src/sim/actions';
import { NightLayout } from '../src/sim/night';

function night(seed = 2, usedSave = false) {
  const w = new World({ seed, night: true, bugs: 200 });
  const L = w.layout as NightLayout;
  const p = w.addPlayer('local', L.start.x, L.start.z);
  p.slots = [newItem('sprayer'), newItem('zapper'), null];
  w.usedSave = usedSave;
  const orig = console.log;
  const logs: string[] = [];
  console.log = (...a: any[]) => logs.push(String(a[0]));
  return { w, L, p, logs, restore: () => (console.log = orig) };
}
const run = (w: World, secs: number, each?: () => void) => {
  for (let t = 0; t < secs; t += 1 / 20) {
    each?.();
    w.step(1 / 20);
  }
};
const at = (p: any, m: { x: number; z: number }) => ((p.x = m.x), (p.z = m.z));

describe('the full night (vertical slice)', () => {
  it('act 1: the job, flashlights, power dies, the basement opens; then acts follow the team down', () => {
    const { w, L, p, logs, restore } = night();
    try {
      expect(w.run!.act).toBe(1);
      run(w, 1);
      w.run!.jobKills = w.run!.jobTarget; // the job: zap the bugs in the house
      const fl = L.marks.find((m) => m.kind === 'flashlights')!;
      w.camp.drop('flashlight', fl.x, fl.z);
      p.slots[2] = newItem('flashlight');
      run(w, 0.5);
      expect(w.run!.powerOn).toBe(false);
      expect(w.run!.plugOpen).toBe(true);
      for (const c of L.plugCells) expect(w.grid.cells[c]).toBe(0);
      // walk down: base -> act 2, intersection -> act 3, junkyard -> act 4
      const pieces = ['tank', 'rig', 'suit'];
      for (const k of pieces) {
        at(p, L.marks.find((m) => m.kind === k)!);
        run(w, 0.3, () => (p.overwhelm = 0));
      }
      expect(w.run!.act).toBe(4);
      expect(logs.some((l) => l.includes('act 2'))).toBe(true);
      expect(logs.some((l) => l.includes('act 3'))).toBe(true);
      expect(w.director.act).toBe(4);
    } finally {
      restore();
    }
  }, 60000);

  it('the ladder: fuel tank turns the sprayer into a flamethrower, rigs refuel once, suits let you dig; checkpoints save', () => {
    const { w, L, p, restore } = night();
    try {
      const saved: string[] = [];
      w.run!.onCheckpoint = (n) => saved.push(n);
      const press = () => applyInput(w, p, { ...emptyInput(), interactPressed: true, interact: true }, 1 / 20);
      at(p, L.marks.find((m) => m.kind === 'tank')!);
      w.step(1 / 20);
      press();
      expect(p.slots.some((s) => s?.kind === 'flamethrower')).toBe(true);
      expect(p.slots.some((s) => s?.kind === 'sprayer')).toBe(false);
      const rig = L.marks.find((m) => m.kind === 'rig')!;
      at(p, rig);
      const f0 = w.fuel.value;
      press();
      press();
      expect(w.fuel.value - f0).toBeCloseTo(rig.data.fuel, 0);
      at(p, L.marks.find((m) => m.kind === 'suit')!);
      press();
      expect(p.suit).toBe(true);
      // dig into the nearest wall
      let dug = 0;
      w.events.on('playerDig', () => dug++);
      for (let k = 0; k < 16 && !dug; k++) {
        p.yaw = (k / 16) * Math.PI * 2;
        for (let s = 0; s < 40; s++) applyInput(w, p, { ...emptyInput(), dig: true }, 1 / 20);
        p.x += Math.sin(p.yaw) * 2;
        p.z += Math.cos(p.yaw) * 2;
        if (!w.grid.isOpenAt(p.x, p.z)) (p.x -= Math.sin(p.yaw) * 2), (p.z -= Math.cos(p.yaw) * 2);
      }
      expect(dug).toBeGreaterThan(0);
      expect(saved).toEqual(expect.arrayContaining(['the intersection', 'Enlite suits']));
      expect(saved.some((s) => s.startsWith('oil rig'))).toBe(true);
    } finally {
      restore();
    }
  }, 60000);

  it('burning her egg sacs provokes the queen; the truck digs for the surface and the sunrise kills her (true ending)', () => {
    const { w, L, p, restore } = night();
    try {
      for (const i of L.plugCells) w.grid.cells[i] = 0;
      w.run!.act = 4;
      p.slots = [newItem('flamethrower'), null, null];
      for (const e of w.run!.eggs) {
        p.x = e.x - 1.5;
        p.z = e.z;
        p.yaw = Math.PI / 2;
        run(w, 4, () => {
          p.overwhelm = 0;
          applyInput(w, p, { ...emptyInput(), use: true, aim: [1, 0, 0], eye: [p.x, 1.6, p.z] }, 1 / 20);
        });
      }
      expect(w.run!.rage).toBeGreaterThanOrEqual(1);
      at(p, L.marks.find((m) => m.kind === 'truck')!);
      applyInput(w, p, { ...emptyInput(), interactPressed: true, interact: true }, 1 / 20);
      expect(w.finale!.state).toBe('driving');
      expect(p.riding).toBe(true);
      // drive west (toward the house) until sunrise
      let sun: any = null;
      w.events.on('sunrise', (e) => (sun = e));
      run(w, 240, () => {
        p.hiveMove = [-1, 0];
        w.finale!.truck.hp = Math.max(w.finale!.truck.hp, 0.5); // a team that keeps the truck alive
      });
      expect(sun).not.toBeNull();
      expect(sun.ending).toBe('true');
      expect(w.runState).toBe('won');
      expect(w.finale!.queen.alive).toBe(false);
    } finally {
      restore();
    }
  }, 240000);

  it('a run continued from a checkpoint can only reach the hollow ending', () => {
    const { w, L, p, restore } = night(3, true);
    try {
      for (const i of L.plugCells) w.grid.cells[i] = 0;
      w.run!.rage = 1;
      at(p, L.marks.find((m) => m.kind === 'truck')!);
      applyInput(w, p, { ...emptyInput(), interactPressed: true, interact: true }, 1 / 20);
      let sun: any = null;
      w.events.on('sunrise', (e) => (sun = e));
      run(w, 240, () => {
        p.hiveMove = [-1, 0];
        w.finale!.truck.hp = 1;
      });
      expect(sun?.ending).toBe('hollow');
    } finally {
      restore();
    }
  }, 240000);

  it('the truck being stopped fails the run', () => {
    const { w, L, p, restore } = night();
    try {
      w.run!.rage = 1;
      at(p, L.marks.find((m) => m.kind === 'truck')!);
      applyInput(w, p, { ...emptyInput(), interactPressed: true, interact: true }, 1 / 20);
      w.finale!.truck.hp = 0.01;
      run(w, 30);
      expect(w.runState).toBe('failed');
      expect(w.failReason).toContain('truck');
    } finally {
      restore();
    }
  }, 60000);
});

describe('junk mods', () => {
  it('a hubcap widens the flashlight and drains it faster; a hose lengthens the flame; Christmas lights lose belief fast', () => {
    const w = new World({ seed: 2, night: true, bugs: -1 });
    const p = w.addPlayer('local', 10, 10);
    const orig = console.log;
    console.log = () => {};
    try {
      p.slots = [newItem('flashlight'), newItem('flamethrower'), null];
      p.sel = 0;
      w.camp.drop('hubcap', p.x, p.z);
      expect(w.camp.pickUpFloor(p, w.camp.floor[w.camp.floor.length - 1])).toBe(true);
      expect(p.slots[0]!.mods).toContain('hubcap');
      const b0 = p.slots[0]!.battery!;
      applyInput(w, p, emptyInput(), 1);
      expect(b0 - p.slots[0]!.battery!).toBeCloseTo(1.6, 5);
      expect(p.flashlight.cone).toBeGreaterThan((30 * Math.PI) / 180);
      p.sel = 1;
      w.camp.drop('hose', p.x, p.z);
      w.camp.pickUpFloor(p, w.camp.floor[w.camp.floor.length - 1]);
      applyInput(w, p, emptyInput(), 1 / 20);
      expect(p.hose).toBe(true);
      const before = w.light.belief.xmas;
      w.learning.touch(0, 5);
      expect(before - w.light.belief.xmas).toBeCloseTo(0.06, 5);
    } finally {
      console.log = orig;
    }
  });
});

describe('finale roles by player count (GDD, Decided)', () => {
  it('4: driver, two gunners, queen-keeper; 3: driver is also keeper; 2: driver and flamer; 1: driver only', () => {
    const w = new World({ seed: 2, night: true, bugs: -1 });
    const f = w.finale!;
    const mk = (n: number) => Array.from({ length: n }, (_, k) => ({ id: 'p' + k }) as any);
    f.assignRoles(mk(4));
    expect([...f.roles.values()]).toEqual(['driver', 'gunnerL', 'gunnerR', 'keeper']);
    expect(f.isKeeper('p0')).toBe(false);
    f.assignRoles(mk(3));
    expect([...f.roles.values()]).toEqual(['driver', 'gunnerL', 'gunnerR']);
    expect(f.isKeeper('p0')).toBe(true);
    f.assignRoles(mk(2));
    expect([...f.roles.values()]).toEqual(['driver', 'gunnerL']);
    expect(f.isKeeper('p0')).toBe(false);
    f.assignRoles(mk(1));
    expect([...f.roles.values()]).toEqual(['driver']);
    expect(f.isKeeper('p0')).toBe(false);
  });
});

describe('the bad ending loop', () => {
  it('a stopped truck can be replayed inside the swarm\'s mind; finishing it gives the hollow ending', () => {
    const w = new World({ seed: 2, night: true, bugs: 100 });
    const L = w.layout as NightLayout;
    const p = w.addPlayer('local', L.start.x, L.start.z);
    const orig = console.log;
    console.log = () => {};
    try {
      for (const i of L.plugCells) w.grid.cells[i] = 0;
      w.run!.rage = 1;
      const tm = L.marks.find((m) => m.kind === 'truck')!;
      p.x = tm.x;
      p.z = tm.z;
      applyInput(w, p, { ...emptyInput(), interactPressed: true, interact: true }, 1 / 20);
      w.finale!.truck.hp = 0.001;
      run(w, 5);
      expect(w.runState).toBe('failed');
      w.finale!.replayInMind();
      expect(w.finale!.mind).toBe(true);
      expect(w.runState).toBe('playing');
      let sun: any = null;
      w.events.on('sunrise', (e) => (sun = e));
      run(w, 240, () => {
        p.hiveMove = [-1, 0];
        w.finale!.truck.hp = 1;
      });
      expect(sun?.ending).toBe('hollow');
    } finally {
      console.log = orig;
    }
  }, 240000);
});

describe('checkpoints (GDD list)', () => {
  it('flashlights, the intersection, the suits, the truck and every oil rig; not the junkyard', () => {
    const { w, L, p, restore } = night();
    try {
      const saved: string[] = [];
      w.run!.onCheckpoint = (n) => saved.push(n);
      for (const k of ['tank', 'suit', 'truck']) {
        at(p, L.marks.find((m) => m.kind === k)!);
        run(w, 0.3, () => (p.overwhelm = 0));
      }
      w.run!.useMark(p, L.marks.find((m) => m.kind === 'rig')!);
      expect(saved).toEqual(expect.arrayContaining(['the intersection', 'the truck', 'oil rig 1']));
      expect(saved).not.toContain('the junkyard');
    } finally {
      restore();
    }
  });
});
