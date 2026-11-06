/// <reference lib="webworker" />
// Flow-field rebuilds run here so the main thread stays smooth (GDD performance budget).
import { buildField, FieldInput } from './flowfield';

let state: { w: number; h: number; cells: Uint8Array; burrow: Uint8Array; light: Float32Array } | null = null;

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'state') {
    state = { w: m.w, h: m.h, cells: m.cells, burrow: m.burrow, light: m.light };
    return;
  }
  if (m.type === 'build' && state) {
    const inp: FieldInput = { ...state, goals: m.goals, params: m.params };
    const r = buildField(inp);
    (self as any).postMessage({ type: 'built', key: m.key, job: m.job, dist: r.dist, next: r.next, ms: r.ms }, [r.dist.buffer, r.next.buffer]);
  }
};
