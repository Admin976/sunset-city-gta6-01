// Arcade vehicle physics: throttle, brake, reverse, steering with grip and a little drift,
// collisions against buildings and other cars, damage, and a chase camera.
// The player gets in and out with E; while driving the player's own capsule is parked in the seat.
import * as THREE from 'three';
import { PLAYER } from './config.js';

const clamp = THREE.MathUtils.clamp;
const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class Driving {
  constructor(scene, player, camera, traffic, audio) {
    this.scene = scene;
    this.player = player;
    this.camera = camera;
    this.traffic = traffic;
    this.audio = audio;

    this.active = false;
    this.car = null;
    this.speed = 0;          // signed, along the car's forward axis
    this.lateral = 0;        // sideways slip — the drift
    this.steer = 0;
    this.yaw = 0;
    this.damage = 0;
    this.camPos = new THREE.Vector3(0, 6, -12);
    this.camLook = new THREE.Vector3();
    this.camReady = false;
    this.smokeTimer = 0;
    this.smoke = [];
    this.throttle = 0;
    this.impactCooldown = 0;
  }

  nearest(pos) {
    return this.traffic.nearestParked(pos, 6.5);
  }

  enter(car) {
    if (!car || this.active) return false;
    this.active = true;
    this.car = car;
    this.speed = 0;
    this.lateral = 0;
    this.steer = 0;
    this.yaw = car.yaw;
    this.damage = car.damage || 0;
    this.camReady = false;
    car.taken = true;
    car.speed = 0;
    car.damage = this.damage;
    this.player.group.visible = false;
    return true;
  }

  exit() {
    if (!this.active) return false;
    const car = this.car;
    this.active = false;
    car.taken = false;
    car.kind = 'parked';           // an abandoned car is a parked car
    car.speed = 0;
    car.damage = this.damage;

    // step out on the driver's side, unless a wall is there
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    let x = car.position.x + rx * 2.3;
    let z = car.position.z + rz * 2.3;
    if (this.blocked(x, z)) {
      x = car.position.x - rx * 2.3;
      z = car.position.z - rz * 2.3;
    }
    this.player.position.set(x, car.position.y, z);
    this.player.velocity.set(0, 0, 0);
    this.player.yaw = this.yaw + Math.PI / 2;
    this.player.group.visible = true;
    this.player.group.position.copy(this.player.position);
    this.car = null;
    return true;
  }

  blocked(x, z) {
    const r = 1.5;
    const cols = this.car?.colliders || this.colliders || [];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
    }
    return false;
  }

  /**
   * @param dt seconds
   * @param input {throttle, brake, left, right, handbrake}
   * @param colliders building footprints
   * @param ctx {peds, police, onCrime}
   */
  update(dt, input, colliders, ctx = {}) {
    if (!this.active || !this.car) return;
    const car = this.car;
    const spec = car.spec;
    this.colliders = colliders;

    const healthFactor = 1 - clamp(this.damage, 0, 100) / 260;
    const maxSpeed = spec.maxSpeed * healthFactor;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);

    // ---- longitudinal ----
    this.throttle = input.throttle ? 1 : 0;
    if (input.throttle) {
      const ramp = 1 - clamp(this.speed / maxSpeed, 0, 1) * 0.55;
      this.speed += spec.accel * ramp * dt;
    }
    if (input.brake) {
      if (this.speed > 0.6) this.speed -= spec.brake * dt;
      else this.speed -= spec.accel * 0.55 * dt;          // reverse
    }
    // rolling drag + engine braking
    const drag = input.throttle || input.brake ? 0.35 : 1.7;
    this.speed -= this.speed * drag * dt;
    if (Math.abs(this.speed) < 0.05) this.speed = 0;
    this.speed = clamp(this.speed, -maxSpeed * 0.32, maxSpeed);

    // ---- steering / drift ----
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (steerInput - this.steer) * Math.min(1, 9 * dt);
    const speedRatio = clamp(Math.abs(this.speed) / 9, 0, 1);
    const turning = this.steer * spec.steer * speedRatio * Math.sign(this.speed || 1);
    this.yaw += turning * dt;

    // sideways grip: less grip at speed / handbrake = a light drift
    const grip = spec.grip * (input.handbrake ? 0.22 : 1) / (1 + Math.abs(this.speed) * 0.035);
    this.lateral += -turning * this.speed * dt * 0.55;
    this.lateral *= Math.exp(-Math.max(0.6, grip) * dt);
    this.lateral = clamp(this.lateral, -9, 9);
    if (input.handbrake) this.speed -= this.speed * 0.55 * dt;

    // ---- integrate with building collision (axis separated, like the player) ----
    const vx = fx * this.speed + rx * this.lateral;
    const vz = fz * this.speed + rz * this.lateral;
    const nx = car.position.x + vx * dt;
    if (!this.blocked(nx, car.position.z)) {
      car.position.x = nx;
    } else {
      this.hit(Math.abs(this.speed), ctx);
      this.speed *= -0.18;
      this.lateral *= 0.3;
    }
    const nz = car.position.z + vz * dt;
    if (!this.blocked(car.position.x, nz)) {
      car.position.z = nz;
    } else {
      this.hit(Math.abs(this.speed), ctx);
      this.speed *= -0.18;
      this.lateral *= 0.3;
    }

    // ---- car vs car ----
    for (const other of this.traffic.cars) {
      if (other === car) continue;
      const dx = other.position.x - car.position.x;
      const dz = other.position.z - car.position.z;
      const d = Math.hypot(dx, dz);
      const minD = 2.9;
      if (d > 0.001 && d < minD) {
        const push = (minD - d) * 0.5;
        car.position.x -= (dx / d) * push;
        car.position.z -= (dz / d) * push;
        other.position.x += (dx / d) * push;
        other.position.z += (dz / d) * push;
        other.group.position.copy(other.position);
        if (!other.taken) other.speed = Math.max(0, other.speed * 0.4);
        if (Math.abs(this.speed) > 4) {
          this.hit(Math.abs(this.speed) * 0.6, ctx);
          this.speed *= 0.45;
        }
      }
    }

    // ---- run over a pedestrian ----
    if (ctx.peds && Math.abs(this.speed) > 5) {
      ctx.peds.hitByCar(car.position, Math.abs(this.speed), ctx.onCrime);
    }

    // ---- apply transform ----
    car.position.y = 0.05;
    car.yaw = this.yaw;
    car.group.position.copy(car.position);
    car.group.rotation.y = this.yaw;
    car.speed = this.speed;
    car.damage = this.damage;

    // body roll and pitch
    car.shell.rotation.z = -this.steer * 0.045 * speedRatio;
    car.shell.rotation.x = clamp(-this.speed * 0.0025, -0.05, 0.05);

    // wheels
    car.wheelSpin = (car.wheelSpin || 0) + (this.speed / (spec.wheelR || 0.34)) * dt;
    for (const w of car.wheels) w.rotation.x = car.wheelSpin;
    for (const w of car.steerWheels) w.rotation.y = this.steer * 0.45;
    car.tailLights.forEach((l) => {
      l.material.color.setHex(input.brake ? 0xff2a20 : 0x9a241e);
    });

    // the player rides along, hidden, so the minimap and HUD follow the car
    this.player.position.copy(car.position);
    this.player.velocity.set(vx, 0, vz);

    if (this.impactCooldown > 0) this.impactCooldown -= dt;
    this.smokeUpdate(dt);
  }

  hit(impactSpeed, ctx) {
    if (this.impactCooldown > 0) return;
    const dmg = clamp(impactSpeed * 1.4, 2, 22);
    this.damage = clamp(this.damage + dmg, 0, 100);
    this.impactCooldown = 0.35;
    if (this.audio) this.audio.impact(clamp(impactSpeed / 12, 0.2, 1));
    if (impactSpeed > 9 && ctx.onCrime) ctx.onCrime('crash', this.car.position);
  }

  smokeUpdate(dt) {
    if (this.damage < 45 || !this.car) {
      return;
    }
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = this.damage > 75 ? 0.08 : 0.16;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x3a3640, transparent: true, opacity: 0.5, depthWrite: false,
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
      m.position.copy(this.car.position);
      m.position.y += 1.4;
      m.position.x += (Math.random() - 0.5) * 0.8;
      m.position.z += (Math.random() - 0.5) * 1.6;
      this.scene.add(m);
      this.smoke.push({ mesh: m, life: 1.1, vy: 1.1 + Math.random() * 0.7 });
      if (this.smoke.length > 30) {
        const old = this.smoke.shift();
        this.scene.remove(old.mesh);
        old.mesh.geometry.dispose();
        old.mesh.material.dispose();
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.life -= dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.scale.multiplyScalar(1 + dt * 1.4);
      p.mesh.material.opacity = Math.max(0, p.life * 0.45);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.smoke.splice(i, 1);
      }
    }
  }

  updateCamera(dt) {
    if (!this.active || !this.car) return;
    const car = this.car;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const back = 8.2 + Math.min(4, Math.abs(this.speed) * 0.08);
    const height = 3.6 + Math.min(1.4, Math.abs(this.speed) * 0.02);
    const wantX = car.position.x - fx * back;
    const wantZ = car.position.z - fz * back;
    const wantY = car.position.y + height;

    if (!this.camReady) {
      this.camPos.set(wantX, wantY, wantZ);
      this.camReady = true;
    }
    const k = 1 - Math.exp(-6 * dt);
    this.camPos.x += (wantX - this.camPos.x) * k;
    this.camPos.y += (wantY - this.camPos.y) * k;
    this.camPos.z += (wantZ - this.camPos.z) * k;

    this.camLook.set(car.position.x + fx * 7, car.position.y + 1.5, car.position.z + fz * 7);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  reset() {
    if (this.active) this.exit();
    this.damage = 0;
  }
}

export { PLAYER };
