import * as THREE from 'three';
import { CELL } from '../config';
import { World } from '../sim/world';

export type DebugView = 'off' | 'flow' | 'flowUnder' | 'light' | 'seen' | 'danger' | 'opportunity' | 'memory';
export const DEBUG_VIEWS: DebugView[] = ['off', 'flow', 'flowUnder', 'light', 'seen', 'danger', 'opportunity', 'memory'];

/** Floor overlays: flow-field distance + direction, light cost, breach visibility mask. */
export class DebugViews {
  mesh: THREE.Mesh;
  tex: THREE.DataTexture;
  data: Uint8Array;
  view: DebugView = 'off';
  private t = 0;

  constructor(scene: THREE.Scene, public world: World) {
    const g = world.grid;
    this.data = new Uint8Array(g.w * g.h * 4);
    this.tex = new THREE.DataTexture(this.data, g.w, g.h, THREE.RGBAFormat);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(g.w * CELL, g.h * CELL);
    geo.rotateX(-Math.PI / 2);
    // plane UV v runs +z; DataTexture row 0 is v=0 -> flip so row y maps to z
    geo.translate((g.w * CELL) / 2, 0.04, (g.h * CELL) / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  setView(v: DebugView) {
    this.view = v;
    this.mesh.visible = v !== 'off';
    this.t = 0;
  }

  /** The field shown: the first tendril's (or the one targeting the local player). */
  private field() {
    for (const t of this.world.tendrils.values()) if (t.field?.dist && (this.view === 'flowUnder' ? t.params.allowUnder : !t.params.allowUnder)) return t.field;
    for (const t of this.world.tendrils.values()) if (t.field?.dist) return t.field;
    return null;
  }

  update(dt: number) {
    if (this.view === 'off') return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    const w = this.world, g = w.grid, d = this.data;
    const n = g.n;
    const f = this.view === 'flow' || this.view === 'flowUnder' ? this.field() : null;
    const off = this.view === 'flowUnder' ? n : 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      let r = 0, gg = 0, b = 0, a = 0;
      if (this.view === 'danger' || this.view === 'opportunity' || this.view === 'memory') {
        const inf = w.queen?.influence;
        if (inf && g.cells[i] === 0) {
          const map = this.view === 'danger' ? inf.danger : this.view === 'opportunity' ? inf.opportunity : inf.memory;
          const v = Math.min(1, inf.at(map, g.centerX(i), g.centerZ(i)) / (this.view === 'memory' ? 3 : 2));
          if (this.view === 'danger') (r = 255 * v), (gg = 60 * v);
          else if (this.view === 'opportunity') (gg = 255 * v), (b = 120 * v);
          else (r = 160 * v), (b = 255 * v);
          a = v > 0.02 ? 60 + 150 * v : 0;
        }
      } else if (this.view === 'light') {
        const e = w.light.eff[i], raw = w.light.raw[i];
        r = Math.min(255, e * 255);
        gg = Math.min(255, raw * 120);
        b = 0;
        a = e > 0.005 || raw > 0.005 ? 170 : 0;
        if (g.cells[i] !== 0) a = 0;
      } else if (this.view === 'seen') {
        if (w.vis.seen[i]) {
          b = 255;
          gg = 90;
          a = 110;
        }
        if (g.cells[i] === 1 && g.digProgress[i] > 0) {
          r = 255;
          gg = 40;
          a = 220;
        }
      } else if (f?.dist) {
        const dist = f.dist[i + off];
        if (isFinite(dist)) {
          const band = (dist % 20) / 20;
          r = 40 + band * 200;
          gg = 220 - band * 180;
          b = 80;
          a = g.cells[i] === 0 ? 120 : 200;
          // next step direction encoded as brightness tick toward the target
          const nx = f.next![i + off];
          if (nx >= 0 && nx < n && g.cells[nx] === 1) {
            r = 255;
            gg = 255;
            b = 255;
            a = 230; // digging step
          } else if (nx >= n && off === 0) {
            r = 160;
            gg = 0;
            b = 255;
            a = 230; // dive step
          }
        }
      }
      d[o] = r;
      d[o + 1] = gg;
      d[o + 2] = b;
      d[o + 3] = a;
    }
    this.tex.needsUpdate = true;
  }
}
