import * as THREE from 'three';
import { PLAYER } from '../config';
import { Grid } from '../sim/grid';
import type { SimPlayer } from '../sim/world';
import { Input } from './input';

/** First-person controller driving a SimPlayer. Forward = (sin yaw, cos yaw) on x/z. */
export class PlayerController {
  sens = 0.0022;
  bob = 0;
  speedMul = 1;
  constructor(public p: SimPlayer, public grid: Grid, public camera: THREE.PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
  }

  update(dt: number, input: Input, enabled: boolean) {
    const p = this.p;
    if (enabled) {
      p.yaw -= input.mouse.dx * this.sens;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - input.mouse.dy * this.sens));
    }
    let mx = 0, mz = 0;
    if (p.hive) {
      // in the hive you see from your bugs: low to the ground; WASD steers the group (see Game.hiveMove)
      this.camera.position.set(p.x - Math.sin(p.yaw) * 1.2, 0.55, p.z - Math.cos(p.yaw) * 1.2);
      this.camera.rotation.set(p.pitch * 0.6, p.yaw + Math.PI, 0);
      return;
    }
    if (enabled && !p.downed) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const rx = -fz, rz = fx;
      if (input.down('KeyW')) (mx += fx), (mz += fz);
      if (input.down('KeyS')) (mx -= fx), (mz -= fz);
      if (input.down('KeyD')) (mx += rx), (mz += rz);
      if (input.down('KeyA')) (mx -= rx), (mz -= rz);
    }
    p.crouch = input.down('ControlLeft') || input.down('KeyC');
    const sprint = input.down('ShiftLeft') && !p.crouch;
    const speed = (p.crouch ? PLAYER.crouch : sprint ? PLAYER.sprint : PLAYER.walk) * this.speedMul;
    const l = Math.hypot(mx, mz);
    if (l > 0) {
      mx = (mx / l) * speed * dt;
      mz = (mz / l) * speed * dt;
      this.bob += dt * speed * 2.2;
    }
    this.move(mx, mz);
    const eye = p.crouch ? PLAYER.eyeCrouch : PLAYER.eye;
    this.camera.position.set(p.x, (p.downed ? 0.35 : eye) + Math.sin(this.bob) * 0.03, p.z);
    this.camera.rotation.set(p.pitch, p.yaw + Math.PI, p.downed ? 0.6 : 0);
  }

  private free(x: number, z: number) {
    const r = PLAYER.radius;
    const g = this.grid;
    return g.isOpenAt(x - r, z - r) && g.isOpenAt(x + r, z - r) && g.isOpenAt(x - r, z + r) && g.isOpenAt(x + r, z + r);
  }

  move(dx: number, dz: number) {
    const p = this.p;
    if (dx && this.free(p.x + dx, p.z)) p.x += dx;
    if (dz && this.free(p.x, p.z + dz)) p.z += dz;
    if (!this.free(p.x, p.z)) {
      // a dig/collapse closed in on us: nudge toward the nearest free spot
      for (const [ox, oz] of [[0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]])
        if (this.free(p.x + ox, p.z + oz)) {
          p.x += ox;
          p.z += oz;
          break;
        }
    }
  }

  forward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }
}
