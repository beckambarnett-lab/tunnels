import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { MemoryHub, MemoryTransport } from '../src/net/transport';
import { NetSession } from '../src/net/session';
import { generateWorld } from '../src/sim/worldgen';
import { emptyInput } from '../src/sim/actions';
import { newItem } from '../src/sim/camp';

describe('gate-4 scenario over the in-memory transport', () => {
  it('client is downed, devoured, steers its body to a lit live cable and is rebuilt', () => {
    const orig = console.log;
    const logs: string[] = [];
    console.log = (...a: any[]) => logs.push(String(a[0]));
    try {
      const hub = new MemoryHub();
      const host = new World({ seed: 3, bugs: 500, role: 'host' });
      const pristine = generateWorld(3).grid.cells.slice();
      const hp = host.addPlayer('host', host.layout.start.x, host.layout.start.z);
      hp.slots = [newItem('flashlight'), null, null];
      const hs = new NetSession(new MemoryTransport(hub, 'host', true), host, 'host', pristine);
      hs.attach(host, pristine);
      let client: World | null = null;
      const cs = new NetSession(new MemoryTransport(hub, 'c1', false), null, 'c1', null);
      cs.onWelcome = (snap) => {
        client = new World({ seed: snap.seed, bugs: snap.targetBugs, role: 'client' });
        cs.applyWelcome(client, snap);
        cs.attach(client, null);
      };
      let clientMove: () => [number, number] = () => [0, 0];
      const step = (secs: number, until?: () => boolean) => {
        for (let t = 0; t < secs; t += 1 / 20) {
          if (until?.()) return true;
          hp.overwhelm = 0;
          hs.hostApplyInputs(1 / 20);
          host.step(1 / 20);
          hs.hostBroadcast(1 / 20);
          hub.deliver();
          if (client) {
            const me = client.players.find((p) => p.id === 'c1')!;
            cs.clientSend(emptyInput(), { x: me.x, z: me.z, yaw: me.yaw, pitch: 0, crouch: false, move: clientMove() });
            client.step(1 / 20);
          }
          hub.deliver();
        }
        return until?.() ?? true;
      };
      step(15);
      // camp: generator, lamp, live cable lying in the lamp light
      const c = host.camp;
      hp.carrying = newItem('generator');
      const gen = c.place(hp)!;
      let lamp: any = null;
      for (let k = 0; k < 16 && !lamp; k++) {
        hp.slots = [newItem('lamp'), null, null];
        hp.sel = 0;
        hp.yaw = (k / 16) * Math.PI * 2;
        hp.x = gen.x + Math.sin(hp.yaw) * 1.6;
        hp.z = gen.z + Math.cos(hp.yaw) * 1.6;
        if (host.grid.isOpenAt(hp.x, hp.z)) lamp = c.place(hp);
      }
      hp.slots[1] = newItem('spool');
      hp.sel = 1;
      hp.x = gen.x;
      hp.z = gen.z;
      c.startWire(hp, gen);
      hp.x = lamp.x;
      hp.z = lamp.z;
      step(0.3);
      c.connectWire(hp, lamp);
      hp.slots[1] = newItem('spool');
      hp.x = gen.x;
      hp.z = gen.z;
      c.startWire(hp, gen);
      hp.x = lamp.x + 0.6;
      hp.z = lamp.z + 0.6;
      step(0.3);
      c.dropWireEnd(hp);
      hp.x = gen.x - 1.5;
      hp.z = gen.z;
      const target = { x: lamp.x + 0.3, z: lamp.z + 0.3 };
      // down the client far away in the dark
      const p = host.players.find((q) => q.id === 'c1')!;
      let spot: any = null, best = -1;
      for (let i = 0; i < host.grid.n; i += 3) {
        if (host.grid.cells[i] !== 0 || host.light.rawAt(host.grid.centerX(i), host.grid.centerZ(i)) > 0.02) continue;
        const x = host.grid.centerX(i), z = host.grid.centerZ(i);
        const d = Math.hypot(x - gen.x, z - gen.z), dh = Math.hypot(x - host.layout.hive.x, z - host.layout.hive.z);
        const score = Math.min(d, 25) + Math.min(dh, 15);
        if (d > 8 && dh > 8 && score > best) (best = score), (spot = { x, z });
      }
      p.x = spot.x;
      p.z = spot.z;
      p.downed = true;
      p.overwhelm = 1;
      const devoured = step(200, () => p.hive);
      expect(devoured).toBe(true);
      // the client steers along a field toward the lit cable
      const cw = client!;
      const me = cw.players.find((q) => q.id === 'c1')!;
      const goals = cw.goalCellsAt(target.x, target.z, 1);
      const params = { allowDig: false, allowUnder: false, openCost: 1, digCost: 7, underCost: 9, burrowCost: 3, layerChangeCost: 4, lightCost: 0, lightFloor: 1 };
      let resting = false;
      clientMove = () => {
        // a sensible hive player: rest (obey) when will runs low, then push again
        if (me.will < 0.2) resting = true;
        if (resting && me.will > 0.7) resting = false;
        if (resting) return [0, 0];
        const f = cw.fields.get('gate-ritual', goals, params, cw.time);
        const l0 = Math.hypot(target.x - me.hiveX, target.z - me.hiveZ);
        if (l0 < 0.5) return [0, 0];
        let cc = cw.grid.cellAt(me.hiveX, me.hiveZ);
        if (f.next && cc >= 0) for (let k = 0; k < 6; k++) { const n = f.next[cc]; if (n < 0 || n >= cw.grid.n) break; cc = n; }
        const tx = f.next ? cw.grid.centerX(cc) : target.x, tz = f.next ? cw.grid.centerZ(cc) : target.z;
        const dx = tx - me.hiveX, dz = tz - me.hiveZ, l = Math.hypot(dx, dz) || 1;
        return [dx / l, dz / l];
      };
      const trace: string[] = [];
      let k = 0;
      // the living teammate keeps the camp lit (repairs cuts and the lamp) as a team would
      const keepCamp = () => {
        for (const d of c.devices) {
          if (d.broken) (d.broken = false), (d.hp = 1);
          if (d.kind === 'generator') d.running = true;
        }
        for (const wr of c.wires) wr.cuts.clear();
        // and burns the queen's bugs off the struggling body (her tendril tries to break it up)
        if (p.ritualStage >= 1) {
          const sw = host.swarm, ht = host.death.hiveTendrils.get('c1');
          sw.hash.forEachNear(p.hiveX, p.hiveZ, 3, (j) => {
            if (sw.alive[j] && sw.tendril[j] !== ht?.id && sw.state[j] !== 4) sw.kill(j, 'zap', host.events);
          });
        }
      };
      const back = step(400, () => {
        keepCamp();
        if (k++ % 200 === 0) trace.push(`t=${host.time.toFixed(0)} d=${Math.hypot(target.x - p.hiveX, target.z - p.hiveZ).toFixed(1)} will=${p.will.toFixed(2)} stage=${p.ritualStage} ritual=${p.ritual.toFixed(2)} members=${host.death.hiveTendrils.get('c1')?.members} order="${p.order}" dir=${host.director.state} run=${host.runState}:${host.failReason} move=${p.hiveMove.map((v) => v.toFixed(2))} light=${host.light.rawAt(p.hiveX, p.hiveZ).toFixed(2)}`);
        return !p.hive;
      });
      console.log = orig;
      console.log(trace.join('\n'));
      expect(back).toBe(true);
    } finally {
      console.log = orig;
    }
  }, 600000);
});
