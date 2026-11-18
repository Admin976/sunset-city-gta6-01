// The player: a low-poly figure assembled from primitives, a simple walk/run cycle,
// gravity + jump, and axis-separated AABB collision against the city's building footprints.
import * as THREE from 'three';
import { CITY, PLAYER, PALETTE } from './config.js';

const box = (w, h, d, color) => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  return m;
};

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Player';
    this.position = new THREE.Vector3(PLAYER.spawn.x, CITY.groundY, PLAYER.spawn.z);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;              // facing angle (radians)
    this.grounded = true;
    this.speed = 0;
    this.health = PLAYER.maxHealth;
    this.walkPhase = 0;

    const skin = PALETTE.playerSkin;
    const shirt = PALETTE.playerShirt;
    const pants = PALETTE.playerPants;

    // hips pivot, so the whole upper body can bob without moving the feet
    this.hips = new THREE.Group();
    this.group.add(this.hips);

    // legs
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.16, 0.86, 0);
      const thigh = box(0.21, 0.86, 0.24, pants);
      thigh.position.y = -0.43;
      const shoe = box(0.23, 0.12, 0.34, 0x1b1a20);
      shoe.position.set(0, -0.86, 0.05);
      hip.add(thigh, shoe);
      this.hips.add(hip);
      this.legs.push(hip);
    }

    // torso
    const torso = box(0.62, 0.72, 0.36, shirt);
    torso.position.y = 1.22;
    const jacket = box(0.66, 0.34, 0.4, 0x2c3d55);
    jacket.position.y = 1.46;
    this.hips.add(torso, jacket);

    // head, hair and a pair of sunglasses
    const head = box(0.34, 0.34, 0.32, skin);
    head.position.y = 1.78;
    const hair = box(0.37, 0.14, 0.35, PALETTE.playerHair);
    hair.position.y = 1.94;
    const shades = box(0.3, 0.08, 0.06, 0x11131a);
    shades.position.set(0, 1.8, 0.17);
    this.hips.add(head, hair, shades);
    this.head = head;

    // arms
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.4, 1.52, 0);
      const upper = box(0.17, 0.7, 0.18, shirt);
      upper.position.y = -0.35;
      const hand = box(0.16, 0.16, 0.18, skin);
      hand.position.y = -0.76;
      shoulder.add(upper, hand);
      shoulder.rotation.z = side * 0.09;
      this.hips.add(shoulder);
      this.arms.push(shoulder);
    }

    // soft contact shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.shadow = shadow;
    this.group.add(shadow);

    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  reset() {
    this.position.set(PLAYER.spawn.x, CITY.groundY, PLAYER.spawn.z);
    this.velocity.set(0, 0, 0);
    this.health = PLAYER.maxHealth;
    this.group.position.copy(this.position);
  }

  /** Is a circle at (x,z) overlapping a building footprint? */
  blocked(x, z, colliders) {
    const r = PLAYER.radius;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
    }
    return false;
  }

  /**
   * @param dt seconds
   * @param input {x, z, run, jump} — x/z are -1..1 in camera space
   * @param cameraYaw radians, the camera's orbit angle
   * @param colliders array of {x0,x1,z0,z1}
   */
  update(dt, input, cameraYaw, colliders) {
    // ---- desired horizontal velocity, in world space ----
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);

    let mx = fx * input.z + rx * input.x;
    let mz = fz * input.z + rz * input.x;
    const len = Math.hypot(mx, mz);
    if (len > 1e-4) { mx /= len; mz /= len; } else { mx = 0; mz = 0; }

    const targetSpeed = (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed) * (len > 1e-4 ? 1 : 0);
    const targetVx = mx * targetSpeed;
    const targetVz = mz * targetSpeed;

    const accel = this.grounded ? PLAYER.accel : PLAYER.accel * 0.35;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (targetVx - this.velocity.x) * k;
    this.velocity.z += (targetVz - this.velocity.z) * k;
    if (len < 1e-4) {
      const fr = Math.exp(-PLAYER.friction * dt);
      this.velocity.x *= fr;
      this.velocity.z *= fr;
    }

    // ---- jump & gravity ----
    if (input.jump && this.grounded) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y -= PLAYER.gravity * dt;

    // ---- integrate, with one axis at a time so a wall slides instead of blocking ----
    const nx = this.position.x + this.velocity.x * dt;
    if (!this.blocked(nx, this.position.z, colliders)) {
      this.position.x = nx;
    } else {
      this.velocity.x = 0;
    }
    const nz = this.position.z + this.velocity.z * dt;
    if (!this.blocked(this.position.x, nz, colliders)) {
      this.position.z = nz;
    } else {
      this.velocity.z = 0;
    }

    this.position.y += this.velocity.y * dt;
    if (this.position.y <= CITY.groundY) {
      this.position.y = CITY.groundY;
      this.velocity.y = 0;
      this.grounded = true;
    }

    // ---- map limits ----
    const lim = CITY.bound + 40;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -lim, lim);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -lim, CITY.waterZ - 5);

    // ---- facing ----
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.speed > 0.35) {
      const want = Math.atan2(this.velocity.x, this.velocity.z);
      let delta = want - this.yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.yaw += delta * Math.min(1, PLAYER.turnLerp * dt);
    }

    this.animate(dt);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
  }

  animate(dt) {
    const moving = this.speed > 0.4;
    const run = this.speed > PLAYER.walkSpeed + 1.2;
    this.walkPhase += dt * (moving ? this.speed * (run ? 1.5 : 1.9) : 1.4);

    const swing = moving ? Math.min(1, this.speed / PLAYER.runSpeed) * (run ? 1.05 : 0.72) : 0;
    const s = Math.sin(this.walkPhase);
    const c = Math.cos(this.walkPhase);

    if (!this.grounded) {
      // tuck in the air
      this.legs[0].rotation.x = -0.55;
      this.legs[1].rotation.x = 0.3;
      this.arms[0].rotation.x = -1.5;
      this.arms[1].rotation.x = -1.2;
      this.hips.position.y = 0.02;
    } else {
      this.legs[0].rotation.x = s * swing;
      this.legs[1].rotation.x = -s * swing;
      this.arms[0].rotation.x = -s * swing * 0.85;
      this.arms[1].rotation.x = s * swing * 0.85;
      this.hips.position.y = moving ? Math.abs(c) * 0.06 * swing : Math.sin(this.walkPhase * 0.6) * 0.012;
      this.hips.rotation.z = moving ? s * 0.03 : 0;
    }
    // idle breathing
    this.head.position.y = 1.78 + (moving ? 0 : Math.sin(this.walkPhase * 0.6) * 0.012);
    this.shadow.position.y = 0.02 - (this.position.y - CITY.groundY);
    this.shadow.scale.setScalar(1 - Math.min(0.35, (this.position.y - CITY.groundY) * 0.12));
  }
}
