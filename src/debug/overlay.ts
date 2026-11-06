/** FPS / frame-time / bug-count overlay (top left). */
export class Overlay {
  el: HTMLElement;
  frames: number[] = [];
  fps = 0;
  frameMs = 0;
  p95 = 0;
  private acc = 0;
  constructor() {
    this.el = document.getElementById('debug-overlay')!;
  }
  tick(dtMs: number) {
    this.frames.push(dtMs);
    if (this.frames.length > 120) this.frames.shift();
  }
  update(dt: number, lines: () => string[]) {
    this.acc -= dt;
    if (this.acc > 0) return;
    this.acc = 0.25;
    const f = this.frames;
    if (!f.length) return;
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    const sorted = [...f].sort((a, b) => a - b);
    this.p95 = sorted[Math.floor(sorted.length * 0.95)];
    this.fps = 1000 / avg;
    this.frameMs = avg;
    this.el.textContent = [`FPS ${this.fps.toFixed(0)}  frame ${avg.toFixed(1)} ms  p95 ${this.p95.toFixed(1)} ms`, ...lines()].join('\n');
  }
}
