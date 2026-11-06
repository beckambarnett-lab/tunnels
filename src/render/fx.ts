import * as THREE from 'three';
import { CELL, WALL_H } from '../config';
import { Fire } from '../sim/fire';
import { World } from '../sim/world';
import { BURN } from '../sim/swarm';
import { Rng } from '../core/rng';

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Flames, burning bugs, dirt trickles, breach bursts and wall cracks (the digging tells). */
export class Fx {
  firePts: THREE.Points;
  fireGeo: THREE.BufferGeometry;
  dirtPts: THREE.Points;
  dirtGeo: THREE.BufferGeometry;
  cracks: THREE.InstancedMesh;
  maxFire = 1200;
  maxDirt = 900;
  dirt = { x: new Float32Array(900), y: new Float32Array(900), z: new Float32Array(900), vy: new Float32Array(900), vx: new Float32Array(900), vz: new Float32Array(900), life: new Float32Array(900), n: 0 };
  rng = new Rng(77);
  private crackTimer = 0;

  constructor(scene: THREE.Scene, public world: World) {
    const tex = dotTexture();
    this.fireGeo = new THREE.BufferGeometry();
    this.fireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxFire * 3), 3));
    this.fireGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.maxFire * 3), 3));
    this.firePts = new THREE.Points(
      this.fireGeo,
      new THREE.PointsMaterial({ size: 0.38, map: tex, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.firePts.frustumCulled = false;
    scene.add(this.firePts);
    this.dirtGeo = new THREE.BufferGeometry();
    this.dirtGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxDirt * 3), 3));
    this.dirtPts = new THREE.Points(this.dirtGeo, new THREE.PointsMaterial({ size: 0.05, color: 0x6b5442 }));
    this.dirtPts.frustumCulled = false;
    scene.add(this.dirtPts);
    const crackGeo = new THREE.ConeGeometry(0.22, 0.5, 5);
    crackGeo.rotateX(Math.PI / 2);
    this.cracks = new THREE.InstancedMesh(crackGeo, new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.95, flatShading: true }), 400);
    this.cracks.count = 0;
    this.cracks.frustumCulled = false;
    scene.add(this.cracks);
    world.events.on('breach', (e) => this.burst(e.x, e.z, e.kind === 'ceiling' ? WALL_H - 0.2 : e.kind === 'floor' ? 0.05 : 1.2, 40));
    world.events.on('dig', (e) => this.burst(e.x, e.z, 0.8, 6));
    world.events.on('collapse', (e) => this.burst(e.x, e.z, 1.5, 30));
    world.events.on('zap', (e) => this.arc(scene, e.x, e.z));
    world.events.on('wireCut', (e) => this.burst(e.x, e.z, 0.1, 8));
  }

  burst(x: number, z: number, y: number, n: number) {
    const d = this.dirt;
    for (let k = 0; k < n && d.n < this.maxDirt; k++) {
      const i = d.n++;
      d.x[i] = x + (this.rng.next() - 0.5) * 0.4;
      d.y[i] = y + (this.rng.next() - 0.5) * 0.4;
      d.z[i] = z + (this.rng.next() - 0.5) * 0.4;
      d.vx[i] = (this.rng.next() - 0.5) * 3;
      d.vz[i] = (this.rng.next() - 0.5) * 3;
      d.vy[i] = this.rng.next() * 2;
      d.life[i] = 1 + this.rng.next();
    }
  }

  arcs: { line: THREE.Line; life: number }[] = [];
  /** Zapper arc: a jagged blue-white line for a split second. */
  arc(scene: THREE.Scene, x: number, z: number) {
    const p = this.world.players[0];
    const pts: THREE.Vector3[] = [];
    const sx = p ? p.x : x, sz = p ? p.z : z;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector3(sx + (x - sx) * t * 2 + (Math.random() - 0.5) * 0.25, 1.1 - t * 0.9 + (Math.random() - 0.5) * 0.2, sz + (z - sz) * t * 2 + (Math.random() - 0.5) * 0.25));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xbfe6ff }));
    scene.add(line);
    this.arcs.push({ line, life: 0.12 });
  }

  trickle(x: number, z: number) {
    const d = this.dirt;
    if (d.n >= this.maxDirt) return;
    const i = d.n++;
    d.x[i] = x + (this.rng.next() - 0.5) * 0.3;
    d.z[i] = z + (this.rng.next() - 0.5) * 0.3;
    d.y[i] = WALL_H - 0.3;
    d.vx[i] = d.vz[i] = 0;
    d.vy[i] = 0;
    d.life[i] = 1.6;
  }

  update(dt: number, fire: Fire, time: number) {
    const w = this.world, sw = w.swarm;
    for (const a of this.arcs) {
      a.life -= dt;
      if (a.life <= 0) {
        a.line.parent?.remove(a.line);
        a.line.geometry.dispose();
      }
    }
    this.arcs = this.arcs.filter((a) => a.life > 0);
    // fire particles + burning bugs
    const pos = this.fireGeo.attributes.position.array as Float32Array;
    const col = this.fireGeo.attributes.color.array as Float32Array;
    let k = 0;
    for (let i = 0; i < fire.count && k < this.maxFire; i++, k++) {
      pos[k * 3] = fire.x[i];
      pos[k * 3 + 1] = fire.y[i];
      pos[k * 3 + 2] = fire.z[i];
      const t = Math.max(0, Math.min(1, fire.life[i] / 0.6));
      col[k * 3] = 1;
      col[k * 3 + 1] = 0.25 + 0.5 * t;
      col[k * 3 + 2] = 0.05 + 0.2 * t * t;
    }
    for (let i = 0; i < sw.count && k < this.maxFire; i++) {
      if (!sw.alive[i] || sw.state[i] !== BURN) continue;
      pos[k * 3] = sw.x[i] + Math.sin(time * 40 + i) * 0.05;
      pos[k * 3 + 1] = 0.2 + Math.abs(Math.sin(time * 23 + i)) * 0.15;
      pos[k * 3 + 2] = sw.z[i];
      col[k * 3] = 1;
      col[k * 3 + 1] = 0.45;
      col[k * 3 + 2] = 0.1;
      k++;
    }
    this.fireGeo.setDrawRange(0, k);
    this.fireGeo.attributes.position.needsUpdate = true;
    this.fireGeo.attributes.color.needsUpdate = true;

    // dirt trickle above bugs waiting under the floor near a player (undermine tell)
    for (let i = 0; i < sw.count; i += 7) {
      if (!sw.alive[i] || !sw.layer[i]) continue;
      for (const p of w.players) {
        if (Math.abs(p.x - sw.x[i]) < 10 && Math.abs(p.z - sw.z[i]) < 10 && this.rng.next() < dt * 3) this.trickle(sw.x[i], sw.z[i]);
      }
    }
    const d = this.dirt;
    const dp = this.dirtGeo.attributes.position.array as Float32Array;
    let i = 0;
    while (i < d.n) {
      d.life[i] -= dt;
      d.vy[i] -= 9 * dt;
      d.x[i] += d.vx[i] * dt;
      d.y[i] += d.vy[i] * dt;
      d.z[i] += d.vz[i] * dt;
      if (d.y[i] < 0.02) {
        d.y[i] = 0.02;
        d.vx[i] *= 0.5;
        d.vz[i] *= 0.5;
        d.vy[i] = 0;
      }
      if (d.life[i] <= 0) {
        const l = --d.n;
        for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life'] as const) d[key][i] = d[key][l];
        continue;
      }
      dp[i * 3] = d.x[i];
      dp[i * 3 + 1] = d.y[i];
      dp[i * 3 + 2] = d.z[i];
      i++;
    }
    this.dirtGeo.setDrawRange(0, d.n);
    this.dirtGeo.attributes.position.needsUpdate = true;

    // wall cracks where bugs are digging toward a face (bulging, cracking just before a breach)
    this.crackTimer -= dt;
    if (this.crackTimer <= 0) {
      this.crackTimer = 0.2;
      const g = w.grid;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      let c = 0;
      for (let ci = 0; ci < g.n && c < 400; ci++) {
        const prog = g.digProgress[ci];
        if (prog < 0.25 || g.cells[ci] !== 1) continue;
        const x = ci % g.w, y = (ci / g.w) | 0;
        // face toward an open neighbour
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) {
          if (!g.isOpen(x + dx, y + dy)) continue;
          p.set((x + 0.5 + dx * 0.5) * CELL, 1.0 + (Math.sin(ci) * 0.4), (y + 0.5 + dy * 0.5) * CELL);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dy));
          const sc = 0.4 + prog * 1.4 + Math.sin(time * 30 + ci) * 0.05 * prog;
          s.set(sc, sc, sc * 0.6);
          m.compose(p, q, s);
          this.cracks.setMatrixAt(c++, m);
          break;
        }
      }
      this.cracks.count = c;
      this.cracks.instanceMatrix.needsUpdate = true;
    }
  }
}
