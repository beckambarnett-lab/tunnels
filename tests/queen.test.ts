import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { asciiLayout } from './helpers';
import { newItem } from '../src/sim/camp';
import { INTENTS, Intent } from '../src/sim/queen';
import { CELL } from '../src/config';

/**
 * Arena: the camp room (left) and the hive (right) are split by a 7 m wall; the only open route
 * is a long corridor over the top. Normal tendrils walk round; digging tendrils go through.
 */
function arena() {
  const W = 84, H = 50;
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      let ch = '#';
      if (x >= 4 && x <= 40 && y >= 15 && y <= 45) ch = '.';
      if (x >= 55 && x <= 80 && y >= 15 && y <= 45) ch = 'H';
      if (y >= 3 && y <= 7 && x >= 10 && x <= 70) ch = '.';
      if (x >= 10 && x <= 14 && y >= 3 && y <= 15) ch = '.';
      if (x >= 66 && x <= 70 && y >= 3 && y <= 15) ch = '.';
      r += ch;
    }
    rows.push(r);
  }
  return asciiLayout(rows);
}

function setup(bugs = 300) {
  const w = new World({ layout: arena(), bugs });
  w.director.scripted = true; // hold Build Up so the forced intent runs with a full budget
  w.director.act = 4;
  const p = w.addPlayer('p', 15 * CELL, 30 * CELL);
  p.yaw = Math.PI / 2;
  p.slots[0] = newItem('flashlight');
  // a camp: generator, lamp, 12 m of cable into the dark corner
  p.carrying = newItem('generator');
  const gen = w.camp.place(p)!;
  p.x = 24 * CELL;
  p.slots[1] = newItem('lamp');
  p.sel = 1;
  const lamp = w.camp.place(p)!;
  p.slots[1] = newItem('spool');
  p.x = gen.x;
  p.z = gen.z;
  w.camp.startWire(p, gen);
  for (let k = 0; k < 110; k++) {
    p.z += 0.1;
    w.camp.payOut(p);
  }
  w.camp.dropWireEnd(p);
  // and power the lamp
  p.slots[1] = newItem('spool');
  p.x = gen.x;
  p.z = gen.z;
  w.camp.startWire(p, gen);
  for (let k = 0; k < 20; k++) {
    p.x += (lamp.x - gen.x) / 20;
    w.camp.payOut(p);
  }
  w.camp.connectWire(p, lamp);
  p.x = 15 * CELL;
  p.z = 30 * CELL;
  p.sel = 0;
  // let the swarm spawn and settle in the hive
  for (let t = 0; t < 2; t += 1 / 20) w.step(1 / 20);
  return { w, p, gen, lamp };
}

function runIntent(intent: Intent, secs: number, pre?: (w: World) => void) {
  const env = setup();
  const { w, p } = env;
  pre?.(w);
  const tells: string[] = [];
  const ev: Record<string, number> = {};
  for (const name of ['dig', 'breach', 'beliefDrop', 'wireCut', 'deviceBroken', 'bodyDragged', 'tell', 'tellPulse'])
    w.events.on(name, (e) => {
      ev[name] = (ev[name] || 0) + 1;
      if ((name === 'tell' || name === 'tellPulse') && e.intent === intent) tells.push(e.tell ?? e.intent);
    });
  const samples: any[] = [];
  w.queen!.force(intent);
  const orig = console.log;
  console.log = () => {};
  try {
    for (let t = 0; t < secs; t += 1 / 20) {
      p.overwhelm = 0; // keep the player up
      w.step(1 / 20);
      if (Math.round(t * 20) % 20 === 0) {
        const sw = w.swarm;
        let under = 0, near = 0, dist = 0, n = 0, strike = sw.stats.strike;
        for (let j = 0; j < sw.count; j++) {
          if (!sw.alive[j]) continue;
          n++;
          const d = Math.hypot(sw.x[j] - p.x, sw.z[j] - p.z);
          dist += d;
          if (d < 8) near++;
          if (sw.layer[j]) under++;
        }
        samples.push({ t, under, near, meanDist: dist / n, strike, touching: p.touching, silent: w.time < w.queen!.silenceUntil });
      }
    }
  } finally {
    console.log = orig;
  }
  return { ...env, tells, ev, samples, intentNow: w.queen!.intent };
}

