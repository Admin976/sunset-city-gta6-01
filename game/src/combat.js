// On-foot combat: a punch and a pistol. Left click fires a hitscan shot with a muzzle flash and a
// fading tracer; F throws a punch. Hitting people drops them, panics the street and brings police.
import * as THREE from 'three';
import { PLAYER } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Combat {
  constructor(scene, opts) {
    this.scene = scene;
    this.player = opts.player;
    this.camera = opts.camera;
    this.audio = opts.audio;
    this.peds = opts.peds;
    this.police = opts.police;
    this.traffic = opts.traffic;
    this.onCrime = opts.onCrime || (() => {});
    this.onToast = opts.onToast || (() => {});

    this.ammo = 30;
    this.maxAmmo = 96;
    this.weapon = 'PISTOL';
    this.cooldown = 0;
    this.punchCooldown = 0;
    this.tracers = [];
    this.particles = [];
    this.flashes = [];
    this.hitFlash = 0;
    this.aim = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- shots */

  fire() {
    if (this.cooldown > 0) return;
    if (this.ammo <= 0) {
      this.cooldown = 0.4;
      this.audio?.footstep(0.3);
      this.onToast('OUT OF AMMO');
      return;
    }
    this.ammo -= 1;
    this.cooldown = 0.22;

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    // flatten the aim slightly so third-person shots point where the camera looks
    const origin = new THREE.Vector3(
      this.player.position.x, this.player.position.y + 1.42, this.player.position.z,
    );
    const start = origin.clone().addScaledVector(dir, 0.9);
    const end = start.clone().addScaledVector(dir, 70);

    const hit = this.trace(start, dir, 70);
    const target = hit ? hit.point : end;

    this.muzzle(start, dir);
    this.tracer(start, target);
    this.audio?.gunshot(0.9);

    if (hit) {
      this.spawnParticles(hit.point, 0xb9a78c, 5);
      if (hit.kind === 'ped') {
        this.peds.hurt(hit.ped, 40, this.player.position);
        this.onCrime('gunfire', this.player.position, 1);
      } else if (hit.kind === 'officer') {
        this.police.hurtOfficer(hit.officer, 45, this.player.position);
        this.onCrime('gunfire', this.player.position, 2);
      } else {
        this.onCrime('gunfire', this.player.position, 1);
        if (hit.car) this.onToast('SHOTS FIRED');
      }
    } else {
      this.onCrime('gunfire', this.player.position, 1);
    }
    this.peds.panic(this.player.position, 65);
  }

  trace(origin, dir, maxDist) {
    let best = null;
    let bestD = maxDist;
    const p = new THREE.Vector3();
    const check = (pos, height, radius) => {
      p.set(pos.x, pos.y + height, pos.z).sub(origin);
      const along = p.dot(dir);
      if (along <= 0.2 || along > bestD) return null;
      const perp = Math.sqrt(Math.max(0, p.lengthSq() - along * along));
      return perp < radius ? along : null;
    };

    for (const ped of this.peds.peds) {
      if (ped.state === 'down') continue;
      const d = check(ped.position, 1.0, 0.65);
      if (d !== null && d < bestD) {
        bestD = d;
        best = { kind: 'ped', ped, point: origin.clone().addScaledVector(dir, d) };
      }
    }
    for (const o of this.police.officers) {
      if (o.state === 'down') continue;
      const d = check(o.position, 1.0, 0.65);
      if (d !== null && d < bestD) {
        bestD = d;
        best = { kind: 'officer', officer: o, point: origin.clone().addScaledVector(dir, d) };
      }
    }
    if (this.traffic) {
      for (const car of this.traffic.cars) {
        const d = check(car.position, 0.8, 1.7);
        if (d !== null && d < bestD) {
          bestD = d;
          best = { kind: 'car', car, point: origin.clone().addScaledVector(dir, d) };
        }
      }
    }
    return best;
  }

  punch() {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = 0.42;
    this.audio?.footstep(0.8);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.player.position;
    let best = null;
    let bestD = 2.6;

    const test = (pos) => {
      const dx = pos.x - origin.x;
      const dz = pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      const len = Math.max(0.001, d);
      const facing = (dx / len) * dir.x + (dz / len) * dir.z;
      return d < bestD && facing > 0.25 ? d : null;
    };

    for (const ped of this.peds.peds) {
      if (ped.state === 'down') continue;
      const d = test(ped.position);
      if (d !== null) { bestD = d; best = { kind: 'ped', ped }; }
    }
    for (const o of this.police.officers) {
      if (o.state === 'down') continue;
      const d = test(o.position);
      if (d !== null) { bestD = d; best = { kind: 'officer', officer: o }; }
    }

    if (best) {
      this.spawnParticles(new THREE.Vector3(origin.x, origin.y + 1.2, origin.z), 0xffd9a0, 3);
      if (best.kind === 'ped') {
        this.peds.hurt(best.ped, 30, origin);
        this.onCrime('assault', origin, 1);
      } else {
        this.police.hurtOfficer(best.officer, 28, origin);
        this.onCrime('assault', origin, 1);
      }
      this.peds.panic(origin, 40);
      this.audio?.impact(0.4);
    }
  }

  /** Police bullet coming the other way. */
  takeFire(fromPos, damage) {
    const origin = new THREE.Vector3(fromPos.x, fromPos.y + 1.2, fromPos.z);
    const target = new THREE.Vector3(
      this.player.position.x, this.player.position.y + 1.1, this.player.position.z,
    );
    this.audio?.gunshot(0.35);
    if (Math.random() < 0.26) {
      // a miss: the tracer whips past the player
      target.x += (Math.random() - 0.5) * 4;
      this.tracer(origin, target);
      return;
    }
    this.tracer(origin, target);
    this.damagePlayer(damage, fromPos);
  }

  damagePlayer(amount, fromPos) {
    if (this.player.health <= 0) return;
    this.player.health = Math.max(0, this.player.health - amount);
    this.hitFlash = 0.5;
    this.spawnParticles(new THREE.Vector3(
      this.player.position.x, this.player.position.y + 1.0, this.player.position.z,
    ), 0xc0392b, 4);
    if (this.player.health <= 0 && this.onDeath) this.onDeath();
  }

  heal(amount) {
    this.player.health = Math.min(PLAYER.maxHealth, this.player.health + amount);
  }

  addAmmo(n) {
    this.ammo = Math.min(this.maxAmmo, this.ammo + n);
  }

  /* ---------------------------------------------------------------- fx */

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe6a0, transparent: true, opacity: 0.95, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.15 });
    if (this.tracers.length > 24) {
      const old = this.tracers.shift();
      this.scene.remove(old.line);
      old.line.geometry.dispose();
      old.line.material.dispose();
    }
  }

  muzzle(origin, dir) {
    const geo = new THREE.SphereGeometry(0.16, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(origin).addScaledVector(dir, 0.25);
    this.scene.add(m);
    this.flashes.push({ mesh: m, life: 0.07 });
  }

  spawnParticles(pos, color, count = 4) {
    for (let i = 0; i < count; i++) {
      const size = 0.07 + Math.random() * 0.1;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      );
      m.position.copy(pos);
      this.scene.add(m);
      this.particles.push({
        mesh: m, life: 0.45 + Math.random() * 0.35,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 4,
        ),
      });
    }
    while (this.particles.length > 90) {
      const old = this.particles.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.15);
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      f.mesh.scale.multiplyScalar(1 + dt * 12);
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = Math.max(0, p.life * 1.6);
      p.mesh.rotation.x += dt * 6;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}

export { UP };
