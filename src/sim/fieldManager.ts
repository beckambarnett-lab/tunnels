import { FIELD } from '../config';
import { buildField, FieldParams, paramsKey } from './flowfield';
import { Grid } from './grid';
import { LightMap } from './light';

export interface Field {
  key: string;
  goals: number[];
  goalsKey: string;
  params: FieldParams;
  dist: Float32Array | null;
  next: Int32Array | null;
  builtGridVersion: number;
  builtLightVersion: number;
  builtGoalsKey: string;
  lastBuild: number;
  pending: boolean;
  lastUsed: number;
  builds: number;
}

export const defaultParams = (over: Partial<FieldParams> = {}): FieldParams => ({
  allowDig: true,
  allowUnder: false,
  openCost: FIELD.openCost,
  digCost: FIELD.digCost,
  underCost: FIELD.underCost,
  burrowCost: FIELD.burrowCost,
  layerChangeCost: FIELD.layerChangeCost,
  lightCost: FIELD.lightCost,
  lightFloor: 0.02,
  ...over,
});

/**
 * Owns every flow field. Tendrils ask for a field by (name, goals, params); tendrils that share
 * a name share one field. Rebuilds happen only when the grid, the light map or the goals change,
 * throttled per field, and run in a Web Worker (or synchronously in Node tests).
 */
export class FieldManager {
  fields = new Map<string, Field>();
  worker: Worker | null = null;
  jobs = 0;
  stats = { builds: 0, lastMs: 0, avgMs: 0, pending: 0 };
  private sentGridVersion = -1;
  private sentLightVersion = -1;
  private sentBurrowVersion = -1;
  burrowVersion = 0;

  constructor(public grid: Grid, public light: LightMap, useWorker: boolean) {
    if (useWorker && typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('./flowWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onBuilt(e.data);
    }
  }

  get(name: string, goals: number[], params: FieldParams, time: number): Field {
    const key = name + '|' + paramsKey(params);
    let f = this.fields.get(key);
    const goalsKey = goals.join(',');
    if (!f) {
      f = {
        key,
        goals,
        goalsKey,
        params,
        dist: null,
        next: null,
        builtGridVersion: -1,
        builtLightVersion: -1,
        builtGoalsKey: '',
        lastBuild: -1e9,
        pending: false,
        lastUsed: time,
        builds: 0,
      };
      this.fields.set(key, f);
    } else if (f.goalsKey !== goalsKey) {
      f.goals = goals;
      f.goalsKey = goalsKey;
    }
    f.lastUsed = time;
    return f;
  }

  /** Dispatch rebuilds for stale fields. Call once per frame. */
  update(time: number) {
    // evict unused fields
    for (const [k, f] of this.fields) if (time - f.lastUsed > 5) this.fields.delete(k);
    const stale: Field[] = [];
    for (const f of this.fields.values()) {
      if (f.pending) continue;
      const dirty =
        f.builtGridVersion !== this.grid.version || f.builtLightVersion !== this.light.version || f.builtGoalsKey !== f.goalsKey;
      if (!dirty) continue;
      // Goal or terrain changes rebuild quickly; light-only changes wait the full interval.
      const urgent = f.builtGoalsKey !== f.goalsKey || f.builtGridVersion !== this.grid.version || !f.dist;
      const wait = urgent ? FIELD.rebuildInterval * 0.5 : FIELD.rebuildInterval;
      if (time - f.lastBuild < wait) continue;
      stale.push(f);
    }
    if (!stale.length) return;
    if (this.worker) this.sendState();
    for (const f of stale) {
      f.pending = true;
      f.lastBuild = time;
      const gv = this.grid.version, lv = this.light.version;
      if (this.worker) {
        this.stats.pending++;
        this.worker.postMessage({ type: 'build', key: f.key, job: ++this.jobs, goals: f.goals, params: f.params });
        (f as any)._gv = gv;
        (f as any)._lv = lv;
        (f as any)._gk = f.goalsKey;
      } else {
        const r = buildField({
          w: this.grid.w,
          h: this.grid.h,
          cells: this.grid.cells,
          burrow: this.grid.burrow,
          light: this.light.eff,
          goals: f.goals,
          params: f.params,
        });
        this.apply(f, r.dist, r.next, r.ms, gv, lv, f.goalsKey);
      }
    }
  }

  private sendState() {
    if (!this.worker) return;
    if (this.sentGridVersion === this.grid.version && this.sentLightVersion === this.light.version && this.sentBurrowVersion === this.burrowVersion)
      return;
    this.sentGridVersion = this.grid.version;
    this.sentLightVersion = this.light.version;
    this.sentBurrowVersion = this.burrowVersion;
    this.worker.postMessage({
      type: 'state',
      w: this.grid.w,
      h: this.grid.h,
      cells: this.grid.cells.slice(),
      burrow: this.grid.burrow.slice(),
      light: this.light.eff.slice(),
    });
  }

  private onBuilt(m: any) {
    this.stats.pending = Math.max(0, this.stats.pending - 1);
    const f = this.fields.get(m.key);
    if (!f) return;
    this.apply(f, m.dist, m.next, m.ms, (f as any)._gv, (f as any)._lv, (f as any)._gk);
  }

  private apply(f: Field, dist: Float32Array, next: Int32Array, ms: number, gv: number, lv: number, gk: string) {
    f.dist = dist;
    f.next = next;
    f.pending = false;
    f.builtGridVersion = gv;
    f.builtLightVersion = lv;
    f.builtGoalsKey = gk;
    f.builds++;
    this.stats.builds++;
    this.stats.lastMs = ms;
    this.stats.avgMs = this.stats.avgMs * 0.9 + ms * 0.1;
  }

  dispose() {
    this.worker?.terminate();
  }
}