describe('queen intents: each one runs and shows its tell', () => {
  it('runs all ten intents', () => {
    expect(INTENTS.length).toBe(10);
  });

  it('conceal: the hive hides its size; the few that show are oddly organised', () => {
    const r = runIntent('conceal', 20);
    expect(r.tells.length).toBeGreaterThan(0);
    const t = [...r.w.tendrils.values()].find((x) => x.intent === 'conceal')!;
    expect(t.aliMul).toBeGreaterThan(2);
    const last = r.samples[r.samples.length - 1];
    expect(last.near).toBeLessThan(30);
  });

  it('probe: scouts tap into the light and retreat (belief drops)', () => {
    const r = runIntent('probe', 40);
    expect(r.tells.length).toBeGreaterThan(0);
    expect(r.ev.beliefDrop || 0).toBeGreaterThan(0);
  }, 60000);

  it('sabotage: bugs go for the darkest stretch of cable and cut it', () => {
    const r = runIntent('sabotage', 60, (w) => w.learning.unlock('sabotage', 'test'));
    expect(r.tells.length).toBeGreaterThan(0);
    expect(r.ev.wireCut || 0).toBeGreaterThan(0);
  }, 60000);

  it('flank: tendrils dig through the wall to hit the camp from the side', () => {
    const r = runIntent('flank', 60, (w) => w.learning.unlock('flank', 'test'));
    expect(r.tells.length).toBeGreaterThan(0);
    expect(r.ev.dig || 0).toBeGreaterThan(5);
  }, 60000);

  it('undermine: tendrils go under the floor toward the generator', () => {
    const r = runIntent('undermine', 50);
    expect(r.tells.length).toBeGreaterThan(0);
    expect(Math.max(...r.samples.map((s) => s.under))).toBeGreaterThan(20);
  }, 60000);

  it('reroute: fresh holes appear in walls the team has already seen', () => {
    const r = runIntent('reroute', 60);
    expect(r.tells.length).toBeGreaterThan(0);
    expect(r.ev.dig || 0).toBeGreaterThan(0);
  }, 60000);

  it('siege: a growing ring at one lamp, then the fixture breaks', () => {
    const r = runIntent('siege', 70);
    expect(r.tells.length).toBeGreaterThan(0);
    expect(r.w.queen!.siegeTarget).toBe(r.lamp.id);
    expect(r.lamp.hp).toBeLessThan(1);
  }, 90000);

  it('bait: a small, oddly brave group stands in the open', () => {
    const r = runIntent('bait', 30, (w) => w.learning.unlock('bait', 'test'));
    expect(r.tells.length).toBeGreaterThan(0);
    const t = [...r.w.tendrils.values()].find((x) => x.intent === 'bait')!;
    expect(t.members).toBeLessThanOrEqual(15);
    const sw = r.w.swarm;
    let atSpot = 0;
    for (let j = 0; j < sw.count; j++) if (sw.alive[j] && sw.tendril[j] === t.id && Math.hypot(sw.x[j] - t.gx, sw.z[j] - t.gz) < 3) atSpot++;
    expect(atSpot).toBeGreaterThan(3);
  }, 60000);

  it('assault: the nest goes silent, then everything strikes through the opening', () => {
    const r = runIntent('assault', 30, (w) => (w.players[0].yaw = Math.PI / 2));
    expect(r.tells.length).toBeGreaterThan(0);
    const silent = r.samples.filter((s) => s.silent);
    expect(silent.length).toBeGreaterThan(0);
    expect(silent.every((s) => s.strike === 0)).toBe(true);
    expect(Math.max(...r.samples.map((s) => s.strike))).toBeGreaterThan(100);
  }, 60000);

  it('retreat: the swarm withdraws', () => {
    const env = runIntent('assault', 15);
    const { w, p } = env;
    const mean = () => {
      const sw = w.swarm;
      let d = 0, n = 0;
      for (let j = 0; j < sw.count; j++) if (sw.alive[j]) (d += Math.hypot(sw.x[j] - p.x, sw.z[j] - p.z)), n++;
      return d / n;
    };
    const before = mean();
    let told = false;
    w.events.on('tell', (e) => e.intent === 'retreat' && (told = true));
    w.queen!.force('retreat');
    const orig = console.log;
    console.log = () => {};
    for (let t = 0; t < 15; t += 1 / 20) w.step(1 / 20);
    console.log = orig;
    expect(told).toBe(true);
    expect(mean()).toBeGreaterThan(before + 5);
  }, 60000);
});
