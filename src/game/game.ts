import * as THREE from 'three';
import { CELL, SWARM } from '../config';
import { World, SimPlayer } from '../sim/world';
import { benchLayout } from '../sim/layouts';
import { makeLight } from '../sim/light';
import { TerrainMesh } from '../render/terrainMesh';
import { BugMesh } from '../render/bugMesh';
import { LightRenderer } from '../render/lights';
import { Fx } from '../render/fx';
import { DebugViews } from '../render/debugViews';
import { Input } from './input';
import { PlayerController } from './player';
import { Hud } from './hud';
import { Synth } from '../audio/synth';
import { Overlay } from '../debug/overlay';
import { CampMesh } from '../render/campMesh';
import { WarMap } from './map';
import { applyInput, findTarget, promptFor, PlayerInput, zap } from '../sim/actions';
import { newItem } from '../sim/camp';
import type { Role } from '../sim/world';
import { NetSession } from '../net/session';
import { PlayerAvatars } from '../render/avatars';
import { Voice } from '../net/voice';
import { saveToBrowser, exportFile, readBrowserSave, applySave, makeSave } from '../net/save';
import { NightMesh } from '../render/nightMesh';
import { ZONE_NAMES, NightLayout } from '../sim/night';
import { Panel } from '../debug/panel';

export interface GameOptions {
  seed: number;
  bench: boolean;
  bugs: number;
  res?: number;
  auto?: boolean;
  act?: number;
  role?: Role;
  session?: NetSession;
  snapshot?: any;
  localId?: string;
  room?: string;
  load?: boolean | string;
  night?: boolean;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  topCam: THREE.PerspectiveCamera;
  world: World;
  terrain: TerrainMesh;
  bugs: BugMesh;
  lights: LightRenderer;
  fx: Fx;
  debug: DebugViews;
  input: Input;
  me: SimPlayer;
  ctrl: PlayerController;
  hud: Hud;
  synth = new Synth();
  overlay = new Overlay();
  panel: Panel;
  camp: CampMesh;
  avatars: PlayerAvatars;
  session: NetSession | null = null;
  localId = 'local';
  voice: Voice | null = null;
  pristine: Uint8Array;
  night: NightMesh | null = null;
  private lastAct = 0;
  private actCardT = 0;
  toast = '';
  toastT = 0;
  private called = new Set<string>();
  map = new WarMap();
  last = 0;
  time = 0;
  renderMs = 0;
  frameCount = 0;
  bench: { start: number; samples: number[]; sim: number[]; render: number[]; bugs: number[]; done: boolean; result?: any } | null = null;
  private squealT = 0;
  debugFire = false; // test hook: hold the trigger
  lastTell = '';
  shake = 0;
  lastUnlock = '';

