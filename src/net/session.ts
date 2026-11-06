import type { World } from '../sim/world';
import { applyInput, emptyInput, PlayerInput } from '../sim/actions';
import { Transport } from './transport';
import {
  applyCamp,
  applyGridDiff,
  applyKeyframe,
  applyPlayer,
  applyTendrils,
  campState,
  fullSnapshot,
  playerState,
  swarmKeyframe,
  SyncStats,
  tendrilState,
  runState,
  applyRunState,
} from './serialize';
import { newItem } from '../sim/camp';

/** World events the host relays so clients hear and see the same tells, breaches and sparks. */
const RELAY = ['breach', 'tell', 'tellPulse', 'wireCut', 'zap', 'lightning', 'harvest', 'deviceBroken', 'collapse', 'stomp', 'dig', 'unlock', 'intent', 'directorState', 'downed', 'devoured', 'revived', 'respawned', 'bodyDragged', 'fuelOut', 'runFailed'];

export interface Pose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  move: [number, number];
  walkie?: boolean;
  loud?: boolean;
}

/**
 * Host: runs the authoritative world; applies each client's input (their own movement is
 * theirs); streams players, tendrils, camp, terrain changes, fuel and swarm keyframes.
 * Client: sends input + pose; mirrors everything else; runs bug steering locally between keyframes.
 */
export class NetSession {
  stats: SyncStats = { frames: 0, lastMeanErr: 0, lastMaxErr: 0, maxMeanErr: 0, snaps: 0, spawned: 0, killed: 0 };
  inputs = new Map<string, PlayerInput>();
  poses = new Map<string, Pose>();
  peers = new Set<string>();
  welcomed = false;
  onWelcome: ((snap: any, you: string) => void) | null = null;
  hostLost = false;
  private acc = { players: 0, misc: 0, tendrils: 0, camp: 0, kf: 0 };
  private kfCursor = 0;
  private campSig = '';
  bytesIn = 0;
  private lastHostMsg = 0;

  constructor(public t: Transport, public w: World | null, public localId: string, public pristine: Uint8Array | null) {
    t.onPeer = (id, joined) => this.peer(id, joined);
    t.onMessage = (from, msg) => this.message(from, msg);
    if (!t.isHost) {
      const hello = () => {
        if (!this.welcomed) t.send({ t: 'hello', peerId: (t as any).peer?.id ?? '' });
      };
      hello();
      const iv = setInterval(() => (this.welcomed ? clearInterval(iv) : hello()), 700);
    }
  }

  get isHost() {
    return this.t.isHost;
  }

  attach(w: World, pristine: Uint8Array | null) {
    this.w = w;
    this.pristine = pristine;
    if (this.isHost) {
      w.grid.trackNet = true;
      for (const name of RELAY) w.events.on(name, (data) => this.t.send({ t: 'ev', name, data }));
    }
  }

  // ---------- host ----------
  private peer(id: string, joined: boolean) {
    if (!this.isHost || !this.w) return;
    if (joined) this.peers.add(id);
    else {
      this.peers.delete(id);
      // a player who drops out leaves their body behind as a downed player
      const p = this.w.players.find((q) => q.id === id);
      if (p) {
        p.connected = false;
        if (p.alive && !p.hive) {
          p.downed = true;
          p.overwhelm = 1;
        }
      }
    }
  }

  private message(from: string, m: any) {
    this.bytesIn += 1;
    if (this.isHost) {
      const w = this.w;
      if (!w) return;
      if (m.t === 'hello') {
        let p = w.players.find((q) => q.id === from);
        if (!p) {
          p = w.addPlayer(from, w.layout.start.x + (w.rng.next() - 0.5), w.layout.start.z + (w.rng.next() - 0.5));
          p.slots = w.run ? [newItem('sprayer'), newItem('zapper'), null] : [newItem('flashlight'), newItem('flamethrower'), newItem('spool')];
          w.events.emit('playerJoined', { id: from });
        }
        p.connected = true;
        if (m.peerId) p.peerId = m.peerId;
        this.peers.add(from);
        this.t.send({ t: 'welcome', you: from, snap: fullSnapshot(w, this.pristine!) }, from);
      } else if (m.t === 'in') {
        // merge: held flags = latest; presses accumulate until the host's next frame
        const prev = this.inputs.get(from);
        const inp: PlayerInput = m.inp;
        if (prev) {
          inp.usePressed ||= prev.usePressed;
          inp.altPressed ||= prev.altPressed;
          inp.interactPressed ||= prev.interactPressed;
          inp.drop ||= prev.drop;
          inp.stomp ||= prev.stomp;
          if (inp.slot < 0) inp.slot = prev.slot;
          inp.scroll += prev.scroll;
        }
        this.inputs.set(from, inp);
        this.poses.set(from, m.pose);
      } else if (m.t === 'bye') this.peer(from, false);
      return;
    }
    // ---------- client ----------
    this.lastHostMsg = performance.now();
    if (m.t === 'welcome') {
      if (this.welcomed) return;
      this.welcomed = true;
      this.localId = m.you;
      this.onWelcome?.(m.snap, m.you);
      return;
    }
    const w = this.w;
    if (!w || !this.welcomed) return;
    switch (m.t) {
      case 'players':
        for (const s of m.list) {
          const self = s.id === this.localId;
          applyPlayer(w, s, self && !(s.downed || s.hive || s.tethered || s.carriedT > 0 || s.riding));
        }
        break;
      case 'tendrils':
        applyTendrils(w, m.list);
        break;
      case 'camp':
        applyCamp(w, m.state);
        break;
      case 'cells':
        for (const [i, v, t] of m.list) w.grid.applyRemote(i, v, t);
        if (m.burrow) for (const i of m.burrow) w.grid.burrow[i] = 1;
        break;
      case 'kf':
        applyKeyframe(w, m.kf, this.stats);
        break;
      case 'misc':
        w.fuel.value = m.fuel;
        w.fuel.out = m.fuelOut;
        Object.assign(w.light.belief, m.belief);
        if (Math.abs(w.time - m.time) > 0.5) w.time = m.time;
        w.paused = m.paused;
        w.breachAllowed = m.breach;
        w.director.state = m.director;
        w.director.act = m.act;
        w.director.team = m.intensity;
        (w as any).remoteQueen = m.queen;
        w.targetBugs = m.targetBugs;
        w.runState = m.runState;
        w.failReason = m.failReason;
        applyRunState(w, m.run);
        w.syncFlares(m.flares ?? []);
        break;
      case 'ev':
        w.events.emit(m.name, m.data);
        break;
    }
  }

