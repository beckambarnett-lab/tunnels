import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../src/sim/spatialHash';
import { Rng } from '../src/core/rng';

describe('spatial hash', () => {
  it('returns every item within the radius', () => {
    const r = new Rng(3);
    const N = 2000;
    const xs = new Float32Array(N), zs = new Float32Array(N);
    const h = new SpatialHash(50, 50, 1, N);
    for (let i = 0; i < N; i++) {
      xs[i] = r.next() * 50;
      zs[i] = r.next() * 50;
      h.insert(i, xs[i], zs[i]);
    }
    for (let k = 0; k < 50; k++) {
      const qx = r.next() * 50, qz = r.next() * 50, rad = 0.5 + r.next() * 2;
      const got = new Set<number>();
      h.forEachNear(qx, qz, rad, (j) => {
        if ((xs[j] - qx) ** 2 + (zs[j] - qz) ** 2 <= rad * rad) got.add(j);
      });
      let expected = 0;
      for (let i = 0; i < N; i++) if ((xs[i] - qx) ** 2 + (zs[i] - qz) ** 2 <= rad * rad) {
        expected++;
        expect(got.has(i)).toBe(true);
      }
      expect(got.size).toBe(expected);
    }
  });
});
