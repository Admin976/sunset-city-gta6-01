// Third-person orbit camera. Drag (or pointer lock) to look around, wheel to zoom,
// everything smoothed with exponential lerp, and the boom pulled in when a building is in the way.
import * as THREE from 'three';
import { CAMERA } from './config.js';

export class OrbitCamera {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.dom = domElement;
    this.colliders = colliders;
    this.yaw = Math.PI * 0.15;
    this.pitch = CAMERA.pitch;
    this.distance = CAMERA.distance;
    this.wantDistance = CAMERA.distance;
    this.locked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.currentDistance = CAMERA.distance;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.initialised = false;

    this._bind();
  }

  _bind() {
    const dom = this.dom;

    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      dom.setPointerCapture?.(e.pointerId);
    });
    dom.addEventListener('pointerup', (e) => {
      this.dragging = false;
      try { dom.releasePointerCapture?.(e.pointerId); } catch { /* pointer already released */ }
    });
    dom.addEventListener('pointermove', (e) => {
      if (this.locked) {
        this._look(e.movementX, e.movementY);
      } else if (this.dragging) {
        this._look(e.clientX - this.lastX, e.clientY - this.lastY);
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wantDistance = THREE.MathUtils.clamp(
        this.wantDistance + Math.sign(e.deltaY) * 1.1,
        CAMERA.minDistance,
        CAMERA.maxDistance,
      );
    }, { passive: false });

    dom.addEventListener('click', () => {
      if (!this.locked && dom.requestPointerLock) dom.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (this.locked) this.dragging = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _look(dx, dy) {
    this.yaw -= dx * CAMERA.sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + dy * CAMERA.sensitivity,
      CAMERA.minPitch,
      CAMERA.maxPitch,
    );
  }

  /** True when a point is inside any building footprint (with a little padding). */
  _inside(x, z, pad) {
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return true;
    }
    return false;
  }

  update(dt, playerPosition) {
    this.target.set(playerPosition.x, playerPosition.y + CAMERA.height, playerPosition.z);
    if (!this.initialised) {
      this.smoothTarget.copy(this.target);
      this.initialised = true;
    }
    const k = 1 - Math.exp(-CAMERA.lerp * dt);
    this.smoothTarget.lerp(this.target, k);

    this.distance += (this.wantDistance - this.distance) * k;

    const cp = Math.cos(this.pitch);
    const offX = Math.sin(this.yaw) * cp;
    const offZ = Math.cos(this.yaw) * cp;
    const offY = Math.sin(this.pitch);

    // Pull the boom in if a building sits between the player and the camera.
    let dist = this.distance;
    const steps = 10;
    for (let s = 1; s <= steps; s++) {
      const t = (s / steps) * this.distance;
      const px = this.smoothTarget.x + offX * t;
      const pz = this.smoothTarget.z + offZ * t;
      if (this._inside(px, pz, CAMERA.collisionPad)) {
        dist = Math.max(CAMERA.minDistance * 0.55, t - 0.9);
        break;
      }
    }
    this.currentDistance += (dist - this.currentDistance) * Math.min(1, 14 * dt);

    const d = this.currentDistance;
    this.camera.position.set(
      this.smoothTarget.x + offX * d,
      Math.max(0.6, this.smoothTarget.y + offY * d),
      this.smoothTarget.z + offZ * d,
    );
    this.camera.lookAt(this.smoothTarget.x, this.smoothTarget.y + 0.1, this.smoothTarget.z);
  }
}