  /** Host: apply remote players' inputs and poses before the world steps. */
  hostApplyInputs(dt: number) {
    const w = this.w!;
    for (const p of w.players) {
      if (p.id === this.localId) continue;
      const pose = this.poses.get(p.id);
      if (pose && !p.downed && !p.hive && !p.tethered && p.carriedT <= 0 && !p.riding) {
        p.x = pose.x;
        p.z = pose.z;
        p.yaw = pose.yaw;
        p.pitch = pose.pitch;
        p.crouch = pose.crouch;
      }
      if (pose) {
        p.hiveMove = pose.move;
        p.walkieTalking = !!pose.walkie;
        if (pose.loud) p.loudAt = w.time;
      }
      const inp = this.inputs.get(p.id);
      if (inp && p.connected) {
        applyInput(w, p, inp, dt);
        // presses are consumed; held flags persist until the next message
        this.inputs.set(p.id, { ...inp, usePressed: false, altPressed: false, interactPressed: false, drop: false, stomp: false, slot: -1, scroll: 0 });
      } else if (!p.connected) applyInput(w, p, emptyInput(), dt);
    }
  }

  /** Host: stream state at fixed rates. */
  hostBroadcast(dt: number) {
    const w = this.w!, a = this.acc;
    if (!this.peers.size) {
      w.grid.netChanged.length = 0;
      return;
    }
    const due = (k: keyof typeof a, hz: number) => {
      a[k] += dt;
      if (a[k] >= 1 / hz) {
        a[k] = 0;
        return true;
      }
      return false;
    };
    const cells = w.grid.netChanged.splice(0);
    if (cells.length) this.t.send({ t: 'cells', list: cells.map((i) => [i, w.grid.cells[i], w.grid.dugAt[i]]) });
    if (due('players', 20)) this.t.send({ t: 'players', list: w.players.map(playerState) });
    if (due('tendrils', 4)) this.t.send({ t: 'tendrils', list: [...w.tendrils.values()].map(tendrilState) });
    const sig = w.camp.version + ':' + w.camp.wires.map((x) => x.version + '.' + x.cuts.size).join(',') + ':' + w.camp.devices.map((d) => +d.powered + +!!d.light?.on * 2 + +d.broken * 4).join('') + ':' + w.camp.bodies.length;
    if (due('camp', 10) && sig !== this.campSig) {
      this.campSig = sig;
      this.t.send({ t: 'camp', state: campState(w) });
    }
    if (due('misc', 5))
      this.t.send({
        t: 'misc',
        fuel: w.fuel.value,
        fuelOut: w.fuel.out,
        belief: w.light.belief,
        time: w.time,
        paused: w.paused,
        breach: w.breachAllowed,
        director: w.director.state,
        act: w.director.act,
        intensity: w.director.team,
        queen: w.queen ? { intent: w.queen.intent, silenceUntil: w.queen.silenceUntil, scores: w.queen.scores } : null,
        targetBugs: w.targetBugs,
        runState: w.runState,
        failReason: w.failReason,
        run: runState(w),
        flares: w.flares.map((f) => [f.x, f.z, f.t]),
      });
    // swarm keyframes: a quarter of the slots per message, 16 messages a second = every bug 4x/s
    a.kf += dt;
    while (a.kf >= 1 / 16) {
      a.kf -= 1 / 16;
      const n = w.swarm.count;
      if (!n) break;
      const slice = Math.ceil(n / 4);
      if (this.kfCursor >= n) this.kfCursor = 0;
      this.t.send({ t: 'kf', kf: swarmKeyframe(w, this.kfCursor, this.kfCursor + slice) });
      this.kfCursor += slice;
    }
  }

  // ---------- client ----------
  clientSend(inp: PlayerInput, pose: Pose) {
    this.t.send({ t: 'in', inp, pose });
  }
  get hostSilentFor() {
    return this.lastHostMsg ? performance.now() - this.lastHostMsg : 0;
  }
  applyWelcome(w: World, snap: any) {
    this.w = w;
    w.time = snap.time;
    w.targetBugs = snap.targetBugs;
    w.director.act = snap.act;
    applyGridDiff(w, snap.grid);
    applyCamp(w, snap.camp);
    for (const s of snap.players) applyPlayer(w, s, false);
    applyTendrils(w, snap.tendrils);
    applyKeyframe(w, snap.swarm, this.stats);
    w.fuel.value = snap.fuel;
    w.fuel.out = snap.fuelOut;
    Object.assign(w.light.belief, snap.belief);
    w.paused = snap.paused;
    applyRunState(w, snap.run);
  }
}
