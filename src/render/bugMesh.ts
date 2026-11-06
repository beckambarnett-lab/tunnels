import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Swarm, BURN, STRIKE } from '../sim/swarm';

/** One draw call for the whole swarm: InstancedMesh with leg animation in the vertex shader. */
export class BugMesh {
  mesh: THREE.InstancedMesh;
  phase: THREE.InstancedBufferAttribute;
  speed: THREE.InstancedBufferAttribute;
  uniforms = { uTime: { value: 0 } };
  drawn = 0;
  private colBurn = new THREE.Color(3.0, 1.1, 0.25);
  private colBase = new THREE.Color(1, 1, 1);
  private colStrike = new THREE.Color(1.25, 0.95, 0.95);

  constructor(public max: number) {
    const geo = buildBugGeometry();
    this.phase = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.speed = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    geo.setAttribute('aPhase', this.phase);
    geo.setAttribute('aSpeed', this.speed);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.16, metalness: 0.45, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aLeg; attribute float aTip; attribute float aPhase; attribute float aSpeed; uniform float uTime;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float li = abs(aLeg);
          if (li > 0.5) {
            float side = sign(aLeg);
            float ph = uTime * (6.0 + 22.0 * aSpeed) + aPhase + li * 1.9 + (side > 0.0 ? 3.1416 : 0.0);
            float amp = 0.012 + 0.05 * aSpeed;
            transformed.y += aTip * max(0.0, sin(ph)) * amp * 1.4;
            transformed.z += aTip * cos(ph) * amp;
          } else {
            // body breathing / twitch
            transformed.y += sin(uTime * 9.0 + aPhase) * 0.004;
          }`,
        );
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.setColorAt(0, this.colBase);
  }

  /**
   * `bodies`: tendrils whose bugs are massed into a human shape (respawn ritual). Render-only:
   * those bugs are stacked into a 1.7 m figure around the group's centre.
   */
  update(sw: Swarm, time: number, bodies?: Map<number, { x: number; z: number; shock: boolean }>) {
    const rank = new Map<number, number>();
    this.uniforms.uTime.value = time;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const ph = this.phase.array as Float32Array;
    const spd = this.speed.array as Float32Array;
    const colors = this.mesh.instanceColor!;
    let k = 0;
    for (let i = 0; i < sw.count; i++) {
      if (!sw.alive[i] || sw.layer[i]) continue;
      let h = sw.heading[i];
      const burning = sw.state[i] === BURN;
      let bx = sw.x[i], by = sw.y[i], bz = sw.z[i];
      const body = bodies?.get(sw.tendril[i]);
      if (body) {
        const r = rank.get(sw.tendril[i]) ?? 0;
        rank.set(sw.tendril[i], r + 1);
        const hgt = ((r * 0.6180339) % 1) * 1.75;
        // a rough human silhouette: legs, torso, shoulders, head
        const prof = hgt < 0.8 ? 0.16 : hgt < 1.35 ? 0.24 : hgt < 1.5 ? 0.3 : 0.13;
        const a = r * 2.399 + time * (body.shock ? 9 : 0.6);
        const twitch = body.shock ? Math.sin(time * 50 + r) * 0.05 : Math.sin(time * 3 + r) * 0.02;
        bx = body.x + Math.cos(a) * (prof + twitch) + (hgt < 0.8 ? (r % 2 ? 0.12 : -0.12) : 0);
        bz = body.z + Math.sin(a) * (prof + twitch);
        by = hgt;
        h = a;
      }
      const s = burning ? 1.1 : 0.9 + (sw.phase[i] % 1) * 0.25;
      const c = Math.cos(h) * s, sn = Math.sin(h) * s;
      const o = k * 16;
      m[o] = c;
      m[o + 1] = 0;
      m[o + 2] = -sn;
      m[o + 3] = 0;
      m[o + 4] = 0;
      m[o + 5] = s;
      m[o + 6] = 0;
      m[o + 7] = 0;
      m[o + 8] = sn;
      m[o + 9] = 0;
      m[o + 10] = c;
      m[o + 11] = 0;
      m[o + 12] = bx;
      m[o + 13] = by;
      m[o + 14] = bz;
      m[o + 15] = 1;
      ph[k] = sw.phase[i];
      spd[k] = burning ? 1 : Math.min(1, Math.hypot(sw.vx[i], sw.vz[i]) / 4);
      colors.setXYZ(k, ...(burning ? this.colBurn : sw.state[i] === STRIKE ? this.colStrike : this.colBase).toArray() as [number, number, number]);
      k++;
    }
    this.mesh.count = k;
    this.drawn = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    colors.needsUpdate = true;
    this.phase.needsUpdate = true;
    this.speed.needsUpdate = true;
  }
}

function tag(g: THREE.BufferGeometry, leg: number, tipFrom: number, tipTo: number) {
  const n = g.attributes.position.count;
  const legA = new Float32Array(n).fill(leg);
  const tipA = new Float32Array(n);
  // tip weight by distance from hip along the leg's local x
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    const t = (Math.abs(p.getX(i)) - tipFrom) / Math.max(1e-3, tipTo - tipFrom);
    tipA[i] = Math.max(0, Math.min(1, t));
  }
  g.setAttribute('aLeg', new THREE.BufferAttribute(legA, 1));
  g.setAttribute('aTip', new THREE.BufferAttribute(tipA, 1));
  return g;
}

function body(geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
  geo.scale(sx, sy, sz);
  geo.translate(x, y, z);
  return tag(geo.toNonIndexed(), 0, 1, 2);
}

/** A low-poly alien bug, ~0.35 m long, facing +z: thorax, abdomen, head, mandibles, 8 two-jointed legs. */
export function buildBugGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(body(new THREE.IcosahedronGeometry(0.07, 0), 1.1, 0.7, 1.35, 0, 0.12, 0.02)); // thorax
  parts.push(body(new THREE.IcosahedronGeometry(0.09, 0), 1.0, 0.75, 1.5, 0, 0.13, -0.15)); // abdomen
  parts.push(body(new THREE.IcosahedronGeometry(0.045, 0), 1.2, 0.8, 1.1, 0, 0.12, 0.13)); // head
  for (const s of [-1, 1]) {
    const m = new THREE.ConeGeometry(0.012, 0.07, 4);
    m.rotateX(Math.PI / 2);
    m.rotateY(-s * 0.4);
    m.translate(s * 0.022, 0.1, 0.19);
    parts.push(tag(m.toNonIndexed(), 0, 1, 2));
  }
  // 8 legs, each an upper segment rising outward and a lower one dropping to the floor
  const zs = [0.08, 0.03, -0.03, -0.09];
  zs.forEach((z, li) => {
    for (const s of [-1, 1]) {
      const up = new THREE.BoxGeometry(0.13, 0.012, 0.012);
      up.translate(0.065, 0, 0);
      up.rotateZ(0.55);
      up.translate(0.04, 0.12, 0);
      const lo = new THREE.BoxGeometry(0.16, 0.01, 0.01);
      lo.translate(0.08, 0, 0);
      lo.rotateZ(-1.0);
      lo.translate(0.04 + 0.13 * Math.cos(0.55), 0.12 + 0.13 * Math.sin(0.55), 0);
      for (const seg of [up, lo]) {
        seg.rotateY(-(li - 1.5) * 0.35);
        if (s < 0) seg.scale(-1, 1, 1);
        seg.translate(0, 0, z);
      }
      parts.push(tag(up.toNonIndexed(), s * (li + 1), 0.04, 0.3));
      parts.push(tag(lo.toNonIndexed(), s * (li + 1), 0.04, 0.3));
    }
  });
  // mirrored geometry (scale -1) flips winding; three handles normals per vertex so recompute
  const merged = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }), false)!;
  merged.computeVertexNormals();
  return merged;
}
