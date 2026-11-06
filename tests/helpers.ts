import { Grid, OPEN, SOLID } from '../src/sim/grid';
import { CELL } from '../src/config';
import type { WorldLayout } from '../src/sim/worldgen';

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

/** An open rectangular room of w x h cells. */
export function room(w: number, h: number): string[] {
  return Array.from({ length: h }, () => '.'.repeat(w));
}
