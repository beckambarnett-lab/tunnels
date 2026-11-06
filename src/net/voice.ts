import type { World } from '../sim/world';
import { los } from '../sim/light';
import { CELL } from '../config';

/**
 * Proximity voice (GDD "Voice"): always-on mic streams between players over WebRTC (PeerJS
 * media calls), placed in 3D at the speaker, fading with distance and muffled through walls.
 * V is push-to-talk on the walkie-talkie (any range, if you carry one). A player being carried has
 * their voice crushed; a hive player's voice comes out of their bugs, distorted and only nearby.
 * Loud talking is reported to the host as noise for the queen's opportunity map.
 *
 * Only active with the online (PeerJS) transport. Not testable in the build container (no
 * microphone, no outbound WebRTC), so it is written defensively: any failure just disables voice.
 */
export class Voice {
  ctx: AudioContext | null = null;
  local: MediaStream | null = null;
  peers = new Map<string, { panner: PannerNode; gain: GainNode; lp: BiquadFilterNode; shaper: WaveShaperNode; dry: GainNode; wet: GainNode; el: HTMLAudioElement }>();
  analyser: AnalyserNode | null = null;
  level = 0;
  enabled = false;
  walkie = false;

  async start(peer: any, playerIdForPeer: (peerId: string) => string | null) {
    try {
      this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.local);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
      peer.on('call', (call: any) => {
        call.answer(this.local);
        call.on('stream', (s: MediaStream) => this.addRemote(playerIdForPeer(call.peer) ?? call.peer, s));
      });
      this.enabled = true;
    } catch (e) {
      console.warn('voice disabled:', (e as Error).message);
    }
  }

  call(peer: any, peerId: string, playerId: string) {
    if (!this.enabled || !this.local) return;
    try {
      const c = peer.call(peerId, this.local);
      c.on('stream', (s: MediaStream) => this.addRemote(playerId, s));
    } catch (e) {
      console.warn('voice call failed:', (e as Error).message);
    }
  }

  private addRemote(id: string, stream: MediaStream) {
    const ctx = this.ctx!;
    // Chrome needs the stream attached to a (muted) element for WebAudio to pull it
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 20000;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128 - 1) * 4;
      curve[i] = Math.tanh(x) * 0.8 + Math.sin(x * 9) * 0.15; // chitinous distortion
    }
    shaper.curve = curve;
    const dry = ctx.createGain(), wet = ctx.createGain();
    wet.gain.value = 0;
    const gain = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1;
    panner.maxDistance = 25;
    src.connect(lp);
    lp.connect(dry).connect(gain);
    lp.connect(shaper).connect(wet).connect(gain);
    gain.connect(panner).connect(ctx.destination);
    this.peers.set(id, { panner, gain, lp, shaper, dry, wet, el });
  }

  /** Per frame: place each voice, apply walls / walkie / carried / hive effects. Returns true if we're loud. */
  update(w: World, meId: string, walkieKeyHeld: boolean) {
    if (!this.enabled || !this.ctx) return false;
    const me = w.players.find((p) => p.id === meId);
    if (!me) return false;
    const L = this.ctx.listener as any;
    if (L.positionX) {
      L.positionX.value = me.x;
      L.positionZ.value = me.z;
      L.forwardX.value = Math.sin(me.yaw);
      L.forwardZ.value = Math.cos(me.yaw);
    }
    for (const [id, v] of this.peers) {
      const p = w.players.find((q) => q.id === id);
      if (!p) continue;
      const sx = p.hive ? p.hiveX : p.x, sz = p.hive ? p.hiveZ : p.z;
      v.panner.positionX.value = sx;
      v.panner.positionY.value = p.hive ? 0.2 : 1.6;
      v.panner.positionZ.value = sz;
      const g = w.grid;
      const clear = los(g, Math.floor(me.x / CELL), Math.floor(me.z / CELL), Math.floor(sx / CELL), Math.floor(sz / CELL));
      const hasWalkie = (q: typeof p) => q.slots.some((s) => s?.kind === 'walkie');
      const onRadio = p.walkieTalking && hasWalkie(p) && hasWalkie(me);
      let gain = 1, cutoff = clear ? 18000 : 900; // muffled through walls and floors
      if (p.carriedT > 0) (gain = 0.25), (cutoff = 500); // crushed and swallowed by the swarm
      if (p.hive) {
        gain = Math.hypot(sx - me.x, sz - me.z) < 8 ? 0.9 : 0; // only living players near the bugs hear it
        v.wet.gain.value = 1;
        v.dry.gain.value = 0.15;
      } else {
        v.wet.gain.value = 0;
        v.dry.gain.value = 1;
      }
      if (onRadio) {
        // the walkie-talkie ignores distance: a tinny band-passed voice in your ear
        v.panner.positionX.value = me.x;
        v.panner.positionZ.value = me.z;
        gain = 0.8;
        cutoff = 3200;
      }
      v.gain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.05);
      v.lp.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.05);
    }
    this.walkie = walkieKeyHeld;
    // loudness of our own mic (voice as noise)
    if (this.analyser) {
      const buf = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(buf);
      let s = 0;
      for (const x of buf) s += x * x;
      this.level = Math.sqrt(s / buf.length);
    }
    return this.level > 0.08;
  }
}
