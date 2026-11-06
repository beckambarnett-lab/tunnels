import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { makeLight } from '../src/sim/light';
import { makeTendril } from '../src/sim/tendril';
import { defaultParams } from '../src/sim/fieldManager';
import { asciiLayout, room } from './helpers';
import { CELL, SWARM, LIGHT } from '../src/config';

function massWorld() {
  const L = asciiLayout(room(80, 50));
  const w = new World({ layout: L, noQueen: true, bugs: -1 });
  const cx = 40 * CELL, cz = 25 * CELL;
  const lamp = makeLight('lamp', { x: cx, z: cz, radius: 5, intensity: 1 });
  w.staticLights.push(lamp);
  const t = makeTendril({ params: defaultParams(), mode: 'mass', fieldName: 'lamp', gx: cx, gz: cz, holdDist: 0 });
  t.goals = w.goalCellsAt(cx, cz, 1);
  w.tendrils.set(t.id, t);
  for (let k = 0; k < 250; k++) {
    const i = w.swarm.spawn((2 + (k % 20) * 0.4) , (2 + Math.floor(k / 20) * 0.4), t.id);
    expect(i).toBeGreaterThanOrEqual(0);
  }
  return { w, cx, cz, t };
}

describe('swarm and light', () => {
  it('bugs avoid lit cells and mass at the edge of the light', () => {
    const { w, cx, cz } = massWorld();
    for (let s = 0; s < 60 * 25; s++) w.step(1 / 60);
    const sw = w.swarm;
    let inLit = 0, alive = 0;
    const dists: number[] = [];
    for (let i = 0; i < sw.count; i++) {
      if (!sw.alive[i]) continue;
      alive++;
      const e = w.light.effAt(sw.x[i], sw.z[i]);
      if (e > SWARM.tolerance * 1.5) inLit++;
      dists.push(Math.hypot(sw.x[i] - cx, sw.z[i] - cz));
    }
    // light edge: where lamp light falls to the tolerance
    const belief = w.light.belief.lamp;
    const edge = 5 * (1 - Math.pow(Math.min(1, SWARM.tolerance / belief), 1 / 1.15));
    dists.sort((a, b) => a - b);
    const median = dists[(dists.length / 2) | 0];
    const nearEdge = dists.filter((d) => d < edge + 2.5).length / dists.length;
    console.log(`belief=${belief.toFixed(2)} alive=${alive} inLit=${inLit} edge=${edge.toFixed(2)} min=${dists[0].toFixed(2)} median=${median.toFixed(2)} nearEdge=${(nearEdge * 100).toFixed(0)}%`);
    expect(alive).toBe(250);
    expect(inLit / alive).toBeLessThan(0.03); // they don't charge in
    expect(dists[0]).toBeGreaterThan(edge - 0.8); // nobody deep inside the light
    expect(nearEdge).toBeGreaterThan(0.7); // they massed at the edge rather than scattering
  });

  it('when the light dies the swarm floods in', () => {
    const { w, cx, cz } = massWorld();
    for (let s = 0; s < 60 * 20; s++) w.step(1 / 60);
    w.staticLights[0].on = false;
    for (let s = 0; s < 60 * 4; s++) w.step(1 / 60);
    const sw = w.swarm;
    let close = 0;
    for (let i = 0; i < sw.count; i++) if (sw.alive[i] && Math.hypot(sw.x[i] - cx, sw.z[i] - cz) < 2) close++;
    console.log(`within 2 m of the dead lamp after 4 s: ${close}`);
    expect(close).toBeGreaterThan(40);
  });
});

