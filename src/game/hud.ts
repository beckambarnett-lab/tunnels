import type { SimPlayer } from '../sim/world';

/**
 * Minimal, mostly diegetic HUD. Damage shows as bugs crawling in from the screen edges
 * (GDD), not a health bar.
 */
export class Hud {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  msg: HTMLElement;
  hint: HTMLElement;
  crawlers: { e: number; t: number; s: number; a: number }[] = [];
  constructor() {
    this.root = document.getElementById('hud')!;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    this.root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    const ch = document.createElement('div');
    ch.className = 'crosshair';
    this.root.appendChild(ch);
    this.msg = document.createElement('div');
    this.msg.className = 'center-msg';
    this.root.appendChild(this.msg);
    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.root.appendChild(this.hint);
    for (let i = 0; i < 90; i++) this.crawlers.push({ e: Math.floor(Math.random() * 4), t: Math.random(), s: 0.6 + Math.random() * 0.8, a: Math.random() * 6 });
  }

  update(p: SimPlayer, time: number, extra: { locked: boolean }) {
    const c = this.canvas;
    const w = (c.width = innerWidth), h = (c.height = innerHeight);
    const x = this.ctx;
    x.clearRect(0, 0, w, h);
    const ov = p.overwhelm;
    const n = Math.floor(ov * this.crawlers.length);
    for (let i = 0; i < n; i++) {
      const b = this.crawlers[i];
      const depth = (0.04 + ov * 0.22) * (0.5 + 0.5 * Math.sin(time * 2 * b.s + b.a)) + 0.01;
      let px = 0, py = 0, ang = 0;
      const along = (b.t + time * 0.02 * b.s) % 1;
      if (b.e === 0) (px = along * w), (py = depth * h), (ang = Math.PI / 2);
      else if (b.e === 1) (px = along * w), (py = h - depth * h), (ang = -Math.PI / 2);
      else if (b.e === 2) (px = depth * w), (py = along * h), (ang = 0);
      else (px = w - depth * w), (py = along * h), (ang = Math.PI);
      ang += Math.sin(time * 7 * b.s + b.a) * 0.4;
      this.bug(px, py, ang, 9 * b.s, time * 20 * b.s + b.a);
    }
    if (ov > 0.05) {
      const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(20,0,0,${Math.min(0.85, ov)})`);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
    this.msg.textContent = p.downed ? 'OVERWHELMED' : '';
    this.hint.textContent = extra.locked ? '' : 'Click to play';
  }

  private bug(x: number, y: number, a: number, s: number, ph: number) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.strokeStyle = 'rgba(15,10,8,0.95)';
    c.fillStyle = 'rgba(25,18,12,0.95)';
    c.lineWidth = Math.max(1, s * 0.12);
    for (let k = 0; k < 4; k++) {
      const lx = (k - 1.5) * s * 0.35, sw = Math.sin(ph + k * 1.7) * s * 0.2;
      c.beginPath();
      c.moveTo(lx, 0);
      c.lineTo(lx + sw, -s * 0.9);
      c.moveTo(lx, 0);
      c.lineTo(lx - sw, s * 0.9);
      c.stroke();
    }
    c.beginPath();
    c.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
