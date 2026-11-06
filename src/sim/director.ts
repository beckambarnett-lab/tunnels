import { DIRECTOR, LIGHT } from '../config';
import type { World } from './world';

export type DirectorState = 'Build Up' | 'Sustain Peak' | 'Peak Fade' | 'Relax';

/**
 * Hive Director (GDD): an invisible pacing system separate from the queen. It decides *when* and
 * *how hard* the hive may push with a Left 4 Dead-style loop inside the act's slow curve, and pulls
 * the levers: the queen's aggression budget and max tendril size, where breaches may open, hive
 * oil yield, flare placement and how fast learning fallbacks arrive. Never shown to players.
 */
export class Director {
  state: DirectorState = 'Build Up';
  since = 0;
  act = 3;
  intensity = new Map<string, number>();
  team = 0;
  sustainFor = 4;
  scripted = false; // boss fight / sunrise chase are exempt
  log: string[] = [];
  private lastOverwhelm = new Map<string, number>();
  private calmFor = 0;

  constructor(public w: World) {
    w.events.on('downed', (e) => this.bump(e.id, 0.5));
  }

  get actCfg() {
    return DIRECTOR.acts[this.act] ?? DIRECTOR.acts[3];
  }
  /** Lever: the queen's aggression budget (0..1 of the act's ceiling). */
  get budget() {
    const c = this.actCfg.budget;
    switch (this.state) {
      case 'Build Up':
        return c;
      case 'Sustain Peak':
        return c;
      case 'Peak Fade':
        return 0; // no new tendrils; the current fight plays out
      case 'Relax':
        return 0;
    }
  }
  get maxTendril() {
    // tendril sizes scale quietly with player count; solo runs a gentler budget
    const n = Math.max(1, this.w.players.length);
    return Math.round(this.actCfg.maxTendril * (n === 1 ? 0.7 : 0.7 + 0.1 * n));
  }
  get allowNewTendrils() {
    return this.state === 'Build Up' || this.state === 'Sustain Peak';
  }

  /** Open the run with a calm spell of `secs` seconds (Relax, then the normal loop). */
  startRelaxed(secs: number) {
    this.state = 'Relax';
    this.since = this.w.time - (this.actCfg.relax - secs);
  }

  bump(id: string, a: number) {
    this.intensity.set(id, Math.min(1, (this.intensity.get(id) || 0) + a));
  }

  private set(s: DirectorState, why: string) {
    if (s === this.state) return;
    const line = `[director t=${this.w.time.toFixed(1)}] ${this.state} -> ${s} (${why}; team intensity ${this.team.toFixed(2)})`;
    console.log(line);
    this.log.push(line);
    if (this.log.length > 100) this.log.shift();
    this.state = s;
    this.since = this.w.time;
    if (s === 'Sustain Peak') this.sustainFor = DIRECTOR.sustainMin + this.w.rng.next() * (DIRECTOR.sustainMax - DIRECTOR.sustainMin);
    this.w.events.emit('directorState', { state: s });
  }

  step(dt: number) {
    const w = this.w;
    const sw = w.swarm;
    const spentPerMin = w.fuel.spentLastMinute(w.time);
    let team = 0;
    for (const p of w.players) {
      if (!p.alive) continue;
      let v = this.intensity.get(p.id) || 0;
      // rises with contact, damage, darkness, the swarm close by, fuel spent in the last minute
      const dmg = Math.max(0, p.overwhelm - (this.lastOverwhelm.get(p.id) || 0));
      this.lastOverwhelm.set(p.id, p.overwhelm);
      let close = 0;
      sw.hash.forEachNear(p.x, p.z, 6, (j) => {
        if (sw.alive[j] && !sw.layer[j]) close++;
      });
      const dark = w.light.rawAt(p.x, p.z) < LIGHT.darkThreshold ? 1 : 0;
      const rise = p.touching * 0.03 + dmg * 1.5 + dark * 0.01 + Math.min(1, close / 60) * 0.04 + Math.min(1, spentPerMin / 120) * 0.01;
      v += rise * dt * 10 * (p.downed ? 0 : 1);
      // decays during calm
      if (rise < 0.005) v -= DIRECTOR.decayPerSec * dt;
      v = Math.max(0, Math.min(1, v));
      this.intensity.set(p.id, v);
      if (v > team) team = v;
    }
    this.team = team; // the director uses the highest player's intensity
    if (this.scripted) return;
    const el = w.time - this.since;
    switch (this.state) {
      case 'Build Up':
        if (team >= DIRECTOR.peakThreshold) this.set('Sustain Peak', 'intensity crossed the peak threshold');
        break;
      case 'Sustain Peak':
        if (el >= this.sustainFor) this.set('Peak Fade', `held the peak for ${el.toFixed(1)} s`);
        break;
      case 'Peak Fade': {
        // the fight resolves naturally: nobody touched, few bugs striking, intensity falling
        const touching = w.players.some((p) => p.touching > 0);
        this.calmFor = touching || sw.stats.strike > 10 ? 0 : this.calmFor + dt;
        if ((this.calmFor > 3 && team < DIRECTOR.peakThreshold) || el > 30) this.set('Relax', el > 30 ? 'fade timed out' : 'the fight resolved');
        break;
      }
      case 'Relax':
        if (el >= this.actCfg.relax) this.set('Build Up', `relax timer for act ${this.act} ran out (${this.actCfg.relax} s)`);
        break;
    }
    // levers
    w.breachAllowed = this.state !== 'Relax';
    // hive oil: generous when the team struggles, lean when it cruises
    const struggling = w.fuel.value < 500 || team > 0.6;
    // (capped so a zapper harvest never pays back what it cost: 2.5 per body < 3 per zap kill)
    w.camp.oilYieldMul = struggling ? 1.25 : team < 0.15 ? 0.75 : 1;
    // learning fallbacks come sooner for teams that cruise
    if (w.learning) w.learning.fallbackMul = team < 0.15 ? 0.85 : 1;
  }
}
