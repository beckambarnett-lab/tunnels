import * as THREE from 'three';
import type { LightSource } from '../sim/light';

const COLORS: Record<string, number> = {
  fire: 0xff7a22,
  burn: 0xff8c30,
  flare: 0xff3020,
  flashlight: 0xfff1d8,
  lamp: 0xffd9a0,
  floodlight: 0xe8f0ff,
  motion: 0xd8ffe0,
};

/**
 * Mirrors sim light sources with a fixed pool of Three.js lights (forward rendering can't afford
 * one real light per burning bug). The local player's flashlight is a shadow-casting spotlight
 * on the camera; everything else competes for a pool of point lights by distance and strength.
 */
export class LightRenderer {
  flash: THREE.SpotLight;
  pool: THREE.PointLight[] = [];
  spots: THREE.SpotLight[] = [];
  ambient: THREE.HemisphereLight;
  private flick = 0;

  constructor(scene: THREE.Scene, camera: THREE.Camera, poolSize = 8) {
    this.ambient = new THREE.HemisphereLight(0x223040, 0x080604, 0.06);
    scene.add(this.ambient);
    this.flash = new THREE.SpotLight(0xfff1d8, 22, 20, 0.5, 0.5, 1.2);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.camera.near = 0.2;
    this.flash.shadow.bias = -0.002;
    camera.add(this.flash);
    this.flash.position.set(0.25, -0.25, 0);
    camera.add(this.flash.target);
    this.flash.target.position.set(0, -0.6, -5);
    for (let i = 0; i < poolSize; i++) {
      const p = new THREE.PointLight(0xffffff, 0, 6, 1.4);
      scene.add(p);
      this.pool.push(p);
    }
    for (let i = 0; i < 3; i++) {
      const s = new THREE.SpotLight(0xffffff, 0, 12, 0.6, 0.5, 1.3);
      scene.add(s);
      scene.add(s.target);
      this.spots.push(s);
    }
  }

  update(sources: LightSource[], localId: string | null, camPos: THREE.Vector3, time: number) {
    this.flick += 1;
    const cands: { s: LightSource; score: number }[] = [];
    const spotCands: { s: LightSource; score: number }[] = [];
    let localFlash: LightSource | null = null;
    // aggregate burning bugs into a few clusters
    const clusters = new Map<string, { x: number; z: number; n: number }>();
    for (const s of sources) {
      if (!s.on) continue;
      if (s.kind === 'flashlight' && s.owner === localId) {
        localFlash = s;
        continue;
      }
      if (s.kind === 'burn') {
        const k = Math.floor(s.x / 4) + ',' + Math.floor(s.z / 4);
        const c = clusters.get(k) || { x: 0, z: 0, n: 0 };
        c.x += s.x;
        c.z += s.z;
        c.n++;
        clusters.set(k, c);
        continue;
      }
      const d = Math.hypot(s.x - camPos.x, s.z - camPos.z);
      const score = (s.intensity * s.radius) / (1 + d);
      if (s.cone < Math.PI - 1e-3) spotCands.push({ s, score });
      else cands.push({ s, score });
    }
    for (const c of clusters.values()) {
      const x = c.x / c.n, z = c.z / c.n;
      const d = Math.hypot(x - camPos.x, z - camPos.z);
      const s = { kind: 'burn', x, z, y: 0.4, radius: 2 + Math.sqrt(c.n), intensity: Math.min(3, 0.6 + c.n * 0.15), cone: Math.PI, on: true } as any;
      cands.push({ s, score: (s.intensity * s.radius) / (1 + d) });
    }
    this.flash.visible = !!localFlash;
    if (localFlash) this.flash.intensity = 22 * localFlash.intensity;
    cands.sort((a, b) => b.score - a.score);
    spotCands.sort((a, b) => b.score - a.score);
    // cones that don't fit the spot pool fall back to point lights
    for (const extra of spotCands.slice(this.spots.length)) cands.push(extra);
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      const c = cands[i];
      if (!c) {
        p.intensity = 0;
        p.visible = false;
        continue;
      }
      const s = c.s;
      p.visible = true;
      p.color.setHex(COLORS[s.kind] ?? 0xffffff);
      const fire = s.kind === 'fire' || s.kind === 'burn' || s.kind === 'flare';
      const fl = fire ? 0.8 + 0.2 * Math.sin(time * 31 + i * 7) * Math.sin(time * 17 + i) : 1;
      p.intensity = 14 * s.intensity * fl;
      p.distance = s.radius * 1.6;
      p.position.set(s.x, s.y ?? 1, s.z);
    }
    for (let i = 0; i < this.spots.length; i++) {
      const sp = this.spots[i];
      const c = spotCands[i];
      if (!c) {
        sp.intensity = 0;
        sp.visible = false;
        continue;
      }
      const s = c.s;
      sp.visible = true;
      sp.color.setHex(COLORS[s.kind] ?? 0xffffff);
      const fire = s.kind === 'fire';
      sp.intensity = (fire ? 30 : 45) * s.intensity * (fire ? 0.8 + 0.2 * Math.sin(time * 29 + i) : 1);
      sp.distance = s.radius * 1.4;
      sp.angle = Math.min(1.3, s.cone * 1.1);
      sp.position.set(s.x, s.y ?? 1, s.z);
      sp.target.position.set(s.x + s.dirX * 4, 0.2, s.z + s.dirZ * 4);
    }
  }
}
