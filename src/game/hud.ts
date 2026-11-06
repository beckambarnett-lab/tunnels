import type { SimPlayer, World } from '../sim/world';
import { ITEM_NAMES } from '../sim/camp';
import { CAMP } from '../config';

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
  fuelEl: HTMLElement;
  slotsEl: HTMLElement;
  promptEl: HTMLElement;
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
    this.fuelEl = document.createElement('div');
    this.fuelEl.className = 'wrist';
    this.root.appendChild(this.fuelEl);
    this.slotsEl = document.createElement('div');
    this.slotsEl.className = 'slots';
    this.root.appendChild(this.slotsEl);
    this.promptEl = document.createElement('div');
    this.promptEl.className = 'prompt';
    this.root.appendChild(this.promptEl);
    for (let i = 0; i < 90; i++) this.crawlers.push({ e: Math.floor(Math.random() * 4), t: Math.random(), s: 0.6 + Math.random() * 0.8, a: Math.random() * 6 });
  }

  private hiveEl: HTMLElement | null = null;
  private glare: HTMLElement | null = null;
  private failEl: HTMLElement | null = null;
  /** Downed / hive / failure screens. */
  updateDeath(w: World, p: SimPlayer, members: number, lightAtEye: number) {
    if (!this.hiveEl) {
      this.hiveEl = document.createElement('div');
      this.hiveEl.className = 'hivehud';
      this.root.appendChild(this.hiveEl);
      this.glare = document.createElement('div');
      this.glare.className = 'glare';
      this.root.appendChild(this.glare);
      this.failEl = document.createElement('div');
      this.failEl.className = 'fail';
      this.root.appendChild(this.failEl);
    }
    this.glare!.style.opacity = p.hive ? String(Math.min(0.92, lightAtEye * 1.6)) : '0';
    let html = '';
    if (p.downed && !p.hive)
      html = `<div class="big">OVERWHELMED</div><div>${p.carriedT > 0 ? `The swarm is carrying you to the queen… ${Math.max(0, 45 - p.carriedT).toFixed(0)} s` : 'Bugs are gathering on you'}</div><div>A teammate can scatter them and hold E on you to revive you${p.reviveT > 0 ? ` (${Math.round((p.reviveT / 3) * 100)}%)` : ''}</div>`;
    else if (p.hive) {
      const stage = p.ritualStage;
      const step =
        stage === 0
          ? `1. Gather a body: ${members} / 60 bugs (move through the swarm)`
          : stage === 1
            ? '2. Force the body into the light (your bugs hate it: it drains your will)'
            : `3. Hold it in the light — a live cable, the lightning gun or a bug zapper must shock it solid: ${Math.round(p.ritual * 100)}%`;
      html = `<div class="order">THE QUEEN: ${p.order || '…'}</div><div class="will"><span>WILL</span><i style="width:${(p.will * 100).toFixed(0)}%"></i></div><div>${step}</div><div class="small">WASD steers your bugs. Pushing against her orders drains your will; with no will left, they mostly go where she wants.</div>`;
    }
    this.hiveEl!.innerHTML = html;
    this.hiveEl!.style.display = html ? 'block' : 'none';
    this.failEl!.style.display = w.runState === 'failed' ? 'flex' : 'none';
    (this as any)._reason = w.failReason;
    if (w.runState === 'failed' && !w.run) this.failEl!.innerHTML = `<div class="big">THE NIGHT IS LOST</div><div>${w.failReason}</div><div class="small">Press Enter to start a new run</div>`;
  }

  private nightEl: HTMLElement | null = null;
  private cardEl: HTMLElement | null = null;
  private endEl: HTMLElement | null = null;
  updateNight(n: { card: string; goal: string; zone: string; radio: string; ending: string | null; failed: boolean; hasCheckpoint: boolean; mind?: boolean }) {
    if (!this.nightEl) {
      this.nightEl = document.createElement('div');
      this.nightEl.className = 'nighthud';
      this.cardEl = document.createElement('div');
      this.cardEl.className = 'actcard';
      this.endEl = document.createElement('div');
      this.endEl.className = 'ending';
      this.root.append(this.nightEl, this.cardEl, this.endEl);
    }
    this.nightEl.innerHTML = `<div class="zone">${n.zone}</div><div class="goal">${n.goal}</div>${n.radio ? `<div class="radio">📻 ${n.radio}</div>` : ''}`;
    this.cardEl!.textContent = n.mind ? 'ENLITE  —  FOREVER' : n.card;
    this.root.classList.toggle('mind', !!n.mind);
    this.cardEl!.style.opacity = n.card ? '1' : '0';
    if (n.ending) {
      this.endEl!.style.display = 'flex';
      this.endEl!.innerHTML =
        n.ending === 'true'
          ? '<div class="big">SUNRISE</div><div>The truck bursts out into the morning. The queen follows you into the light, and dies.</div><div class="small">The true ending: the whole night, no checkpoints.</div>'
          : '<div class="big">SUNRISE?</div><div>The light is a glare. Your voices come out of the bugs. You have done this before.</div><div class="small">The hollow ending: this run used a checkpoint. Only a full night without one earns the real sunrise.</div>';
    } else this.endEl!.style.display = 'none';
    if (n.failed && this.failEl)
      this.failEl.innerHTML = `<div class="big">THE NIGHT IS LOST</div><div>${(this as any)._reason ?? ''}</div><div class="small">Enter: restart the whole night (the true ending is still possible)${n.hasCheckpoint ? '<br>C: continue (from the last checkpoint, or, if the truck was stopped, inside the swarm’s mind). The run can then only end badly' : ''}</div>`;
  }

  private pauseEl: HTMLElement | null = null;
  setPause(on: boolean, client: boolean) {
    if (!this.pauseEl) {
      this.pauseEl = document.createElement('div');
      this.pauseEl.className = 'pause';
      this.root.appendChild(this.pauseEl);
    }
    this.pauseEl.style.display = on ? 'flex' : 'none';
    this.pauseEl.textContent = client ? 'PAUSED BY HOST' : 'PAUSED — Esc or P to resume';
  }

  /** Wrist fuel gauge, slot icons, interaction prompt. */
  updateCamp(w: World, p: SimPlayer, prompt: string) {
    const f = w.fuel;
    const pct = Math.max(0, Math.min(1, f.value / 1500));
    this.fuelEl.innerHTML = `<div class="wl">FUEL</div><div class="wv">${Math.ceil(f.value)}</div><div class="wb"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>`;
    this.fuelEl.classList.toggle('low', f.value < 200);
    let html = '';
    for (let k = 0; k < 3; k++) {
      const it = p.carrying ?? p.slots[k];
      const name = it ? ITEM_NAMES[it.kind] : '';
      const bat = it?.kind === 'flashlight' ? `<b style="width:${(((it.battery ?? 0) / CAMP.flashlightBattery) * 100).toFixed(0)}%"></b>` : '';
      const on = it?.kind === 'flashlight' && it.on !== false && !p.carrying ? ' lit' : '';
      html += `<div class="slot${k === p.sel && !p.carrying ? ' sel' : ''}${p.carrying ? ' carry' : ''}${on}"><span>${k + 1}</span>${name}${bat}</div>`;
    }
    this.slotsEl.innerHTML = html;
    const extra = p.tethered ? '\nCable at full length — reel in (alternate LMB/RMB)' : '';
    this.promptEl.textContent = prompt + extra;
  }

  update(p: SimPlayer, time: number, extra: { locked: boolean; lockError?: string }) {
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
    this.hint.textContent = extra.locked ? '' : extra.lockError ? `Click to play\n${extra.lockError}` : 'Click to play';
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
