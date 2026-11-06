import * as THREE from 'three';
import { Camp, ItemKind, Device } from '../sim/camp';
import type { World, SimPlayer } from '../sim/world';
import { buildBugGeometry } from './bugMesh';

const mat = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2, flatShading: true, ...o });
const M = {
  yellow: mat(0xc9a227),
  dark: mat(0x2a2a2a),
  steel: mat(0x777777, { metalness: 0.6, roughness: 0.4 }),
  red: mat(0x8a2020),
  green: mat(0x2f6a33),
  copper: mat(0xb06a30, { metalness: 0.6 }),
  bulbOff: mat(0x555555, { emissive: 0x000000 }),
};

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
function cyl(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 6) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** Low-poly placeholder model for every item / device. Facing +z. */
export function makeItemMesh(kind: ItemKind): THREE.Group {
  const g = new THREE.Group();
  const bulb = () => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.bulbOff.clone());
    b.name = 'bulb';
    return b;
  };
  switch (kind) {
    case 'generator': {
      g.add(box(0.75, 0.45, 0.5, M.yellow, 0, 0.32, 0));
      g.add(box(0.8, 0.06, 0.55, M.dark, 0, 0.08, 0));
      g.add(cyl(0.05, 0.25, M.steel, 0.25, 0.65, -0.12));
      g.add(box(0.3, 0.12, 0.02, M.red, 0, 0.36, 0.26)); // Xterminator's decal
      const ind = bulb();
      ind.scale.setScalar(0.4);
      ind.position.set(-0.28, 0.58, 0.2);
      g.add(ind);
      break;
    }
    case 'lamp': {
      g.add(cyl(0.025, 1.0, M.steel, 0, 0.5, 0));
      g.add(cyl(0.18, 0.04, M.dark, 0, 0.02, 0, 8));
      const b = bulb();
      b.position.y = 1.1;
      g.add(b);
      break;
    }
    case 'floodlight': {
      for (let k = 0; k < 3; k++) {
        const leg = cyl(0.02, 1.6, M.steel);
        const a = (k / 3) * Math.PI * 2;
        leg.position.set(Math.sin(a) * 0.25, 0.78, Math.cos(a) * 0.25);
        leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
        g.add(leg);
      }
      const head = box(0.45, 0.32, 0.18, M.dark, 0, 1.65, 0);
      g.add(head);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.27), M.bulbOff.clone());
      face.name = 'bulb';
      face.position.set(0, 1.65, 0.095);
      g.add(face);
      break;
    }
    case 'motion': {
      g.add(cyl(0.03, 0.9, M.steel, 0, 0.45, 0));
      g.add(box(0.12, 0.08, 0.06, M.green, 0, 0.75, 0.05));
      const b = bulb();
      b.position.y = 1.0;
      g.add(b);
      break;
    }
    case 'splitter':
      g.add(box(0.25, 0.12, 0.18, M.dark, 0, 0.06, 0));
      g.add(box(0.05, 0.05, 0.05, M.copper, 0.1, 0.12, 0));
      g.add(box(0.05, 0.05, 0.05, M.copper, -0.1, 0.12, 0));
      break;
    case 'spool': {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.06, 6, 10), M.copper);
      t.position.y = 0.2;
      g.add(t);
      g.add(cyl(0.05, 0.16, M.dark, 0, 0.2, 0));
      g.children[1].rotation.x = Math.PI / 2;
      break;
    }
    case 'flashlight':
      g.add(cyl(0.035, 0.26, M.dark, 0, 0.04, 0, 8));
      g.children[0].rotation.x = Math.PI / 2;
      g.add(cyl(0.05, 0.06, M.steel, 0, 0.04, 0.15, 8));
      g.children[1].rotation.x = Math.PI / 2;
      break;
    case 'flamethrower':
    case 'sprayer':
      g.add(cyl(0.03, 0.7, kind === 'flamethrower' ? M.steel : M.green, 0, 0.05, 0.1));
      g.children[0].rotation.x = Math.PI / 2;
      g.add(cyl(0.12, 0.45, kind === 'flamethrower' ? M.red : M.green, 0, 0.12, -0.35, 8));
      break;
    case 'zapper':
      g.add(cyl(0.025, 0.6, M.dark, 0, 0.04, 0));
      g.children[0].rotation.x = Math.PI / 2;
      g.add(box(0.14, 0.02, 0.02, M.copper, 0, 0.04, 0.3));
      g.add(box(0.02, 0.02, 0.12, M.copper, 0.06, 0.04, 0.36));
      g.add(box(0.02, 0.02, 0.12, M.copper, -0.06, 0.04, 0.36));
      break;
    default:
      g.add(box(0.2, 0.2, 0.2, M.steel, 0, 0.1, 0));
  }
  return g;
}

export class CampMesh {
  group = new THREE.Group();
  devMeshes = new Map<number, THREE.Group>();
  floorMeshes = new Map<number, THREE.Group>();
  wireLines = new Map<number, { line: THREE.LineSegments; version: number }>();
  bodies: THREE.InstancedMesh;
  viewModel: THREE.Group | null = null;
  viewKind: string | null = null;
  private version = -1;
  private blink = 0;

