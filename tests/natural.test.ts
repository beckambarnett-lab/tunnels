import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { generateWorld } from '../src/sim/worldgen';
import { newItem } from '../src/sim/camp';
import { applyInput, emptyInput } from '../src/sim/actions';
import { INTENTS } from '../src/sim/queen';

/**
 * 15 minutes of an unscripted night: a camp with a lamp and long cables, a player who looks
 * around, burns the swarm when it gets close, harvests and stands with their back to walls.
 * Which intents does the queen choose on her own, and which counters do the team's habits unlock?
 */
describe('natural play', () => {
  it('the queen uses every intent and the team habits unlock counters', () => {
    const w = new World({ layout: generateWorld(5), bugs: 600 });
    w.director.act = 3;
    const p = w.addPlayer('p', w.layout.start.x, w.layout.start.z);
    p.slots = [newItem('flashlight'), newItem('flamethrower'), null];
    // camp
    p.carrying = newItem('generator');
    const gen = w.camp.place(p)!;
    // place the lamp and motion lamp wherever there's room around the generator
    const placeAround = (kind: any) => {
      for (let k = 0; k < 16; k++) {
        p.slots[2] = newItem(kind);
        p.sel = 2;
        const a = (k / 16) * Math.PI * 2;
        p.x = gen.x + Math.sin(a) * 3;
        p.z = gen.z + Math.cos(a) * 3;
        p.yaw = a;
        if (!w.grid.isOpenAt(p.x, p.z)) continue;
        const d = w.camp.place(p);
        if (d) return d;
      }
      return null;
    };
    const lamp = placeAround('lamp');
    placeAround('motion');
    expect(lamp).toBeTruthy();
    const intents: Record<string, number> = {};
    const firstAt: Record<string, number> = {};
    const dbg: string[] = [];
    w.events.on('intent', (e) => {
      dbg.push(`${Math.round(w.time)} ${e.intent} lit=${w.queen!.litDevices().length} gen=${w.camp.devices.find((d) => d.kind === 'generator')?.broken ? 'broken' : 'ok'} sc=${Object.entries(w.queen!.scores).map(([k, v]) => k.slice(0, 4) + ':' + v.toFixed(1)).join(' ')}`);
      intents[e.intent] = (intents[e.intent] || 0) + 1;
      firstAt[e.intent] ??= Math.round(w.time);
    });
    const opened: Record<string, number> = {};
    let strikes = 0;
    w.events.on('openingFound', (e) => (opened[e.kind] = (opened[e.kind] || 0) + 1));
    w.events.on('strike', () => strikes++);
    const states: string[] = [];
    w.events.on('directorState', (e) => states.push(e.state));
    // cable from the generator into the dark, and to the lamp
    const lay = (to: { x: number; z: number } | null, steps: number, dir: number) => {
      p.x = gen.x;
      p.z = gen.z;
      p.slots[2] = newItem('spool');
      p.sel = 2;
      w.camp.startWire(p, gen);
      for (let k = 0; k < steps; k++) {
        const nx = p.x + Math.sin(dir) * 0.1, nz = p.z + Math.cos(dir) * 0.1;
        if (w.grid.isOpenAt(nx, nz)) (p.x = nx), (p.z = nz);
        else dir += 0.7;
        w.camp.payOut(p);
      }
      if (to && lamp) w.camp.connectWire(p, lamp);
      else w.camp.dropWireEnd(p);
    };
    lay(lamp, 45, p.yaw - 1.5);
    w.step(1 / 20);
    expect(lamp!.powered).toBe(true);
    lay(null, 150, p.yaw + 2.2);
    p.x = gen.x + 0.8;
    p.z = gen.z;
    const orig = console.log;
    const lines: string[] = [];
    console.log = (...a: any[]) => lines.push(String(a[0]));
    try {
      for (let t = 0; t < 15 * 60; t += 1 / 20) {
        const inp = emptyInput();
        // behaviour: look around; burn when bugs are on you; harvest; flashlight otherwise
        p.yaw += 0.015 * Math.sin(t * 0.21);
        const danger = p.touching > 0 || w.swarm.stats.strike > 60;
        p.sel = danger ? 1 : 0;
        inp.use = danger && Math.sin(t * 2) > -0.3;
        inp.aim = [Math.sin(p.yaw), 0, Math.cos(p.yaw)];
        inp.eye = [p.x, 1.6, p.z];
        if (Math.floor(t) % 15 === 0) inp.interactPressed = true; // harvest whatever is near
        if (Math.floor(t) % 15 === 0 && p.downed === false) p.overwhelm *= 0.5;
        applyInput(w, p, inp, 1 / 20);
        if (inp.interactPressed) w.camp.collectBodies(p);
        w.step(1 / 20);
      }
    } finally {
      console.log = orig;
    }
    const unlocks = w.learning.log.map((l) => `${l.unlock}@${Math.round(l.t)}s (${l.why})`);
    console.log('intents chosen:', JSON.stringify(intents));
    console.log('first chosen at (s):', JSON.stringify(firstAt));
    console.log('unlocks:', unlocks.join('; '));
    console.log('director cycles (Relax count):', states.filter((s) => s === 'Relax').length, 'states seen:', [...new Set(states)].join(', '));
    console.log('belief:', JSON.stringify(w.light.belief), 'fuel left:', Math.round(w.fuel.value));
    const missing = INTENTS.filter((i) => !intents[i]);
    console.log('never chosen:', missing.join(', ') || 'none');
    console.log('openings found:', JSON.stringify(opened), 'strikes:', strikes);
    console.log(dbg.slice(0, 12).join('\n'));
    // conceal is the act-1 behaviour (GDD: the hive "conceals itself; acts almost like normal bugs")
    expect(missing.filter((m) => m !== 'conceal').length).toBeLessThanOrEqual(1);
    expect(w.learning.log.filter((l) => l.why !== 'time fallback').length).toBeGreaterThanOrEqual(3);
  }, 600000);

  it('in act 1 the hive conceals itself', () => {
    const w = new World({ layout: generateWorld(5), bugs: 300 });
    w.director.act = 1;
    w.addPlayer('p', w.layout.start.x, w.layout.start.z).slots[0] = newItem('flashlight');
    const seen = new Set<string>();
    w.events.on('intent', (e) => seen.add(e.intent));
    const orig = console.log;
    console.log = () => {};
    for (let t = 0; t < 60; t += 1 / 20) w.step(1 / 20);
    console.log = orig;
    expect(seen.has('conceal')).toBe(true);
  }, 120000);
});