  constructor(public canvas: HTMLCanvasElement, public opts: GameOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(opts.res ?? Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.045);
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 90);
    this.scene.add(this.camera);
    this.topCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 200);
    addEventListener('resize', () => this.resize());

    const role = opts.role ?? 'solo';
    this.world = new World({
      seed: opts.seed,
      useWorker: true,
      bugs: opts.bugs,
      layout: opts.bench ? benchLayout() : undefined,
      role,
      night: !!opts.night && !opts.bench,
    });
    const L = this.world.layout;
    const pristine = this.world.grid.cells.slice();
    this.session = opts.session ?? null;
    if (role === 'client') {
      // mirror the host's world, then find ourselves in it
      this.session!.applyWelcome(this.world, opts.snapshot);
      this.session!.attach(this.world, null);
      this.me = this.world.players.find((p) => p.id === opts.localId)!;
      this.localId = opts.localId!;
    } else {
      this.localId = role === 'host' ? 'host' : 'local';
      // the prototype nest plays as act 2 (the base: probes against a strong position) unless ?act=N
      this.world.director.act = this.world.run ? 1 : opts.act ?? 2;
      // a breather to set up camp before the hive starts pushing
      if (!opts.bench) this.world.director.startRelaxed(45);
      this.me = this.world.addPlayer(this.localId, L.start.x, L.start.z);
      if (opts.bench) this.setupBench();
      else {
        this.me.yaw = this.faceOpen(L.start.x, L.start.z);
        this.giveStartingKit();
      }
      if (role === 'host') this.session!.attach(this.world, pristine);
      // ?load: continue from the browser save (marks the run: bad ending only)
      if (opts.load) {
        const sv = readBrowserSave(opts.load === 'checkpoint' ? 'tunnels-checkpoint' : undefined);
        if (sv) {
          applySave(this.world, sv);
          this.me = this.world.players.find((p) => p.id === this.localId) ?? this.me;
        }
      }
    }
    this.pristine = pristine;
    // checkpoints at milestone spaces and oil rigs (host / solo)
    if (this.world.run && role !== 'client')
      this.world.run.onCheckpoint = (name) => {
        try {
          localStorage.setItem('tunnels-checkpoint', JSON.stringify(makeSave(this.world, this.pristine)));
        } catch {}
        this.toast = `Checkpoint: ${name}`;
        this.toastT = 3;
      };

    this.terrain = new TerrainMesh(this.world.grid, opts.seed, this.world.run ? (this.world.layout as NightLayout).zone : null);
    this.scene.add(this.terrain.group);
    this.bugs = new BugMesh(SWARM.maxBugs);
    this.scene.add(this.bugs.mesh);
    this.lights = new LightRenderer(this.scene, this.camera);
    this.fx = new Fx(this.scene, this.world);
    this.debug = new DebugViews(this.scene, this.world);
    this.camp = new CampMesh(this.scene, this.world, this.camera);
    this.avatars = new PlayerAvatars(this.scene, this.world, this.localId);
    this.night = this.world.run ? new NightMesh(this.scene, this.world) : null;
    // proximity voice: online play only (WebRTC media); starts on the first click (mic permission)
    if (this.session?.t.kind === 'webrtc') {
      this.voice = new Voice();
      const peer = (this.session.t as any).peer;
      this.me.peerId = peer?.id ?? '';
      canvas.addEventListener('mousedown', () => {
        if (!this.voice!.ctx) this.voice!.start(peer, (pid) => this.world.players.find((p) => p.peerId === pid)?.id ?? null);
      }, { once: true });
    }
    if (opts.room) {
      const r = document.createElement('div');
      r.className = 'room';
      r.textContent = `${role === 'host' ? 'Hosting' : 'In'} room ${opts.room}${role === 'host' ? ' — friends join with this code' : ''}`;
      document.getElementById('hud')!.appendChild(r);
    }
    this.input = new Input(canvas);
    this.ctrl = new PlayerController(this.me, this.world.grid, this.camera);
    this.hud = new Hud();
    this.panel = new Panel(opts.bugs);
    this.panel.onChange = (s) => {
      this.world.targetBugs = s.bugs;
      this.debug.setView(s.view);
      this.world.debugBreaches = s.breaches;
      this.world.queen?.force((s.intent || null) as any);
    };
    if (opts.bench) this.panel.state.god = true;
    this.panel.refresh();
    canvas.addEventListener('mousedown', () => {
      this.synth.start();
      if (this.world.run?.powerOn) this.synth.jingle();
    });
    addEventListener('keydown', () => this.synth.start(), { once: true });
    this.wireEvents();
    (window as any).__tunnels = { game: this, world: this.world, session: this.session, actions: { zap, applyInput } };
  }

  /** Pick the yaw that looks down the longest open line from a point. */
  faceOpen(x: number, z: number) {
    let best = 0, bestLen = -1;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      let len = 0;
      while (len < 30 && this.world.grid.isOpenAt(x + Math.sin(a) * len, z + Math.cos(a) * len)) len += 0.25;
      if (len > bestLen) (bestLen = len), (best = a);
    }
    return best;
  }

  /** Test autopilot (?auto): wander the tunnels and look around, never downed. */
  private autoT = 0;
  autopilot(dt: number) {
    const p = this.me;
    this.panel.state.god = true;
    this.autoT -= dt;
    p.yaw += dt * 0.9 * Math.sin(this.time * 0.13);
    if (this.autoT <= 0) {
      this.autoT = 3 + Math.random() * 4;
      (this as any)._autoDir = this.faceOpen(p.x, p.z) + (Math.random() - 0.5) * 1.5;
    }
    const a = (this as any)._autoDir ?? 0;
    this.ctrl.move(Math.sin(a) * 2 * dt, Math.cos(a) * 2 * dt);
  }

  /**
   * M2 test kit (the van and the house arrive in M5): you carry a flashlight, the flamethrower and
   * a spool; the camp gear lies on the floor ahead of you.
   */
  giveStartingKit() {
    const w = this.world, p = this.me;
    if (w.run) return this.giveNightKit();
    p.slots = [newItem('flashlight'), newItem('flamethrower'), newItem('spool')];
    p.sel = 0;
    const kit: any[] = ['generator', 'lamp', 'lamp', 'floodlight', 'motion', 'spool', 'spool', 'spool', 'splitter', 'zapper', 'lightning', 'walkie'];
    // solo: nobody can electrocute you back to life, so you get a bug zapper (GDD)
    if ((this.opts.role ?? 'solo') === 'solo') kit.push('bugzapper');
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = -fz, rz = fx;
    kit.forEach((k, i) => {
      const along = 1.6 + Math.floor(i / 3) * 0.9, side = ((i % 3) - 1) * 0.9;
      let x = p.x + fx * along + rx * side, z = p.z + fz * along + rz * side;
      if (!w.grid.isOpenAt(x, z)) (x = p.x + fx * along), (z = p.z + fz * along);
      w.camp.drop(k, x, z);
    });
  }

  /** The night: you arrive with the Xterminator's kit (sprayer, generator zapper); the van stock is in the hallway. */
  giveNightKit() {
    const w = this.world, p = this.me;
    const L = w.layout as NightLayout;
    p.slots = [newItem('sprayer'), newItem('zapper'), null];
    p.sel = 0;
    const fl = L.marks.find((m) => m.kind === 'flashlights');
    if (fl) for (let k = 0; k < 4; k++) w.camp.drop('flashlight', fl.x + (k % 2) * 0.3 - 0.15, fl.z + Math.floor(k / 2) * 0.3 - 0.15);
    const stock: any[] = ['generator', 'lamp', 'lamp', 'floodlight', 'spool', 'spool', 'spool', 'splitter', 'walkie', 'motion'];
    if ((this.opts.role ?? 'solo') === 'solo') stock.push('bugzapper');
    stock.forEach((k, i) => {
      let x = p.x + 2 + (i % 4) * 0.9, z = p.z - 1.2 + Math.floor(i / 4) * 0.9;
      if (!w.grid.isOpenAt(x, z)) (x = p.x + 1), (z = p.z);
      w.camp.drop(k, x, z);
    });
    const lg = L.marks.find((m) => m.kind === 'lightning');
    if (lg) w.camp.drop('lightning', lg.x, lg.z);
    p.yaw = Math.PI / 2;
  }

  setupBench() {
    const w = this.world;
    const p = this.me;
    p.slots = [newItem('flashlight'), null, null];
    p.yaw = Math.PI; // face -z, toward the middle of the hall
    // lamps in view so the swarm masses on screen
    for (const [dx, dz] of [[-6, -9], [6, -9], [0, -16]]) w.staticLights.push(makeLight('lamp', { x: p.x + dx, z: p.z + dz, radius: 5, intensity: 1, y: 1.6 }));
    this.bench = { start: -1, samples: [], sim: [], render: [], bugs: [], done: false };
  }

  buildInput(locked: boolean): PlayerInput {
    const i = this.input;
    const f = this.ctrl.forward(new THREE.Vector3());
    const c = this.camera.position;
    let slot = -1;
    if (i.hit('Digit1')) slot = 0;
    if (i.hit('Digit2')) slot = 1;
    if (i.hit('Digit3')) slot = 2;
    const live = locked && !this.opts.bench;
    return {
      use: (live && i.mouse.left) || this.debugFire,
      usePressed: live && i.mousePressed.left,
      alt: live && i.mouse.right,
      altPressed: live && i.mousePressed.right,
      interact: live && i.down('KeyE'),
      interactPressed: live && i.hit('KeyE'),
      drop: live && i.hit('KeyQ'),
      repair: live && i.down('KeyR'),
      stomp: live && i.hit('Space'),
      dig: live && i.down('KeyX'),
      slot: live ? slot : -1,
      scroll: live ? i.mouse.wheel : 0,
      aim: [f.x, f.y, f.z],
      eye: [c.x, c.y, c.z],
    };
  }

  wireEvents() {
    const ev = this.world.events;
    ev.on('wireCut', (e) => this.synth.noiseBurst(e.x, 0.1, e.z, 0.12, 3500, 3, 0.7));
    ev.on('zap', (e) => this.synth.zap(e.x, e.z));
    ev.on('harvest', (e) => this.synth.noiseBurst(e.x, 0.3, e.z, 0.3, 500, 1, 0.5));
    ev.on('stomp', (e) => this.synth.thump(e.x, 0.1, e.z, 90, 0.5));
    ev.on('crank', () => this.synth.noiseBurst(this.me.x, 1, this.me.z, 0.05, 2000, 6, 0.25));
    ev.on('radio', () => this.synth.noiseBurst(this.me.x, 1.5, this.me.z, 0.25, 2000, 0.6, 0.25));
    ev.on('powerDies', () => {
      this.synth.jingleStop();
      this.synth.thump(this.me.x, 2, this.me.z, 45, 0.9);
    });
    ev.on('sunrise', () => this.synth.sunrise());
    ev.on('eggBurned', (e) => this.synth.squeal(e.x, e.z));
    ev.on('generatorOff', (e) => this.synth.thump(e.x, 0.5, e.z, 40, 0.5));
    const tell = (e: any) => {
      this.synth.tell(e.intent, e.x, e.z, this.me.x, this.me.z);
      this.lastTell = `${e.intent}: ${e.tell ?? ''}`;
    };
    ev.on('tell', tell);
    ev.on('tellPulse', (e) => this.synth.tell(e.intent, e.x, e.z, this.me.x, this.me.z));
    ev.on('deviceBroken', (e) => this.synth.noiseBurst(e.x, 1, e.z, 0.4, 2500, 1, 0.8));
    ev.on('unlock', (e) => (this.lastUnlock = e.name));
    ev.on('lightning', (e) => {
      this.fx.bolt(e.pts);
      this.synth.zap(e.pts[0][0], e.pts[0][1]);
    });
    ev.on('breach', (e) => this.synth.breach(e.x, e.kind === 'ceiling' ? 2.6 : 0.5, e.z));
    ev.on('dig', (e) => this.synth.scratch(e.x, e.z));
    ev.on('scratch', (e) => this.synth.scratch(e.x, e.z));
    ev.on('collapse', (e) => this.synth.thump(e.x, 1, e.z, 55, 0.8));
    ev.on('bugDeath', (e) => {
      if (e.cause === 'fire' && this.time - this.squealT > 0.05) {
        this.squealT = this.time;
        this.synth.squeal(e.x, e.z);
      }
    });
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    for (const c of [this.camera, this.topCam]) {
      c.aspect = innerWidth / innerHeight;
      c.updateProjectionMatrix();
    }
  }

  start() {
    this.last = performance.now();
    const loop = (t: number) => {
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  updateNightHud(dt: number) {
    const w = this.world, r = w.run!, me = this.me;
    const ACTS = ['', 'The Job', 'The Base', 'The Bubble', 'The Junkyard', 'Sunrise'];
    if (r.act !== this.lastAct) {
      this.lastAct = r.act;
      this.actCardT = 4;
      if (r.act >= 2) this.synth.jingleStop();
    }
    this.actCardT -= dt;
    const zone = ZONE_NAMES[(w.layout as NightLayout).zone[w.grid.cellAt(me.x, me.z)] ?? 0];
    let goal = '';
    if (r.act === 1) {
      const hasLight = w.players.some((p) => p.slots.some((s) => s?.kind === 'flashlight'));
      goal = r.powerOn ? `The job: zap the bugs in the house with the generator zapper (${Math.min(r.jobKills, r.jobTarget)}/${r.jobTarget}). ${hasLight ? '' : 'Find the flashlights (bathroom cupboard).'}` : 'The basement floor has opened. Go down.';
    } else if (r.act === 2) goal = 'Set up a base at the nest mouth: generator, lamps, cable. Then push on.';
    else if (r.act === 3) goal = r.used.size ? 'Carry the camp deeper. Oil rigs refuel you.' : 'The intersection: strap the big fuel tanks onto your sprayers.';
    else if (r.act === 4) goal = r.rage < 1 ? `Find the Enlite suits (dig with X). Burn the queen's egg sacs (rage ${(r.rage * 100).toFixed(0)}%).` : 'She is coming. Get to the digging truck!';
    const f = w.finale;
    if (f && f.state === 'driving') {
      const role = f.roles.get(me.id);
      goal = `DIGGING TRUCK — ${role === 'driver' ? 'DRIVER: WASD steers toward the surface (west); hold RMB for x-ray' : role?.startsWith('gunner') ? 'GUNNER: burn what tears at the truck' : 'QUEEN-KEEPER'}${f.isKeeper(me.id) ? `  |  charge ${(f.energy * 100).toFixed(0)}%: LMB knock-aside (50%), RMB stun burst (100%)` : ''}  |  truck ${(Math.max(0, f.truck.hp) * 100).toFixed(0)}%`;
      this.map.xray = f.roles.get(me.id) === 'driver' && this.input.mouse.right;
    }
    const radio = r.radio.length && w.time - r.radio[r.radio.length - 1].t < 7 ? r.radio[r.radio.length - 1].text : '';
    this.hud.updateNight({
      card: this.actCardT > 0 ? `ACT ${r.act} — ${ACTS[r.act]}` : '',
      goal,
      zone,
      radio,
      ending: f?.ending ?? null,
      failed: w.runState === 'failed',
      hasCheckpoint: !!readBrowserSave('tunnels-checkpoint'),
    });
    if (w.runState === 'failed' && this.input.hit('KeyC')) location.href = location.pathname + '?night&load=checkpoint';
  }

  /** WASD as a world-space direction (used to steer your bugs while you're in the hive). */
  hiveMove(fx: number, fz: number): [number, number] {
    const i = this.input;
    let x = 0, z = 0;
    if (i.down('KeyW')) (x += fx), (z += fz);
    if (i.down('KeyS')) (x -= fx), (z -= fz);
    if (i.down('KeyD')) (x -= fz), (z += fx);
    if (i.down('KeyA')) (x += fz), (z -= fx);
    const l = Math.hypot(x, z) || 1;
    return [x / l, z / l];
  }

  /** The host pauses everyone (GDD); solo pauses itself; clients can't. */
  togglePause() {
    if (this.session && !this.session.isHost) return;
    this.world.paused = !this.world.paused;
  }

  handleKeys() {
    const i = this.input;
    if (i.hit('KeyV')) this.panel.cycleView();
    if (i.hit('KeyT')) this.panel.flip('topDown');
    if (i.hit('KeyG')) this.panel.flip('god');
    if (i.hit('Backquote')) this.panel.el.classList.toggle('hidden');
    // save (host / solo only): K to the browser, Shift+K to a file
    if (i.hit('KeyK') && (!this.session || this.session.isHost)) {
      if (i.down('ShiftLeft')) exportFile(this.world, this.pristine);
      else this.toast = saveToBrowser(this.world, this.pristine) ? 'Saved (open with ?load to continue)' : 'Save failed';
      this.toastT = 3;
    }
    if (i.hit('KeyF')) {
      const it = this.me.slots[this.me.sel];
      if (it?.kind === 'flashlight') it.on = !it.on;
    }
    this.map.show(i.down('Tab'));
  }

  frame(t: number) {
    const dtMs = t - this.last;
    this.last = t;
    const dt = Math.min(0.05, dtMs / 1000);
    this.time += dt;
    this.frameCount++;
    this.overlay.tick(dtMs);
    this.handleKeys();
    const me = this.me;
    const locked = this.input.locked;
    if (!this.opts.bench) this.ctrl.update(dt, this.input, locked);
    else this.ctrl.update(dt, this.input, false);
    if (this.opts.auto) this.autopilot(dt);
    this.ctrl.speedMul = me.carrying ? 0.6 : 1;
    const inp = this.buildInput(locked);
    const sess = this.session;
    const walkie = this.input.down('KeyV');
    const loud = this.voice ? this.voice.update(this.world, this.localId, walkie) : false;
    if (this.voice?.enabled && sess) {
      // call every other player once (lower id calls higher, so each pair connects once)
      for (const p of this.world.players)
        if (p.id !== this.localId && p.peerId && !this.called.has(p.id) && this.localId < p.id) {
          this.called.add(p.id);
          this.voice.call((sess.t as any).peer, p.peerId, p.id);
        }
    }
    if (sess && !sess.isHost) {
      // a client sends its input and pose; the host applies the actions
      const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
      sess.clientSend(inp, { x: me.x, z: me.z, yaw: me.yaw, pitch: me.pitch, crouch: me.crouch, move: this.hiveMove(fx, fz), walkie, loud });
    } else {
      me.walkieTalking = walkie;
      if (loud) me.loudAt = this.world.time;
      me.hiveMove = this.hiveMove(Math.sin(me.yaw), Math.cos(me.yaw));
      applyInput(this.world, me, inp, dt);
      sess?.hostApplyInputs(dt);
    }
    this.synth.flame(this.world.players.some((p) => p.firing && Math.hypot(p.x - me.x, p.z - me.z) < 3));
    if (this.panel.state.god) me.overwhelm = 0;
    if (this.input.hit('Escape') || this.input.hit('KeyP')) this.togglePause();

    const s0 = performance.now();
    this.world.step(dt);
    if (sess?.isHost) sess.hostBroadcast(dt);
    const simMs = performance.now() - s0;
    this.syncRender(dt);
    const r0 = performance.now();
    const top = this.panel.state.topDown;
    if (top) {
      this.topCam.position.set(me.x, 38, me.z + 0.01);
      this.topCam.lookAt(me.x, 0, me.z);
      this.lights.ambient.intensity = 0.9;
      this.scene.fog = null;
    } else {
      if (!this.me.hive) this.lights.ambient.intensity = 0.06;
      if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(0x000000, 0.045);
    }
    if (this.shake > 0 && !top) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.renderer.render(this.scene, top ? this.topCam : this.camera);
    this.renderMs = performance.now() - r0;
    this.hud.update(me, this.time, { locked: locked || this.opts.bench });
    this.toastT -= dt;
    this.hud.updateCamp(this.world, me, (this.toastT > 0 ? this.toast + '\n' : '') + promptFor(this.world, me, findTarget(this.world, me)));
    this.map.draw(this.world, me.id, this.time);
    this.hud.setPause(this.world.paused, !!this.session && !this.session.isHost);
    this.updateOverlay(dt, simMs);
    if (this.bench) this.benchTick(dtMs, simMs);
    this.input.endFrame();
  }

  syncRender(dt: number) {
    const w = this.world;
    // terrain changes (digs, collapses) -> rebuild touched chunks
    const changed = w.grid.drainChanges();
    if (changed.length) this.terrain.onCellsChanged(changed);
    // respawn-ritual bodies: hive players' bugs massed into a human shape
    const bodies = new Map<number, { x: number; z: number; shock: boolean }>();
    let myMembers = 0;
    for (const p of w.players) {
      if (!p.hive) continue;
      const t = [...w.tendrils.values()].find((x) => x.fieldName === 'hivep:' + p.id);
      if (!t) continue;
      if (p === this.me) myMembers = t.members;
      if (p.ritualStage >= 1) bodies.set(t.id, { x: p.hiveX, z: p.hiveZ, shock: p.ritualStage >= 2 && p.ritual > 0 });
    }
    this.bugs.update(w.swarm, this.time, bodies);
    this.hud.updateDeath(w, this.me, myMembers, w.light.rawAt(this.me.x, this.me.z));
    if (this.me.hive) {
      // the hive sees in the dark
      this.lights.ambient.intensity = 1.1;
      this.lights.ambient.color.setHex(0x9fb070);
    } else this.lights.ambient.color.setHex(0x223040);
    if (w.runState === 'failed' && this.input.hit('Enter')) location.href = location.pathname + (w.run ? '?night' : location.search);
    this.lights.update(w.allLights(), this.localId, this.camera.position, this.time);
    this.avatars.update(this.time);
    this.fx.update(dt, w.fire, this.time);
    this.debug.update(dt);
    this.camp.update(dt, this.me);
    this.night?.update(dt);
    if (w.run) this.updateNightHud(dt);
    let gen: any = null, gd = 1e9;
    for (const d of w.camp.devices) {
      const dd = Math.hypot(d.x - this.me.x, d.z - this.me.z);
      if (d.kind === 'generator' && d.running && dd < gd) (gen = d), (gd = dd);
    }
    this.synth.hum(gen ? gen.x : 0, gen ? gen.z : 0, !!gen);
    // audio: listener + chitter density near the camera
    const cam = this.camera.position;
    const f = this.ctrl.forward(new THREE.Vector3());
    this.synth.listener(cam.x, cam.y, cam.z, f.x, f.y, f.z);
    let n = 0, cx = 0, cz = 0;
    const sw = w.swarm;
    sw.hash.forEachNear(cam.x, cam.z, 10, (j) => {
      if (!sw.alive[j]) return;
      n++;
      cx += sw.x[j];
      cz += sw.z[j];
    });
    const q: any = w.queen ?? (w as any).remoteQueen;
    const silent = !!q && w.time < q.silenceUntil;
    this.synth.chitter(n, n ? cx / n : cam.x, n ? cz / n : cam.z, dt, silent);
    this.synth.setDrone(silent ? 0 : 0.05);
    this.synth.music(!!q && q.intent === 'assault' && !silent && w.swarm.stats.strike > 20, dt);
    // undermine tell: the ground trembles when bugs are under your feet
    let under = 0;
    sw.hash.forEachNear(cam.x, cam.z, 3.5, (j) => {
      if (sw.alive[j] && sw.layer[j]) under++;
    });
    this.shake = Math.min(0.05, under * 0.002);
  }

  updateOverlay(dt: number, simMs: number) {
    const w = this.world, sw = w.swarm, st = sw.stats, tm = w.timings;
    this.overlay.update(dt, () => [
      `bugs ${sw.active} / target ${w.targetBugs}  drawn ${this.bugs.drawn}  sim'd ${st.simulated}`,
      `states  mass ${st.mass}  strike ${st.strike}  flow ${st.flow}  burn ${st.burn}  under ${st.under}  dig ${st.digging}  inLight ${st.inLight}`,
      `sim ${simMs.toFixed(2)} ms (light ${tm.light.toFixed(2)} vis ${tm.vis.toFixed(2)} swarm ${tm.swarm.toFixed(2)} fire ${tm.fire.toFixed(2)})  render ${this.renderMs.toFixed(2)} ms`,
      `fields ${w.fields.fields.size}  builds ${w.fields.stats.builds}  worker ${w.fields.stats.avgMs.toFixed(1)} ms  tendrils ${w.tendrils.size}  players ${w.players.length}`,
      ...(this.session ? [`net ${this.session.isHost ? 'host' : 'client'} (${this.session.t.kind}) room ${this.session.t.room}  peers ${this.session.isHost ? this.session.peers.size : 1}  ${this.session.isHost ? '' : `bug err ${this.session.stats.lastMeanErr.toFixed(3)} m (max ${this.session.stats.maxMeanErr.toFixed(3)})  snaps ${this.session.stats.snaps}`}`] : []),
      `calls ${this.renderer.info.render.calls}  tris ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k  terrain rebuilds ${this.terrain.rebuilds}`,
      `overwhelm ${(this.me.overwhelm * 100).toFixed(0)}%  touching ${this.me.touching}${this.panel.state.god ? '  [god]' : ''}  fuel ${w.fuel.value.toFixed(1)}`,
      `director ${w.director.state} (act ${w.director.act})  intensity ${w.director.team.toFixed(2)}  budget ${w.director.budget.toFixed(2)}  breaches ${w.breachAllowed ? 'on' : 'off'}`,
      `queen intent ${(w.queen ?? (w as any).remoteQueen)?.intent ?? '-'}${w.queen?.forced ? ' [forced]' : ''}  top: ${Object.entries((w.queen ?? (w as any).remoteQueen)?.scores ?? {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3).map(([k, v]: any) => `${k} ${v.toFixed(1)}`).join(', ')}`,
      `belief ${Object.entries(w.light.belief).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  ')}`,
      `unlocked ${[...w.learning.unlocked].join(', ') || '-'}`,
      `last tell: ${this.lastTell}`,
    ]);
  }

  benchTick(dtMs: number, simMs: number) {
    const b = this.bench!;
    if (b.done) return;
    // warm up: let the swarm cross the hall, fields build, and the ring form
    if (this.time < 9) return;
    b.samples.push(dtMs);
    b.sim.push(simMs);
    b.render.push(this.renderMs);
    b.bugs.push(this.bugs.drawn);
    if (b.samples.length >= 300) {
      b.done = true;
      const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
      b.result = {
        frames: b.samples.length,
        fps: 1000 / avg(b.samples),
        frameMsAvg: avg(b.samples),
        frameMsP95: pct(b.samples, 0.95),
        simMsAvg: avg(b.sim),
        simMsP95: pct(b.sim, 0.95),
        renderSubmitMsAvg: avg(b.render),
        cpuMsAvg: avg(b.sim) + avg(b.render),
        cpuMsP95: pct(b.sim.map((v, i) => v + b.render[i]), 0.95),
        bugsActive: this.world.swarm.active,
        bugsDrawnAvg: avg(b.bugs),
        drawCalls: this.renderer.info.render.calls,
        workerFieldMs: this.world.fields.stats.avgMs,
        massing: this.world.swarm.stats.mass,
        inLight: this.world.swarm.stats.inLight,
        pixelRatio: this.renderer.getPixelRatio(),
        size: [innerWidth, innerHeight],
      };
      console.log('[bench] ' + JSON.stringify(b.result));
    }
  }
}

export const cellSize = CELL;
