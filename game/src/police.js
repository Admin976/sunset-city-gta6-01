// Wanted level 1-5. Crimes raise it; hiding from the patrol cars for long enough lowers it.
// Patrol cars use a simple steer-toward-the-player AI, park when they get close, and let their
// officers out to shoot. Higher stars bring more cars, faster officers and shorter trigger pulls.
import * as THREE from 'three';
import { CITY } from './config.js';
import { buildVehicle } from './vehicles.js';
import { makeCitizen } from './peds.js';

const MAX_STARS = 5;

export class Police {
  constructor(scene, data, audio) {
    this.scene = scene;
    this.data = data;
    this.audio = audio;
    this.level = 0;
    this.hiddenTimer = 0;
    this.heat = 0;
    this.cars = [];
    this.officers = [];
    this.spawnTimer = 0;
    this.sirenTimer = 0;
    this.clearTimer = 0;
    this.lightPhase = 0;
    this.coords = [];
    for (let i = 0; i < CITY.grid; i++) this.coords.push(-CITY.half + i * CITY.spacing);
  }

  /* ---------------------------------------------------------------- wanted */

  setWanted(n) {
    const next = THREE.MathUtils.clamp(Math.round(n), 0, MAX_STARS);
    if (next > this.level) this.heat = 0;
    this.level = next;
    if (next >= 1) this.ensureCars();
  }

  reportCrime(kind, pos, severity) {
    const table = { gunfire: 1, assault: 1, carjack: 2, hitrun: 2, crash: 0, copfire: 2 };
    const inc = severity ?? table[kind] ?? 1;
    if (inc <= 0) return;
    this.level = THREE.MathUtils.clamp(this.level + inc, 0, MAX_STARS);
    this.hiddenTimer = 0;
    this.heat = 0;
    if (this.level > 0) this.ensureCars();
  }

  clear() {
    this.level = 0;
    this.hiddenTimer = 0;
    this.clearTimer = 3;
  }

