import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { newItem } from '../src/sim/camp';
import { applyInput, emptyInput } from '../src/sim/actions';
import { NightLayout, Z } from '../src/sim/night';
import { PEST } from '../src/config';
import { HOUSE_INTENT } from '../src/sim/house';

// The act-1 house infestation (GDD: the routine job; "conceals itself; acts almost like normal bugs").

function night(seed = 2) {
  const w = new World({ seed, night: true, bugs: 200 });
  const L = w.layout as NightLayout;
  const p = w.addPlayer('local', L.start.x, L.start.z);
  p.slots = [newItem('sprayer'), newItem('zapper'), null];
  const orig = console.log;
  console.log = () => {};
  return { w, L, p, restore: () => (console.log = orig) };
}
const run = (w: World, secs: number, each?: () => void) => {
  for (let t = 0; t < secs; t += 1 / 20) {
    each?.();
    w.step(1 / 20);
  }
};
const pests = (w: World) => {
  const id = w.run!.house.tendril?.id;
  const out: number[] = [];
  for (let j = 0; j < w.swarm.count; j++) if (w.swarm.alive[j] && w.swarm.tendril[j] === id) out.push(j);
  return out;
};

describe('the house infestation', () => {
  it('fills every room of the house, moves like ordinary bugs, and is left alone by the queen', () => {
    const { w, L, restore } = night();
    try {
      run(w, 0.2);
      const list = pests(w);
      expect(list.length).toBe(PEST.count);
      // every pest is in the house, spread over its four bands of rooms and its three columns
      const g = w.grid;
      let x0 = 1e9, y0 = 1e9;
      for (let i = 0; i < g.n; i++)
        if (L.zone[i] === Z.house) {
          x0 = Math.min(x0, i % g.w);
          y0 = Math.min(y0, (i / g.w) | 0);
        }
      const bands = [0, 0, 0, 0], cols = [0, 0, 0];
      for (const j of list) {
        const c = g.cellAt(w.swarm.x[j], w.swarm.z[j]);
        expect(L.zone[c]).toBe(Z.house);
        const lx = (c % g.w) - x0, ly = ((c / g.w) | 0) - y0;
        bands[ly < 7 ? 0 : ly < 12 ? 1 : ly < 19 ? 2 : 3]++;
        cols[lx < 11 ? 0 : lx < 22 ? 1 : 2]++;
      }
      console.info(`house pests by band ${bands.join('/')}, by column ${cols.join('/')}`);
      for (const b of bands) expect(b).toBeGreaterThanOrEqual(4);
      for (const c of cols) expect(c).toBeGreaterThanOrEqual(8);
      // the hive's own numbers are untouched (the pests come on top)
      run(w, 3);
      expect(w.swarm.active - w.pestCount).toBe(w.targetBugs);
      // they move (scuttle), and the lit house doesn't push them into the corners
      const before = list.map((j) => [w.swarm.x[j], w.swarm.z[j]]);
      run(w, 6);
      const after = pests(w);
      let moved = 0;
      list.forEach((j, k) => w.swarm.alive[j] && Math.hypot(w.swarm.x[j] - before[k][0], w.swarm.z[j] - before[k][1]) > 0.8 && moved++);
      expect(moved).toBeGreaterThan(list.length * 0.6);
      let lit = 0;
      for (const j of after) if (w.light.rawAt(w.swarm.x[j], w.swarm.z[j]) > 0.2) lit++;
      console.info(`moved ${moved}/${list.length}; in lamplight ${lit}/${after.length}`);
      expect(lit).toBeGreaterThan(after.length * 0.3);
      // the queen never assigns them
      expect(after.every((j) => w.swarm.tendril[j] === w.run!.house.tendril!.id)).toBe(true);
      expect(w.run!.house.tendril!.intent).toBe(HOUSE_INTENT);
    } finally {
      restore();
    }
  }, 60000);

  it('they scatter from you; the sprayer makes them play dead; zapping them counts toward the job', () => {
    const { w, p, restore } = night();
    try {
      run(w, 0.5);
      const sw = w.swarm;
      // stand next to one: it runs
      const j = pests(w)[0];
      p.x = sw.x[j] + 0.8;
      p.z = sw.z[j];
      const d0 = 0.8;
      run(w, 0.8, () => {
        p.x = p.x; // stand still
      });
      const d1 = Math.hypot(sw.x[j] - p.x, sw.z[j] - p.z);
      console.info(`scatter: ${d0.toFixed(2)} m -> ${d1.toFixed(2)} m in 0.8 s`);
      expect(d1).toBeGreaterThan(1.3);
      // spray the nearest group, then zap the heap
      let sprayed = 0;
      const near = () => {
        let best = -1, bd = 1e9;
        for (const k of pests(w)) {
          const d = Math.hypot(sw.x[k] - p.x, sw.z[k] - p.z);
          if (d < bd) (bd = d), (best = k);
        }
        return best;
      };
      const kills0 = w.run!.jobKills;
      for (let round = 0; round < 12; round++) {
        const k = near();
        // walk up behind it, face it, spray
        const a = Math.atan2(sw.x[k] - p.x, sw.z[k] - p.z);
        p.yaw = a;
        p.sel = 0;
        applyInput(w, p, { ...emptyInput(), use: true }, 1 / 20);
        if (sw.timer[k] > w.time) sprayed++;
        // close in and zap while it's down
        p.x = sw.x[k] - Math.sin(a) * 1.2;
        p.z = sw.z[k] - Math.cos(a) * 1.2;
        p.sel = 1;
        p.zapT = -10;
        applyInput(w, p, { ...emptyInput(), use: true, usePressed: true }, 1 / 20);
        run(w, 0.2);
      }
      console.info(`sprayer stopped ${sprayed}/12 targets; job ${w.run!.jobKills - kills0} kills`);
      expect(sprayed).toBeGreaterThanOrEqual(6);
      expect(w.run!.jobKills - kills0).toBeGreaterThanOrEqual(8);
    } finally {
      restore();
    }
  }, 60000);

  it('the vent tops the house up while the job is unfinished; the power dying ends the act and the hive takes them back', () => {
    const { w, L, p, restore } = night();
    try {
      run(w, 0.5);
      const vents: number[] = [];
      w.events.on('ventCrawl', (e) => vents.push(e.n));
      // most of them are gone (without counting toward the job): more crawl out of the vent
      for (const j of pests(w).slice(0, PEST.count - 5)) w.swarm.kill(j, 'despawn', w.events);
      expect(w.run!.jobKills).toBe(0);
      run(w, 0.5);
      expect(vents.length).toBeGreaterThan(0);
      expect(pests(w).length).toBeGreaterThanOrEqual(PEST.topUpBelow);
      // the job is done, the flashlights found: the mains go, and the survivors stop pretending
      w.run!.jobKills = w.run!.jobTarget;
      p.slots[2] = newItem('flashlight');
      const left = pests(w);
      run(w, 0.5);
      expect(w.run!.powerOn).toBe(false);
      expect(w.run!.house.tendril).toBeNull();
      expect(w.pestCount).toBe(0);
      run(w, 2);
      const queenIds = new Set([...w.tendrils.values()].map((t) => t.id));
      const reassigned = left.filter((j) => w.swarm.alive[j] && queenIds.has(w.swarm.tendril[j])).length;
      console.info(`after the power died: ${reassigned}/${left.length} former pests in the queen's tendrils`);
      expect(reassigned).toBe(left.filter((j) => w.swarm.alive[j]).length);
      void L;
    } finally {
      restore();
    }
  }, 60000);
});
