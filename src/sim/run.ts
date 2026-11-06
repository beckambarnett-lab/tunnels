import { CELL } from '../config';
import { makeLight, LightSource } from './light';
import { newItem } from './camp';
import { NightLayout, Z, Mark } from './night';
import type { World, SimPlayer } from './world';

export const SUIT = { speed: 1.25, flameRange: 1.4, digTime: 0.45 };
export const QUEEN_BOSS = { eggHp: 1, eggBurnPerSec: 0.35, rageToFlee: 1 };

/**
 * The full night (M5): acts follow the furthest zone the team has reached, milestone spaces and
 * oil rigs save checkpoints, the progression ladder is placed in the world (flashlights in the
 * house, fuel tanks at the intersection, Enlite suits in the junkyard, the truck by the queen),
 * and provoking the queen starts the finale.
 */
export class Run {
  act = 1;
  furthest = 0; // furthest main-path column reached
  jobKills = 0;
  jobTarget = 8;
  powerOn = true;
  plugOpen = false;
  houseLights: LightSource[] = [];
  used = new Set<string>(); // one-shot marks (rigs, tanks, suits) by "kind@x,z"
  eggs: { x: number; z: number; hp: number }[] = [];
  rage = 0;
  finale = false;
  checkpoints: string[] = [];
  log: string[] = [];
  radio: { t: number; text: string }[] = [];
  onCheckpoint: (name: string) => void = () => {};

  constructor(public w: World, public L: NightLayout) {
    for (const m of L.marks.filter((m) => m.kind === 'houselamp')) {
      const l = makeLight('lamp', { x: m.x, z: m.z, y: 2.4, radius: 6, intensity: 0.9, owner: 'house' });
      this.houseLights.push(l);
      w.staticLights.push(l);
    }
    this.eggs = L.marks.filter((m) => m.kind === 'egg').map((m) => ({ x: m.x, z: m.z, hp: QUEEN_BOSS.eggHp }));
    w.events.on('bugDeath', (e) => {
      if ((e.cause === 'zap' || e.cause === 'stomp') && this.zoneAt(e.x, e.z) === Z.house) this.jobKills++;
    });
    this.say('BOSS: Routine job, folks. Suburban house, bug problem. Spray it, zap it, invoice it.');
  }

  zoneAt(x: number, z: number) {
    const c = this.w.grid.cellAt(x, z);
    return c < 0 ? 0 : this.L.zone[c];
  }
  column(x: number) {
    return Math.floor((x / CELL - this.L.pad) / 32);
  }

  say(text: string) {
    this.radio.push({ t: this.w.time, text });
    this.w.events.emit('radio', { text });
    if (this.radio.length > 20) this.radio.shift();
  }

  private note(s: string) {
    const line = `[night t=${this.w.time.toFixed(1)}] ${s}`;
    console.log(line);
    this.log.push(line);
  }

  setAct(a: number, why: string) {
    if (a <= this.act) return;
    this.act = a;
    this.w.director.act = a;
    this.note(`act ${a}: ${why}`);
    this.w.events.emit('act', { act: a, why });
    if (a === 2) this.say("BOSS: You're under the house? Run a cable down from the generator and set up a base. Keep it tidy.");
    if (a === 3) this.say('BOSS: You are breaking up... (static) ...out of range...');
  }

  checkpoint(name: string) {
    if (this.checkpoints.includes(name)) return;
    this.checkpoints.push(name);
    this.note(`checkpoint: ${name}`);
    this.onCheckpoint(name);
    this.w.events.emit('checkpoint', { name });
  }

  /** Population lives in the nest pocket nearest ahead of the team. */
  private pickPocket() {
    const w = this.w;
    const lead = Math.max(...w.players.filter((p) => p.alive).map((p) => p.x), this.L.start.x);
    let best = this.L.pockets[0], bd = 1e9;
    for (const pk of this.L.pockets) {
      const d = pk.x - lead;
      const score = d < 6 ? 1e6 - d : d; // prefer pockets ahead of the leader
      if (score < bd) (bd = score), (best = pk);
    }
    if (best) w.layout.hiveCells = best.cells;
  }

