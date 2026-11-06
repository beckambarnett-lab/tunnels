import { CELL } from '../config';
import { Grid, OPEN, SOLID } from './grid';
import type { WorldLayout } from './worldgen';

/** Build a layout from ASCII rows: '.' open, '#' solid, 'H' hive (open), 'S' start (open). */
export function asciiLayout(rows: string[]): WorldLayout {
  const h = rows.length + 2, w = rows[0].length + 2;
  const g = new Grid(w, h);
  let start = { x: 0, z: 0 }, hive = { x: 0, z: 0 };
  const hiveCells: number[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const gx = x + 1, gy = y + 1;
      g.setRaw(gx, gy, ch === '#' ? SOLID : OPEN);
      if (ch === 'H') {
        hiveCells.push(g.idx(gx, gy));
        hive = { x: (gx + 0.5) * CELL, z: (gy + 0.5) * CELL };
      }
      if (ch === 'S') start = { x: (gx + 0.5) * CELL, z: (gy + 0.5) * CELL };
    }),
  );
  return { grid: g, placed: [], start, hive, hiveCells, pad: 1 };
}

/**
 * Benchmark hall: 60 x 40 m with a few pillars, earth all round (so they can dig),
 * the start in the middle and hive cells along the far walls.
 */
export function benchLayout(): WorldLayout {
  const W = 120, H = 80;
  const rows: string[] = [];
  for (let y = 0; y < H + 8; y++) {
    let r = '';
    for (let x = 0; x < W + 8; x++) {
      const inside = x >= 4 && y >= 4 && x < W + 4 && y < H + 4;
      let ch = inside ? '.' : '#';
      const px = (x - 4) % 30, py = (y - 4) % 26;
      if (inside && px >= 13 && px <= 16 && py >= 11 && py <= 14 && x > 10 && y > 10) ch = '#';
      if (inside && (x < 8 || x > W) && ch === '.') ch = 'H';
      if (x === 4 + W / 2 && y === 4 + Math.floor(H * 0.75)) ch = 'S';
      r += ch;
    }
    rows.push(r);
  }
  return asciiLayout(rows);
}
