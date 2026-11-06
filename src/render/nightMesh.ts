import * as THREE from 'three';
import type { World } from '../sim/world';
import type { NightLayout } from '../sim/night';
import { buildBugGeometry } from './bugMesh';

const mat = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2, flatShading: true, ...o });

/** The Enlite logo, drawn: a black honeycomb hexagon around a bee whose body is a DNA helix, bright green wings, the wordmark with a green-dotted i. */
export function enliteLogoTexture(rust = 0.6) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const x = c.getContext('2d')!;
  x.fillStyle = `rgba(${90 + rust * 60},${60 + rust * 20},${40},1)`;
  x.fillRect(0, 0, 256, 320);
  // rust blotches
  for (let k = 0; k < 120; k++) {
    x.fillStyle = `rgba(${120 + Math.random() * 60},${50 + Math.random() * 30},20,${0.15 + Math.random() * 0.3})`;
    x.beginPath();
    x.arc(Math.random() * 256, Math.random() * 320, 2 + Math.random() * 14, 0, 6.3);
    x.fill();
  }
  const hex = (cx: number, cy: number, r: number) => {
    x.beginPath();
    for (let k = 0; k < 6; k++) x.lineTo(cx + Math.cos((k * Math.PI) / 3) * r, cy + Math.sin((k * Math.PI) / 3) * r);
    x.closePath();
  };
  x.lineWidth = 14;
  x.strokeStyle = '#111';
  hex(128, 120, 92);
  x.stroke();
  // wings
  x.fillStyle = '#4dff5a';
  x.beginPath();
  x.ellipse(98, 92, 30, 16, -0.6, 0, 6.3);
  x.ellipse(158, 92, 30, 16, 0.6, 0, 6.3);
  x.fill();
  // body: a double helix
  x.lineWidth = 4;
  for (const ph of [0, Math.PI]) {
    x.strokeStyle = ph ? '#d8c040' : '#222';
    x.beginPath();
    for (let y = 70; y <= 175; y += 3) x.lineTo(128 + Math.sin(y * 0.12 + ph) * 14, y);
    x.stroke();
  }
  for (let y = 74; y < 175; y += 10) {
    x.strokeStyle = '#333';
    x.beginPath();
    x.moveTo(128 + Math.sin(y * 0.12) * 14, y);
    x.lineTo(128 + Math.sin(y * 0.12 + Math.PI) * 14, y);
    x.stroke();
  }
  // wordmark
  x.fillStyle = '#111';
  x.font = 'bold 58px sans-serif';
  x.textAlign = 'center';
  x.fillText('Enlıte', 128, 285);
  x.fillStyle = '#4dff5a';
  x.beginPath();
  x.arc(160, 236, 6, 0, 6.3); // the green-dotted i
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class NightMesh {
  group = new THREE.Group();
  marks = new Map<string, THREE.Object3D>();
  queen: THREE.Mesh;
  truck: THREE.Group;
  eggs: THREE.Mesh[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, public w: World) {
    scene.add(this.group);
    const L = w.layout as NightLayout;
    const logoMat = new THREE.MeshStandardMaterial({ map: enliteLogoTexture(), roughness: 0.9 });
    for (const m of L.marks) {
      const k = `${m.kind}@${m.x.toFixed(1)},${m.z.toFixed(1)}`;
      let o: THREE.Object3D | null = null;
      if (m.kind === 'rig') {
        const g = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 5), mat(0x555048, { metalness: 0.6 }));
          const a = (i / 4) * Math.PI * 2 + 0.78;
          leg.position.set(Math.cos(a) * 0.5, 1.3, Math.sin(a) * 0.5);
          leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
          g.add(leg);
        }
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), mat(0x3a3a30));
        pump.position.y = 0.25;
        g.add(pump);
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8), mat(0x1a1410, { roughness: 0.2, metalness: 0.5 }));
        tank.position.set(0.8, 0.45, 0);
        g.add(tank);
        o = g;
      } else if (m.kind === 'tank') {
        o = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8), mat(0xa02020));
        o.position.y = 0.4;
      } else if (m.kind === 'suit') {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 1.2, 7), mat(0x1e2a1e));
        body.position.y = 0.9;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.05), mat(0x40d050, { emissive: 0x103010 }));
        panel.position.set(0, 1.1, 0.27);
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), mat(0x223322, { metalness: 0.5 }));
        helm.position.y = 1.65;
        g.add(body, panel, helm);
        o = g;
      } else if (m.kind === 'logo') {
        o = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2), logoMat);
        o.position.y = 1.4;
        o.rotation.y = Math.random() * 6.28;
      } else if (m.kind === 'egg') {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.7, 9, 7), mat(0xc8c0a0, { roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.85 }));
        e.scale.set(1, 1.3, 1);
        e.position.y = 0.8;
        this.eggs.push(e);
        o = e;
      }
      if (o) {
        o.position.x = m.x;
        o.position.z = m.z;
        this.group.add(o);
        this.marks.set(k, o);
      }
    }
    // the queen: the same alien bug, enormous
    const qg = buildBugGeometry();
    qg.scale(11, 11, 11);
    this.queen = new THREE.Mesh(qg, new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.12, metalness: 0.5, side: THREE.DoubleSide }));
    this.queen.castShadow = true;
    this.group.add(this.queen);
    // the Enlite digging truck
    const tg = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 3.0), mat(0x5a5a40, { metalness: 0.5 }));
    body.position.y = 0.9;
    const drill = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 8), mat(0x888888, { metalness: 0.8, roughness: 0.3 }));
    drill.rotation.x = Math.PI / 2;
    drill.position.set(0, 0.9, 2.2);
    drill.name = 'drill';
    tg.add(body, drill);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 8), mat(0x151515));
      wh.rotation.z = Math.PI / 2;
      wh.position.set(x * 1.0, 0.45, z * 1.0);
      tg.add(wh);
    }
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1), new THREE.MeshStandardMaterial({ map: enliteLogoTexture(0.2) }));
    logo.position.set(0.91, 1.0, 0);
    logo.rotation.y = Math.PI / 2;
    tg.add(logo);
    this.truck = tg;
    this.group.add(tg);
  }

  update(dt: number) {
    const w = this.w, r = w.run, f = w.finale;
    this.t += dt;
    if (r) {
      for (const [k, o] of this.marks) {
        if ((k.startsWith('tank') || k.startsWith('suit')) && r.used.has(k)) o.visible = false;
      }
      r.eggs.forEach((e, i) => {
        const m = this.eggs[i];
        if (!m) return;
        m.visible = e.hp > 0;
        m.scale.set(1 + Math.sin(this.t * 2 + i) * 0.04, 1.3 + Math.sin(this.t * 2.3 + i) * 0.05, 1);
      });
    }
    if (f) {
      const q = f.queen;
      this.queen.visible = q.alive;
      this.queen.position.set(q.x, 0, q.z);
      const t = f.truck;
      this.queen.rotation.y = Math.atan2(t.x - q.x, t.z - q.z);
      if (f.state !== 'driving') this.queen.rotation.y = Math.sin(this.t * 0.3) * 0.4 - Math.PI / 2; // brooding in her chamber
      this.truck.position.set(t.x, 0, t.z);
      this.truck.rotation.y = t.yaw;
      const drill = this.truck.getObjectByName('drill')!;
      drill.rotation.z += dt * (t.digging ? 30 : t.speed * 2);
    }
  }
}