  /** E-interactions with world marks (rigs, fuel tanks, suits). Returns a prompt if one is in reach. */
  markInReach(p: SimPlayer): Mark | null {
    for (const m of this.L.marks) {
      if (!['rig', 'tank', 'suit', 'truck'].includes(m.kind) || this.used.has(this.key(m))) continue;
      if (Math.hypot(m.x - p.x, m.z - p.z) < 2) return m;
    }
    return null;
  }
  key(m: Mark) {
    return `${m.kind}@${m.x.toFixed(1)},${m.z.toFixed(1)}`;
  }
  useMark(p: SimPlayer, m: Mark) {
    const w = this.w;
    const k = this.key(m);
    if (this.used.has(k)) return;
    if (m.kind === 'rig') {
      this.used.add(k);
      w.fuel.add(m.data?.fuel ?? 300, 'oilRig');
      w.events.emit('rig', { x: m.x, z: m.z, fuel: m.data?.fuel });
      this.note(`oil rig: +${m.data?.fuel} fuel`);
      this.checkpoint('oil rig ' + [...this.used].filter((u) => u.startsWith('rig@')).length);
    } else if (m.kind === 'tank') {
      // strap a big tank onto your sprayer: it becomes a flamethrower (real fire arrives)
      const k2 = p.slots.findIndex((s) => s?.kind === 'sprayer');
      if (k2 < 0) return;
      this.used.add(k);
      p.slots[k2] = newItem('flamethrower');
      w.events.emit('upgrade', { id: p.id, what: 'flamethrower' });
      this.checkpoint('the intersection');
    } else if (m.kind === 'suit') {
      if (p.suit) return;
      this.used.add(k);
      p.suit = true;
      w.events.emit('upgrade', { id: p.id, what: 'suit' });
      this.checkpoint('Enlite suits');
    } else if (m.kind === 'truck') {
      if (this.rage < QUEEN_BOSS.rageToFlee) return;
      this.used.add(k);
      w.events.emit('boardTruck', { id: p.id, x: m.x, z: m.z });
    }
  }

  /** Enlite suit digging: open the cell in front (X). */
  playerDig(p: SimPlayer) {
    if (!p.suit) return;
    const w = this.w, g = w.grid;
    const x = p.x + Math.sin(p.yaw) * 0.9, z = p.z + Math.cos(p.yaw) * 0.9;
    const c = g.cellAt(x, z);
    if (c < 0 || g.cells[c] !== 1) return;
    if (g.dig(c, w.time)) {
      g.dugAt[c] = -2; // player-dug: the hive moves into these too (takeOver)
      w.events.emit('playerDig', { cell: c, x, z });
    }
  }

  step(dt: number) {
    const w = this.w;
    const alive = w.players.filter((p) => p.alive && !p.hive);
    // progress
    for (const p of alive) this.furthest = Math.max(this.furthest, this.column(p.x));
    const zones = new Set(alive.map((p) => this.zoneAt(p.x, p.z)));
    if (zones.has(Z.base) || this.furthest >= 1) this.setAct(2, 'the team went down into the nest mouth');
    if (this.furthest >= 3) this.setAct(3, 'the team left the base behind');
    if (zones.has(Z.junkyard) || this.furthest >= 7) this.setAct(4, 'rusted logos: the ruins of Enlite');
    if (zones.has(Z.intersection)) this.checkpoint('the intersection');
    if (zones.has(Z.junkyard)) this.checkpoint('the junkyard');
    // act 1: the job, flashlights, the power dies, the basement opens
    if (this.act === 1) {
      const hasLight = w.players.some((p) => p.slots.some((s) => s?.kind === 'flashlight'));
      if (hasLight) this.checkpoint('flashlights');
      if (this.powerOn && this.jobKills >= this.jobTarget && hasLight) {
        this.powerOn = false;
        for (const l of this.houseLights) l.on = false;
        this.note('the hive chewed through the mains: the house goes dark');
        w.events.emit('powerDies', {});
        this.say('BOSS: Lights out? Probably the breaker. Check the basement.');
      }
      if (!this.powerOn && !this.plugOpen) {
        this.plugOpen = true;
        for (const i of this.L.plugCells) {
          w.grid.cells[i] = 1; // make it earth, then open it (a breach through the floor)
          w.grid.dig(i, w.time);
        }
        const m = this.L.plugCells[(this.L.plugCells.length / 2) | 0];
        w.events.emit('breach', { kind: 'floor', cell: m, x: w.grid.centerX(m), z: w.grid.centerZ(m) });
        this.note('the basement floor opens onto the nest');
      }
    }
    // the boss fight: burn her egg sacs; when her rage fills she abandons the nest
    if (!this.finale)
      for (const e of this.eggs) {
        if (e.hp <= 0) continue;
        const c = w.grid.cellAt(e.x, e.z);
        let heat = c >= 0 ? w.light.fire[c] : 0;
        for (const p of alive) if (p.firing && Math.hypot(p.x - e.x, p.z - e.z) < 6) heat += 0.5;
        if (heat > 0.3) {
          e.hp -= QUEEN_BOSS.eggBurnPerSec * dt;
          if (e.hp <= 0) {
            this.rage = Math.min(1, this.rage + 1 / this.eggs.length);
            w.events.emit('eggBurned', { x: e.x, z: e.z, rage: this.rage });
            this.note(`an egg sac burned; the queen's rage ${(this.rage * 100).toFixed(0)}%`);
            if (this.rage >= QUEEN_BOSS.rageToFlee) {
              this.note('the queen is provoked: she abandons the nest and hunts the team. Find the truck.');
              w.events.emit('queenProvoked', {});
              this.say('(a voice on a dead radio) ...Enlite... forever...');
            }
          }
        }
      }
    this.pickPocket();
    // act 1 runs a small swarm
    if (w.authority && w.targetBugs >= 0) w.targetBugs = this.act === 1 ? Math.min(w.targetBugs, 80) : Math.max(w.targetBugs, this.act >= 3 ? 600 : 300);
  }
}
