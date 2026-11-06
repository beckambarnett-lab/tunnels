import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { MemoryHub, MemoryTransport } from '../src/net/transport';
import { NetSession } from '../src/net/session';
import { generateWorld } from '../src/sim/worldgen';
import { applyInput, emptyInput } from '../src/sim/actions';
import { newItem } from '../src/sim/camp';

function pair(seed = 3, bugs = 400) {
  const hub = new MemoryHub();
  const host = new World({ seed, bugs, role: 'host' });
  const pristine = generateWorld(seed).grid.cells.slice();
  const hp = host.addPlayer('host', host.layout.start.x, host.layout.start.z);
  hp.slots = [newItem('flashlight'), newItem('flamethrower'), newItem('spool')];
  const hs = new NetSession(new MemoryTransport(hub, 'host', true), host, 'host', pristine);
  hs.attach(host, pristine);
  let client: World | null = null;
  const cs = new NetSession(new MemoryTransport(hub, 'c1', false), null, 'c1', null);
  cs.onWelcome = (snap, you) => {
    client = new World({ seed: snap.seed, bugs: snap.targetBugs, role: 'client' });
    cs.applyWelcome(client, snap);
    cs.attach(client, null);
  };
  return { hub, host, hs, cs, getClient: () => client! };
}

function stepBoth(env: ReturnType<typeof pair>, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30;
  for (let t = 0; t < secs; t += dt) {
    each?.(t);
    env.hs.hostApplyInputs(dt);
    env.host.step(dt);
    env.hs.hostBroadcast(dt);
    env.hub.deliver();
    const c = env.getClient();
    if (c) {
      const me = c.players.find((p) => p.id === 'c1');
      if (me) env.cs.clientSend({ ...emptyInput(), aim: [Math.sin(me.yaw), 0, Math.cos(me.yaw)], eye: [me.x, 1.6, me.z] }, { x: me.x, z: me.z, yaw: me.yaw, pitch: 0, crouch: false, move: [0, 0] });
      c.step(dt);
    }
    env.hub.deliver();
  }
}

function divergence(a: World, b: World) {
  let err = 0, n = 0, aliveMismatch = 0;
  for (let i = 0; i < a.swarm.count; i++) {
    if (!!a.swarm.alive[i] !== !!b.swarm.alive[i]) aliveMismatch++;
    if (a.swarm.alive[i] && b.swarm.alive[i]) {
      err += Math.hypot(a.swarm.x[i] - b.swarm.x[i], a.swarm.z[i] - b.swarm.z[i]);
      n++;
    }
  }
  return { mean: n ? err / n : 0, aliveMismatch, n };
}

describe('host / client sync (in-memory transport)', () => {
  it('a client joins, gets the world and sees the same swarm', () => {
    const env = pair();
    stepBoth(env, 3);
    const c = env.getClient();
    expect(c).toBeTruthy();
    expect(c.players.map((p) => p.id).sort()).toEqual(['c1', 'host']);
    stepBoth(env, 20);
    const d = divergence(env.host, c);
    console.log(`after 20 s: mean bug position error ${d.mean.toFixed(3)} m over ${d.n} bugs, alive mismatches ${d.aliveMismatch}, max keyframe error ${env.cs.stats.maxMeanErr.toFixed(3)}`);
    expect(d.n).toBeGreaterThan(300);
    expect(d.mean).toBeLessThan(0.5);
    expect(d.aliveMismatch).toBeLessThan(20);
  }, 120000);

  it('digs, camp changes, fuel and the client player\'s actions stay in sync', () => {
    const env = pair(3, 300);
    stepBoth(env, 2);
    const c = env.getClient();
    // host digs a cell, places a generator
    const g = env.host.grid;
    let dug = -1;
    for (let i = 0; i < g.n && dug < 0; i++) if (g.cells[i] === 1 && g.isFace(i)) dug = i;
    g.dig(dug, env.host.time);
    const hp = env.host.players[0];
    hp.slots = [null, null, null];
    hp.carrying = newItem('generator');
    env.host.camp.place(hp);
    // the client places a lamp through its input
    const cp = env.host.players.find((p) => p.id === 'c1')!;
    cp.slots[0] = newItem('lamp');
    cp.sel = 0;
    stepBoth(env, 0.2);
    env.hs.inputs.set('c1', { ...emptyInput(), altPressed: true });
    stepBoth(env, 2);
    expect(c.grid.cells[dug]).toBe(0);
    expect(c.camp.devices.map((d) => d.kind).sort()).toEqual(env.host.camp.devices.map((d) => d.kind).sort());
    expect(env.host.camp.devices.some((d) => d.kind === 'lamp')).toBe(true);
    expect(Math.abs(c.fuel.value - env.host.fuel.value)).toBeLessThan(0.5);
    // the client's slot state comes from the host
    expect(c.players.find((p) => p.id === 'c1')!.slots[0]).toBeNull();
  }, 120000);

  it('stays in sync for 10 simulated minutes', () => {
    const env = pair(4, 500);
    let worst = 0;
    const checks: string[] = [];
    stepBoth(env, 600, (t) => {
      // the client wanders and turns; the host turns
      const c = env.getClient();
      const me = c?.players.find((p) => p.id === 'c1');
      if (me) me.yaw += 0.01;
      env.host.players[0].yaw -= 0.008;
      env.host.players.forEach((p) => (p.overwhelm = Math.min(p.overwhelm, 0.5)));
      if (c && Math.round(t * 30) % (30 * 60) === 0 && t > 1) {
        const d = divergence(env.host, c);
        worst = Math.max(worst, d.mean);
        let cellDiff = 0;
        for (let i = 0; i < c.grid.n; i++) if (c.grid.cells[i] !== env.host.grid.cells[i]) cellDiff++;
        checks.push(`t=${Math.round(t)}s err=${d.mean.toFixed(3)}m alive-mismatch=${d.aliveMismatch} cellDiff=${cellDiff} fuelDiff=${Math.abs(c.fuel.value - env.host.fuel.value).toFixed(2)} tendrils=${c.tendrils.size}/${env.host.tendrils.size}`);
        expect(cellDiff).toBe(0);
      }
    });
    console.log(checks.join('\n'));
    expect(worst).toBeLessThan(0.6);
  }, 600000);
});
