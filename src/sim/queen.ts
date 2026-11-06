import { SWARM } from '../config';
import { defaultParams } from './fieldManager';
import { makeTendril, Tendril, TendrilMode } from './tendril';
import type { World, SimPlayer } from './world';

/**
 * Milestone-1 queen: decides about once a second, owns the tendrils, and gives each one a goal,
 * a mode and field parameters. Bugs only steer. Milestone 3 replaces the decision part with the
 * full utility AI (intents, influence maps, learning) and the Hive Director.
 *
 * M1 rules:
 *  - one tendril per ~100 bugs, each aimed at a player; every third tendril undermines (under layer)
 *  - tendrils mass at the edge of the light, then strike only when an opening exists
 *    (player in the dark, or their back is dark and the flamethrower has been silent)
 *  - heavy burn losses make the swarm retreat for a while
 */
export class Queen {
  thinkTimer = 0;
  phase: 'mass' | 'strike' | 'retreat' = 'mass';
  phaseSince = 0;
  burnDeaths: number[] = [];
  log: string[] = [];

  constructor(public w: World) {
    w.events.on('bugDeath', (e) => {
      if (e.cause === 'fire') this.burnDeaths.push(w.time);
    });
  }

  opening(p: SimPlayer): boolean {
    const w = this.w;
    if (!p.alive || p.downed) return false;
    const eff = w.light.effAt(p.x, p.z);
    if (eff < SWARM.tolerance) return true; // standing in the dark
    // their back: a point 1 m behind them
    const bx = p.x - Math.sin(p.yaw) * 1.0, bz = p.z - Math.cos(p.yaw) * 1.0;
    const back = w.grid.isOpenAt(bx, bz) ? w.light.effAt(bx, bz) : 1;
    return back < SWARM.tolerance && w.time - p.lastFired > 1.5;
  }

  update(dt: number) {
    const w = this.w;
    this.thinkTimer -= dt;
    // keep goals fresh every frame (players move)
    for (const t of w.tendrils.values()) this.refreshGoal(t);
    if (this.thinkTimer > 0) return;
    this.thinkTimer = 1.0;
    this.burnDeaths = this.burnDeaths.filter((t) => w.time - t < 5);
    const players = w.players.filter((p) => p.alive && !p.downed);
    const since = w.time - this.phaseSince;
    let phase = this.phase;
    if (this.burnDeaths.length > 60 && phase !== 'retreat') phase = 'retreat';
    else if (phase === 'retreat' && since > 8) phase = 'mass';
    else if (phase === 'mass' && since > 14 && players.some((p) => this.opening(p))) phase = 'strike';
    else if (phase === 'strike' && since > 9) phase = 'mass';
    if (phase !== this.phase) {
      this.phase = phase;
      this.phaseSince = w.time;
      this.note(`phase -> ${phase}`);
      w.events.emit('queenPhase', { phase });
    }
    this.syncTendrils(players);
  }

  private syncTendrils(players: SimPlayer[]) {
    const w = this.w;
    const want = Math.max(1, Math.round(w.swarm.active / 100));
    const list = [...w.tendrils.values()];
    while (list.length < want) {
      const t = makeTendril({ params: defaultParams(), born: w.time });
      w.tendrils.set(t.id, t);
      list.push(t);
    }
    while (list.length > want) w.tendrils.delete(list.pop()!.id);
    list.forEach((t, k) => {
      const target = players.length ? players[k % players.length] : null;
      t.targetId = target?.id;
      const undermine = k % 3 === 2;
      const mode: TendrilMode = this.phase === 'retreat' || !target ? 'retreat' : this.phase === 'strike' ? 'strike' : 'mass';
      if (t.mode !== mode) {
        t.mode = mode;
        t.modeSince = w.time;
      }
      t.intent = undermine ? 'undermine' : 'probe';
      t.params = defaultParams({ allowUnder: undermine });
      this.refreshGoal(t);
    });
    // assign bugs to tendrils (stable by index)
    const sw = w.swarm;
    const ids = list.map((t) => t.id);
    const counts = new Map<number, number>();
    for (let i = 0; i < sw.count; i++) {
      if (!sw.alive[i]) continue;
      const id = ids[i % ids.length];
      sw.tendril[i] = id;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const t of list) t.members = counts.get(t.id) || 0;
  }

  refreshGoal(t: Tendril) {
    const w = this.w;
    if (t.mode === 'retreat' || !t.targetId) {
      t.fieldName = 'hive';
      t.gx = w.layout.hive.x;
      t.gz = w.layout.hive.z;
      if (!t.goals.length || t.fieldName !== 'hive') t.goals = w.goalCellsAt(t.gx, t.gz, 2);
      t.goals = w.goalCellsAt(t.gx, t.gz, 2);
      return;
    }
    const p = w.players.find((pp) => pp.id === t.targetId);
    if (!p) return;
    t.fieldName = 'player:' + p.id;
    t.gx = p.x;
    t.gz = p.z;
    t.goals = w.goalCellsAt(p.x, p.z, 1);
  }

  note(s: string) {
    const line = `[queen t=${this.w.time.toFixed(1)}] ${s}`;
    this.log.push(line);
    if (this.log.length > 200) this.log.shift();
  }
}