describe('digging and breaches', () => {
  // Bugs in the hive (right) want the player (left). The only way is through a thick wall.
  const rows: string[] = [];
  for (let y = 0; y < 24; y++) rows.push('.'.repeat(20) + '#'.repeat(8) + '.'.repeat(20));

  function digWorld(playerYaw: number, lit: boolean) {
    const L = asciiLayout(rows);
    const w = new World({ layout: L, noQueen: true, bugs: -1 });
    const p = w.addPlayer('p1', 6 * CELL, 12.5 * CELL);
    p.yaw = playerYaw;
    p.flashlight.on = false;
    if (lit) w.staticLights.push(makeLight('lamp', { x: 19 * CELL, z: 12.5 * CELL, radius: 6, intensity: 1.2 }));
    const t = makeTendril({ params: defaultParams(), mode: 'mass', fieldName: 'player' });
    w.tendrils.set(t.id, t);
    for (let k = 0; k < 80; k++) w.swarm.spawn((38 + (k % 8)) * CELL, (8 + Math.floor(k / 8)) * CELL, t.id);
    const breaches: { cell: number; seen: boolean; raw: number }[] = [];
    w.events.on('breach', (e) => breaches.push({ cell: e.cell, seen: w.vis.isSeen(e.cell), raw: w.light.surfaceRaw(e.cell) }));
    const step = (sec: number) => {
      for (let s = 0; s < 60 * sec; s++) {
        t.gx = p.x;
        t.gz = p.z;
        t.goals = w.goalCellsAt(p.x, p.z, 1);
        w.step(1 / 60);
      }
    };
    return { w, p, t, breaches, step };
  }
  const playerFaceCells = (w: World) => {
    const out: number[] = [];
    for (let y = 1; y <= 24; y++) out.push(w.grid.idx(21, y));
    return out;
  };

  it('bugs dig through earth toward their goal', () => {
    const { w, step } = digWorld(-Math.PI / 2, false); // player faces away from the wall
    step(40);
    let dug = 0;
    for (let i = 0; i < w.grid.n; i++) if (w.grid.dugAt[i] >= 0) dug++;
    console.log(`cells dug: ${dug}`);
    expect(dug).toBeGreaterThan(5);
  });

  it('no breach while the wall face is watched; they wait inside the wall', () => {
    const { w, breaches, step } = digWorld(Math.PI / 2, false); // facing the wall (+x)
    step(40);
    const opened = playerFaceCells(w).filter((c) => w.grid.cells[c] === 0).length;
    let dug = 0;
    for (let i = 0; i < w.grid.n; i++) if (w.grid.dugAt[i] >= 0) dug++;
    console.log(`watched: interior cells dug ${dug}, face cells opened ${opened}, breaches ${breaches.length}`);
    expect(opened).toBe(0);
    expect(breaches.length).toBe(0);
    expect(dug).toBeGreaterThan(3); // they did dig up to the face
  });

  it('no breach into light', () => {
    const { w, breaches, step } = digWorld(-Math.PI / 2, true); // looking away but the face is lit
    step(40);
    for (const b of breaches) expect(b.raw).toBeLessThan(LIGHT.darkThreshold);
    const litFaces = playerFaceCells(w).filter((c) => w.light.surfaceRaw(c) >= LIGHT.darkThreshold);
    for (const c of litFaces) expect(w.grid.cells[c]).not.toBe(0);
  });

  it('breaches happen once the spot is dark and unseen, and only there', () => {
    const { w, p, breaches, step } = digWorld(Math.PI / 2, false);
    step(30); // watched: they mass in the wall
    expect(breaches.length).toBe(0);
    p.yaw = -Math.PI / 2; // turn around
    step(15);
    console.log(`breaches after turning away: ${breaches.length}`);
    expect(breaches.length).toBeGreaterThan(0);
    for (const b of breaches) {
      expect(b.seen).toBe(false);
      expect(b.raw).toBeLessThan(LIGHT.darkThreshold);
    }
  });

  it('the under layer erupts only at dark unseen floor cells', () => {
    const L = asciiLayout(rows);
    const w = new World({ layout: L, noQueen: true, bugs: -1 });
    const p = w.addPlayer('p1', 6 * CELL, 12.5 * CELL);
    p.yaw = Math.PI / 2;
    const t = makeTendril({ params: defaultParams({ allowDig: false, allowUnder: true }), mode: 'mass', fieldName: 'player' });
    w.tendrils.set(t.id, t);
    for (let k = 0; k < 60; k++) w.swarm.spawn((38 + (k % 8)) * CELL, (8 + Math.floor(k / 8)) * CELL, t.id);
    const ev: { seen: boolean; raw: number }[] = [];
    w.events.on('breach', (e) => ev.push({ seen: w.vis.isSeen(e.cell), raw: w.light.surfaceRaw(e.cell) }));
    for (let s = 0; s < 60 * 45; s++) {
      t.gx = p.x;
      t.gz = p.z;
      t.goals = w.goalCellsAt(p.x, p.z, 1);
      if (s === 60 * 25) p.yaw = -Math.PI / 2;
      w.step(1 / 60);
    }
    console.log(`floor eruptions: ${ev.length}`);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e.seen).toBe(false);
      expect(e.raw).toBeLessThan(LIGHT.darkThreshold);
    }
  });
});
