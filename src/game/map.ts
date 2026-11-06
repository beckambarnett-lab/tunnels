import { CELL } from '../config';
import type { World } from '../sim/world';

/** Tab war map: explored tunnels, camp light, live wires, cut wires flashing, teammates. No minimap. */
export class WarMap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  open = false;
  xray = false; // truck driver's x-ray: every open space ahead (hive tunnels are fast lanes full of bugs)
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'map';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }
  show(on: boolean) {
    this.open = on;
    this.canvas.style.display = on ? 'block' : 'none';
  }
  draw(w: World, meId: string, time: number) {
    this.canvas.style.display = this.open || this.xray ? 'block' : 'none';
    if (!this.open && !this.xray) return;
    const c = this.canvas;
    c.width = c.clientWidth;
    c.height = c.clientHeight;
    const x = this.ctx, g = w.grid;
    const s = Math.min(c.width / g.w, c.height / g.h);
    const ox = (c.width - g.w * s) / 2, oy = (c.height - g.h * s) / 2;
    x.fillStyle = '#000';
    x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < g.n; i++) {
      if ((!g.explored[i] && !this.xray) || g.cells[i] !== 0) continue;
      const cx = i % g.w, cy = (i / g.w) | 0;
      const l = Math.min(1, w.light.raw[i]);
      const hive = g.dugAt[i] >= 0;
      x.fillStyle = l > 0.05 ? `rgb(${80 + l * 150},${70 + l * 120},${30})` : hive ? '#3a2418' : '#2a2a2e';
      x.fillRect(ox + cx * s, oy + cy * s, s + 0.5, s + 0.5);
    }
    const P = (wx: number, wz: number): [number, number] => [ox + (wx / CELL) * s, oy + (wz / CELL) * s];
    const flash = Math.sin(time * 10) > 0;
    for (const wr of w.camp.wires) {
      for (let k = 0; k < wr.points.length - 1; k++) {
        const [ax, ay] = P(wr.points[k].x, wr.points[k].z), [bx, by] = P(wr.points[k + 1].x, wr.points[k + 1].z);
        x.strokeStyle = wr.cuts.has(k) ? (flash ? '#f22' : '#400') : wr.live ? '#ec4' : '#555';
        x.lineWidth = wr.cuts.has(k) ? 3 : 1.5;
        x.beginPath();
        x.moveTo(ax, ay);
        x.lineTo(bx, by);
        x.stroke();
      }
    }
    for (const d of w.camp.devices) {
      const [px, py] = P(d.x, d.z);
      x.fillStyle = d.kind === 'generator' ? (d.running ? '#4f4' : '#363') : d.powered ? '#ffd' : '#666';
      x.fillRect(px - 3, py - 3, 6, 6);
    }
    for (const p of w.players) {
      const [px, py] = P(p.x, p.z);
      x.fillStyle = p.id === meId ? '#6cf' : '#fc6';
      x.beginPath();
      x.moveTo(px + Math.sin(p.yaw) * 8, py + Math.cos(p.yaw) * 8);
      x.lineTo(px + Math.sin(p.yaw + 2.5) * 5, py + Math.cos(p.yaw + 2.5) * 5);
      x.lineTo(px + Math.sin(p.yaw - 2.5) * 5, py + Math.cos(p.yaw - 2.5) * 5);
      x.fill();
    }
    if (this.xray) {
      const sw = w.swarm;
      x.fillStyle = 'rgba(255,60,40,0.8)';
      for (let i = 0; i < sw.count; i += 2) if (sw.alive[i]) {
        const [px, py] = P(sw.x[i], sw.z[i]);
        x.fillRect(px, py, 1.5, 1.5);
      }
      const f = w.finale;
      if (f) {
        const [tx, ty] = P(f.truck.x, f.truck.z);
        x.fillStyle = '#ff0';
        x.fillRect(tx - 4, ty - 4, 8, 8);
        if (f.queen.alive) {
          const [qx, qy] = P(f.queen.x, f.queen.z);
          x.fillStyle = '#f0f';
          x.beginPath();
          x.arc(qx, qy, 7, 0, 6.3);
          x.fill();
        }
      }
    }
    x.fillStyle = '#888';
    x.font = '12px monospace';
    x.fillText('WAR MAP — explored tunnels, camp light, live wires (yellow), cut wires (flashing red)', 10, 18);
  }
}