  constructor(scene: THREE.Scene, public world: World, public camera: THREE.Camera) {
    scene.add(this.group);
    const bg = buildBugGeometry();
    bg.rotateZ(Math.PI); // belly up
    bg.translate(0, 0.22, 0);
    this.bodies = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }), 600);
    this.bodies.count = 0;
    this.bodies.frustumCulled = false;
    scene.add(this.bodies);
  }

  update(dt: number, me: SimPlayer) {
    const c = this.world.camp;
    this.blink += dt;
    if (c.version !== this.version) {
      this.version = c.version;
      this.syncObjects(c);
    }
    for (const d of c.devices) {
      const g = this.devMeshes.get(d.id);
      if (!g) continue;
      g.rotation.y = d.yaw;
      const bulb = g.getObjectByName('bulb') as THREE.Mesh | undefined;
      const on = d.kind === 'generator' ? d.running : !!d.light?.on;
      if (bulb) {
        const m = bulb.material as THREE.MeshStandardMaterial;
        m.emissive.setHex(on ? (d.kind === 'generator' ? 0x40ff40 : 0xffe0a0) : 0x000000);
        m.emissiveIntensity = on ? 2 : 0;
      }
      if (d.kind === 'generator') g.position.y = d.running ? Math.sin(this.blink * 70) * 0.006 : 0;
    }
    this.syncWires(c, me);
    // bodies
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (const b of c.bodies) {
      if (k >= 600) break;
      m4.makeRotationY((b.x * 13.1 + b.z * 7.7) % 6.28);
      m4.setPosition(b.x, 0, b.z);
      this.bodies.setMatrixAt(k++, m4);
    }
    this.bodies.count = k;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.syncViewModel(me);
  }

  private syncObjects(c: Camp) {
    const seenD = new Set<number>();
    for (const d of c.devices) {
      seenD.add(d.id);
      if (!this.devMeshes.has(d.id)) {
        const g = makeItemMesh(d.kind);
        g.position.set(d.x, 0, d.z);
        this.group.add(g);
        this.devMeshes.set(d.id, g);
      }
    }
    for (const [id, g] of this.devMeshes)
      if (!seenD.has(id)) {
        this.group.remove(g);
        this.devMeshes.delete(id);
      }
    const seenF = new Set<number>();
    for (const f of c.floor) {
      seenF.add(f.item.id);
      let g = this.floorMeshes.get(f.item.id);
      if (!g) {
        g = makeItemMesh(f.item.kind);
        if (!['generator', 'lamp', 'floodlight', 'motion'].includes(f.item.kind)) g.scale.setScalar(1.2);
        else if (f.item.kind !== 'generator') {
          g.rotation.z = Math.PI / 2; // lying on its side
          g.position.y = 0.1;
        }
        this.group.add(g);
        this.floorMeshes.set(f.item.id, g);
      }
      g.position.x = f.x;
      g.position.z = f.z;
    }
    for (const [id, g] of this.floorMeshes)
      if (!seenF.has(id)) {
        this.group.remove(g);
        this.floorMeshes.delete(id);
      }
  }

  private syncWires(c: Camp, me: SimPlayer) {
    const seen = new Set<number>();
    const flash = Math.sin(this.blink * 12) > 0;
    for (const wr of c.wires) {
      seen.add(wr.id);
      let e = this.wireLines.get(wr.id);
      const laying = !!wr.layer;
      if (!e) {
        const geo = new THREE.BufferGeometry();
        const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
        line.frustumCulled = false;
        this.group.add(line);
        e = { line, version: -1 };
        this.wireLines.set(wr.id, e);
      }
      if (e.version === wr.version && !laying && !wr.cuts.size && (e as any).live === wr.live) continue;
      e.version = wr.version;
      (e as any).live = wr.live;
      const pts = wr.points.slice();
      const holder = laying ? this.world.players.find((p) => p.id === wr.layer) : null;
      if (holder) pts.push({ x: holder.x + Math.sin(holder.yaw) * 0.3, z: holder.z + Math.cos(holder.yaw) * 0.3 });
      const pos: number[] = [], col: number[] = [];
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        const yA = k === 0 ? 0.25 : 0.03, yB = holder && k === pts.length - 2 ? 1.0 : 0.03;
        pos.push(a.x, yA, a.z, b.x, yB, b.z);
        const cut = wr.cuts.has(k);
        const chew = wr.chew.get(k) || 0;
        let r = 0.25, g = 0.25, bl = 0.25;
        if (wr.live) (r = 0.85), (g = 0.65), (bl = 0.2);
        if (chew > 0.2) (r = 0.9), (g = 0.4), (bl = 0.1);
        if (cut) (r = flash ? 1 : 0.2), (g = 0.05), (bl = 0.05);
        col.push(r, g, bl, r, g, bl);
      }
      e.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      e.line.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    }
    for (const [id, e] of this.wireLines)
      if (!seen.has(id)) {
        this.group.remove(e.line);
        e.line.geometry.dispose();
        this.wireLines.delete(id);
      }
  }

  private syncViewModel(me: SimPlayer) {
    const it = me.carrying ?? me.slots[me.sel] ?? null;
    const kind = it?.kind ?? null;
    if (kind === this.viewKind) return;
    this.viewKind = kind;
    if (this.viewModel) this.camera.remove(this.viewModel);
    this.viewModel = null;
    if (!kind) return;
    const g = makeItemMesh(kind);
    g.traverse((o: any) => {
      o.castShadow = false;
    });
    if (kind === 'generator') g.position.set(0, -0.75, -0.75);
    else if (['lamp', 'floodlight', 'motion'].includes(kind)) {
      g.scale.setScalar(0.45);
      g.position.set(0.32, -0.62, -0.6);
    } else {
      g.position.set(0.28, -0.3, -0.45);
      g.rotation.y = Math.PI; // camera looks down -z; models face +z
    }
    this.camera.add(g);
    this.viewModel = g;
  }
}

export type { Device };
