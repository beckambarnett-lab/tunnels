// Every sound is generated at runtime with Web Audio (no audio files).
export class Synth {
  ctx: AudioContext | null = null;
  master!: GainNode;
  noise!: AudioBuffer;
  click!: AudioBuffer;
  flameGain!: GainNode;
  droneGain!: GainNode;
  chitterBus!: GainNode;
  chitterPan!: PannerNode;
  enabled = true;
  private lastScratch = new Map<string, number>();

  start() {
    if (this.ctx) return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // a single chitin click: a few ms of sharp ringing noise
    const cl = Math.floor(ctx.sampleRate * 0.012);
    this.click = ctx.createBuffer(1, cl, ctx.sampleRate);
    const c = this.click.getChannelData(0);
    for (let i = 0; i < cl; i++) c[i] = (Math.random() * 2 - 1) * Math.exp(-i / (cl * 0.15)) * (0.6 + 0.4 * Math.sin(i * 0.9));
    // flamethrower: looping lowpassed noise
    const fl = ctx.createBufferSource();
    fl.buffer = this.noise;
    fl.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    this.flameGain = ctx.createGain();
    this.flameGain.gain.value = 0;
    fl.connect(lp).connect(this.flameGain).connect(this.master);
    fl.start();
    // ambient nest drone
    const o = ctx.createOscillator();
    o.frequency.value = 41;
    const o2 = ctx.createOscillator();
    o2.frequency.value = 43.5;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.05;
    o.connect(this.droneGain);
    o2.connect(this.droneGain);
    this.droneGain.connect(this.master);
    o.start();
    o2.start();
    // chitter bus, positioned at the nearest mass of bugs
    this.chitterPan = ctx.createPanner();
    this.chitterPan.panningModel = 'HRTF';
    this.chitterPan.refDistance = 2;
    this.chitterPan.rolloffFactor = 1.2;
    this.chitterBus = ctx.createGain();
    this.chitterBus.gain.value = 0.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3800;
    hp.Q.value = 0.8;
    this.chitterBus.connect(hp).connect(this.chitterPan).connect(this.master);
  }

  listener(x: number, y: number, z: number, fx: number, fy: number, fz: number) {
    if (!this.ctx) return;
    const l = this.ctx.listener as any;
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  /** Chitter density tracks how many bugs are near (GDD audio direction). */
  chitter(nearCount: number, cx: number, cz: number, dt: number, silenced = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.chitterPan.positionX.value = cx;
    this.chitterPan.positionY.value = 0.3;
    this.chitterPan.positionZ.value = cz;
    if (silenced) return;
    const rate = Math.min(400, nearCount * 2.2); // clicks per second
    let n = rate * dt;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      const s = ctx.createBufferSource();
      s.buffer = this.click;
      s.playbackRate.value = 0.6 + Math.random() * 1.3;
      const g = ctx.createGain();
      g.gain.value = 0.15 + Math.random() * 0.3;
      s.connect(g).connect(this.chitterBus);
      s.start(ctx.currentTime + Math.random() * dt);
    }
  }

  private positioned(x: number, y: number, z: number, ref = 2) {
    const ctx = this.ctx!;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.refDistance = ref;
    p.rolloffFactor = 1.3;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    p.connect(this.master);
    return p;
  }

  noiseBurst(x: number, y: number, z: number, dur: number, freq: number, q: number, gain: number, muffle = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = muffle ? freq * 0.4 : freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.positioned(x, y, z));
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** Scratching inside the walls (muffled), throttled per place. */
  scratch(x: number, z: number) {
    if (!this.ctx) return;
    const k = Math.floor(x) + ',' + Math.floor(z);
    const now = this.ctx.currentTime;
    if ((this.lastScratch.get(k) || 0) > now - 0.35) return;
    this.lastScratch.set(k, now);
    this.noiseBurst(x, 1, z, 0.12 + Math.random() * 0.1, 1100 + Math.random() * 800, 2.5, 0.35, true);
  }

  breach(x: number, y: number, z: number) {
    if (!this.ctx) return;
    this.noiseBurst(x, y, z, 0.5, 300, 0.7, 0.9);
    this.noiseBurst(x, y, z, 0.15, 2400, 1.5, 0.6);
    this.thump(x, y, z, 70, 0.6);
  }

  thump(x: number, y: number, z: number, f0: number, gain: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.4, t + 0.3);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.positioned(x, y, z, 3));
    o.start(t);
    o.stop(t + 0.4);
  }

  squeal(x: number, z: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const f = 1800 + Math.random() * 1500;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.3, t + 0.25);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.positioned(x, 0.3, z));
    o.start(t);
    o.stop(t + 0.3);
  }

  flame(on: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.flameGain.gain.setTargetAtTime(on ? 0.5 : 0, t, on ? 0.03 : 0.1);
  }

  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private humPan: PannerNode | null = null;
  /** The generator's hum is comfort (GDD audio direction). */
  hum(x: number, z: number, on: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.humOsc) {
      this.humOsc = ctx.createOscillator();
      this.humOsc.type = 'sawtooth';
      this.humOsc.frequency.value = 58;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      this.humGain = ctx.createGain();
      this.humGain.gain.value = 0;
      this.humPan = this.positioned(x, 0.4, z, 3);
      this.humOsc.connect(lp).connect(this.humGain).connect(this.humPan);
      this.humOsc.start();
    }
    this.humPan!.positionX.value = x;
    this.humPan!.positionZ.value = z;
    this.humGain!.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.15);
    this.humOsc.frequency.value = 58 + Math.sin(ctx.currentTime * 3) * 0.8;
  }

  zap(x: number, z: number) {
    if (!this.ctx) return;
    this.noiseBurst(x, 1, z, 0.18, 5000, 0.8, 0.6);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 120;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.positioned(x, 1, z));
    o.start(t);
    o.stop(t + 0.22);
  }

  setDrone(level: number) {
    if (!this.ctx) return;
    this.droneGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.5);
  }
}