  nearestDistance(pos) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, Math.hypot(c.position.x - pos.x, c.position.z - pos.z));
    for (const o of this.officers) if (o.state !== 'down') best = Math.min(best, Math.hypot(o.position.x - pos.x, o.position.z - pos.z));
    return best;
  }

  /* ---------------------------------------------------------------- spawns */

  roadPointFarFrom(pos, minD = 140, maxD = 320) {
    for (let t = 0; t < 60; t++) {
      const i = 1 + Math.floor(Math.random() * (CITY.grid - 2));
      const j = 1 + Math.floor(Math.random() * (CITY.grid - 2));
      const x = this.coords[i] + (Math.random() < 0.5 ? 4.5 : -4.5);
      const z = this.coords[j] + (Math.random() < 0.5 ? 4.5 : -4.5);
      const d = Math.hypot(x - pos.x, z - pos.z);
      if (d > minD && d < maxD) return new THREE.Vector3(x, 0.05, z);
    }
    return new THREE.Vector3(this.coords[2], 0.05, this.coords[2]);
  }

  ensureCars() {
    const want = Math.min(3, this.level);
    if (this.cars.length >= want) return;
    const target = this.targetPos || new THREE.Vector3(0, 0, 30);
    const p = this.roadPointFarFrom(target, 110, 260);
    // face roughly at the player
    const yaw = Math.atan2(target.x - p.x, target.z - p.z);
    this.spawnCar(p.x, p.z, yaw);
  }

  spawnCar(x, z, yaw) {
    const v = buildVehicle('sedan', { police: true, color: 0xe8e4d8 });
    v.group.position.set(x, 0.05, z);
    v.group.rotation.y = yaw;
    this.scene.add(v.group);
    const car = {
      group: v.group, shell: v.shell, spec: v.spec, wheels: v.wheels,
      steerWheels: v.steerWheels, headlights: v.headlights, glow: v.glow,
      tailLights: v.tailLights, siren: v.siren,
      position: new THREE.Vector3(x, 0.05, z), yaw, speed: 0,
      damage: 0, deployTimer: 0, deployed: false, wheelSpin: 0,
    };
    car.glow.visible = true;
    this.cars.push(car);
    return car;
  }

  /* ---------------------------------------------------------------- officers */

  spawnOfficer(pos, yaw) {
    const body = makeCitizen({ shirt: 0x243250, pants: 0x1b2233, skin: 0xb98a68, hair: 0x15171d });
    body.group.position.copy(pos);
    body.group.position.y = 0.05;
    body.group.rotation.y = yaw;
    // cap
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.32),
      new THREE.MeshLambertMaterial({ color: 0x1a2438 }),
    );
    cap.position.y = 1.87;
    body.group.add(cap);

    const officer = {
      body, group: body.group, position: body.group.position,
      yaw, phase: Math.random() * 6, health: 55 + this.level * 8,
      state: 'chase', cooldown: 1.2 + Math.random(), speed: 4.4 + this.level * 0.35,
    };
    this.scene.add(body.group);
    this.officers.push(officer);
    return officer;
  }

  hurtOfficer(officer, amount, from) {
    if (officer.state === 'down') return;
    officer.health -= amount;
    if (officer.health <= 0) {
      officer.state = 'down';
      officer.body.hips.rotation.x = -1.45;
      officer.body.hips.position.y = 0.35;
      officer.body.shadow.visible = false;
      officer.group.rotation.y = officer.yaw;
      this.reportCrime('copfire', officer.position, 1);
    } else if (from) {
      officer.yaw = Math.atan2(from.x - officer.position.x, from.z - officer.position.z);
    }
    this.hiddenTimer = 0;
  }

  officerDownDistance(pos) {
    let n = 0;
    for (const o of this.officers) if (o.state !== 'down' && Math.hypot(o.position.x - pos.x, o.position.z - pos.z) < 90) n++;
    return n;
  }

  /* ---------------------------------------------------------------- frame */

  update(dt, ctx = {}) {
    const player = ctx.player;
    if (!player) return;
    this.targetPos = player.position;
    this.lightPhase += dt;
    const dist = this.nearestDistance(player.position);

    // hiding: nobody within 75 m, or everybody lost — after a while the stars come down
    if (this.level > 0) {
      this.heat += dt;
      if (dist > 75) this.hiddenTimer += dt;
      else this.hiddenTimer = Math.max(0, this.hiddenTimer - dt * 0.5);

      const need = 9 + this.level * 3;
      if (this.hiddenTimer > need) {
        this.level = Math.max(0, this.level - 1);
        this.hiddenTimer = 0;
        if (this.level === 0) this.clearTimer = 6;
        ctx.toast?.('WANTED LEVEL DECREASED');
      }
      if (this.level > 0 && dist < 220) {
        this.sirenTimer -= dt;
        if (this.sirenTimer <= 0) {
          this.sirenTimer = 1.5;
          if (this.audio) this.audio.siren(THREE.MathUtils.clamp(1 - dist / 220, 0.15, 1));
        }
      }
      this.ensureCars();
    } else if (this.clearTimer > 0) {
      this.clearTimer -= dt;
    }

    this.updateCars(dt, ctx);
    this.updateOfficers(dt, ctx);
    this.updateSirens(dt);

    // retire when the heat is gone
    if (this.level === 0 && this.officers.every((o) => o.state === 'down')) {
      this.disposeAll();
    }
  }

  updateCars(dt, ctx) {
    const player = ctx.player;
    const driving = !!ctx.driving;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const dx = player.position.x - car.position.x;
      const dz = player.position.z - car.position.z;
      const d = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(dx, dz);

      // simple obstacle probe: if the road ahead is a building, swing the wheel
      let blocked = false;
      const probeX = car.position.x + Math.sin(car.yaw) * 5;
      const probeZ = car.position.z + Math.cos(car.yaw) * 5;
      for (const c of this.data.colliders) {
        if (probeX > c.x0 - 1.6 && probeX < c.x1 + 1.6 && probeZ > c.z0 - 1.6 && probeZ < c.z1 + 1.6) { blocked = true; break; }
      }

      let delta = wantYaw - car.yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const turn = blocked ? 1.9 : 2.3;
      car.yaw += THREE.MathUtils.clamp(delta, -turn * dt, turn * dt);

      let targetSpeed = 0;
      if (d > 16) targetSpeed = car.spec.maxSpeed * (0.55 + this.level * 0.07);
      else if (d > 9) targetSpeed = 4;
      if (blocked) targetSpeed = Math.min(targetSpeed, 6);

      const rate = targetSpeed > car.speed ? car.spec.accel * 1.15 : car.spec.brake;
      car.speed += THREE.MathUtils.clamp(targetSpeed - car.speed, -rate * dt, rate * dt);
      car.speed = Math.max(0, car.speed);

      // stay off the sidewalks / buildings
      const nx = car.position.x + Math.sin(car.yaw) * car.speed * dt;
      const nz = car.position.z + Math.cos(car.yaw) * car.speed * dt;
      let hitWall = false;
      for (const c of this.data.colliders) {
        if (nx > c.x0 - 1.5 && nx < c.x1 + 1.5 && nz > c.z0 - 1.5 && nz < c.z1 + 1.5) { hitWall = true; break; }
      }
      if (!hitWall) {
        car.position.x = nx;
        car.position.z = nz;
      } else {
        car.speed *= 0.2;
        car.yaw += (Math.random() < 0.5 ? 1 : -1) * 1.7 * dt;
      }
      car.group.position.copy(car.position);
      car.group.rotation.y = car.yaw;

      car.wheelSpin += (car.speed / car.spec.wheelR) * dt;
      for (const w of car.wheels) w.rotation.x = car.wheelSpin;

      // close enough: park and deploy
      if ((d < 17 && car.speed < 4) || car.deployed) {
        car.deployTimer += dt;
        if (!car.deployed && car.deployTimer > 0.4) {
          car.deployed = true;
          const want = Math.min(2, 1 + Math.floor(this.level / 3));
          for (let o = 0; o < want; o++) {
            const side = o === 0 ? 1 : -1;
            const px = car.position.x + Math.cos(car.yaw) * 2.2 * side;
            const pz = car.position.z - Math.sin(car.yaw) * 2.2 * side;
            this.spawnOfficer(new THREE.Vector3(px, 0.05, pz), car.yaw);
          }
        }
      }

      // keep officers within the fight; if the player runs far, chase again
      if (car.deployed && d > 45) {
        car.deployed = false;
        car.deployTimer = 0;
      }
      if (car.deployed && driving && d < 12) car.speed = 0;
    }
  }

  updateOfficers(dt, ctx) {
    const player = ctx.player;
    const combat = ctx.combat;
    for (const o of this.officers) {
      if (o.state === 'down') continue;
      const dx = player.position.x - o.position.x;
      const dz = player.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      o.yaw = Math.atan2(dx, dz);
      o.group.rotation.y = o.yaw;

      const stopAt = 11;
      if (d > stopAt) {
        const step = o.speed * dt;
        let nx = o.position.x + Math.sin(o.yaw) * step;
        let nz = o.position.z + Math.cos(o.yaw) * step;
        let blocked = false;
        for (const c of this.data.colliders) {
          if (nx > c.x0 - 0.6 && nx < c.x1 + 0.6 && nz > c.z0 - 0.6 && nz < c.z1 + 0.6) { blocked = true; break; }
        }
        if (blocked) {
          o.yaw += 1.2 * dt * 3;
          nx = o.position.x + Math.sin(o.yaw) * step * 0.5;
          nz = o.position.z + Math.cos(o.yaw) * step * 0.5;
        }
        o.position.x = nx;
        o.position.z = nz;
        o.phase += dt * 9;
        o.body.legs[0].rotation.x = Math.sin(o.phase) * 0.75;
        o.body.legs[1].rotation.x = -Math.sin(o.phase) * 0.75;
        o.body.arms[1].rotation.x = -0.9;      // gun arm up
      } else {
        o.body.legs[0].rotation.x *= 0.9;
        o.body.legs[1].rotation.x *= 0.9;
        o.body.arms[1].rotation.x = -1.5;
      }

      // shooting: more frequent and more accurate at higher stars
      o.cooldown -= dt;
      if (d < 32 && o.cooldown <= 0 && combat) {
        o.cooldown = Math.max(0.55, 1.9 - this.level * 0.22) * (0.8 + Math.random() * 0.5);
        combat.takeFire(o.position, 4 + this.level * 2.2);
      }
    }
  }

  updateSirens(dt) {
    const on = this.level > 0 ? (Math.sin(this.lightPhase * 12) > 0) : false;
    for (const car of this.cars) {
      if (!car.siren) continue;
      car.siren[0].material.color.setHex(on ? 0xff2a2a : 0x7a1a1a);
      car.siren[1].material.color.setHex(on ? 0x1a2a7a : 0x3a5bff);
      car.siren[0].scale.setScalar(on ? 1.5 : 1);
      car.siren[1].scale.setScalar(on ? 1 : 1.5);
      if (car.siren[2]) {
        car.siren[2].material.color.setHex(on ? 0xff3a3a : 0x501818);
        car.siren[3].material.color.setHex(on ? 0x1a2a70 : 0x4a7bff);
        car.siren[2].material.opacity = on ? 0.95 : 0.3;
        car.siren[3].material.opacity = on ? 0.3 : 0.95;
      }
    }
  }

  disposeAll() {
    for (const car of this.cars) this.scene.remove(car.group);
    this.cars.length = 0;
    for (const o of this.officers) this.scene.remove(o.group);
    this.officers.length = 0;
    this.hiddenTimer = 0;
    this.clearTimer = 0;
  }

  /** Police are only deployed after the first crime; this lets combat count witnesses. */
  hasWitness(pos, radius = 30) {
    for (const c of this.cars) {
      if (Math.hypot(c.position.x - pos.x, c.position.z - pos.z) < radius) return true;
    }
    for (const o of this.officers) {
      if (o.state !== 'down' && Math.hypot(o.position.x - pos.x, o.position.z - pos.z) < radius) return true;
    }
    return false;
  }
}

export { MAX_STARS };
