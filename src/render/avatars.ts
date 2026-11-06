import * as THREE from 'three';
import type { World } from '../sim/world';

/** Teammates: goofy branded Xterminator's jumpsuits, low-poly. Downed players lie on the floor. */
export class PlayerAvatars {
  meshes = new Map<string, THREE.Group>();
  constructor(public scene: THREE.Scene, public world: World, public localId: string) {}
  private make() {
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0xd8701c, roughness: 0.7, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, flatShading: true });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.1, 7), suit);
    body.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), dark); // gas mask
    head.position.y = 1.55;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 6), new THREE.MeshStandardMaterial({ color: 0x8a2020, flatShading: true }));
    tank.position.set(0, 1.0, -0.28);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.22), dark);
    legs.position.y = 0.2;
    for (const m of [body, head, tank, legs]) {
      m.castShadow = true;
      g.add(m);
    }
    return g;
  }
  update(time: number) {
    const seen = new Set<string>();
    for (const p of this.world.players) {
      if (p.id === this.localId || !p.alive || p.hive) continue;
      seen.add(p.id);
      let g = this.meshes.get(p.id);
      if (!g) {
        g = this.make();
        this.scene.add(g);
        this.meshes.set(p.id, g);
      }
      // simple smoothing toward the synced pose
      g.position.x += (p.x - g.position.x) * 0.35;
      g.position.z += (p.z - g.position.z) * 0.35;
      g.rotation.y = p.yaw;
      g.rotation.x = p.downed ? -Math.PI / 2 : 0;
      g.position.y = p.downed ? 0.25 : 0;
      g.scale.y = p.crouch ? 0.7 : 1;
      void time;
    }
    for (const [id, g] of this.meshes)
      if (!seen.has(id)) {
        this.scene.remove(g);
        this.meshes.delete(id);
      }
  }
}
