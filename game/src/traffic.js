// NPC traffic. Cars follow a lane graph derived from the city's road grid: they keep to the
// right-hand lane, cruise between intersections, queue for the lights and stop for the player.
// Headlights come on at dusk, and somebody leans on the horn now and then.
import * as THREE from 'three';
import { CITY } from './config.js';
import { buildVehicle, randomVehicleType } from './vehicles.js';

const LANE = 4.5;          // metres from the road centre to the lane centre
const EDGE_TOP = 3.6;      // NPC cruising fraction of a car's top speed

export class Traffic {
  constructor(scene, data, audio) {
    this.scene = scene;
    this.data = data;
    this.audio = audio;
    this.cars = [];
    this.time = 0;
    this.hornTimer = 4 + Math.random() * 6;

    // the grid's road centre-lines, straight from config
    this.coords = [];
    for (let i = 0; i < CITY.grid; i++) this.coords.push(-CITY.half + i * CITY.spacing);

    this.spawnParked();
    this.spawnNpc(18);
  }

  /* -------------------------------------------------------------- helpers */

  nodePos(i, j) {
    return new THREE.Vector3(this.coords[i], 0.05, this.coords[j]);
  }

  laneOffset(di, dj) {
    // right-hand traffic: +x keeps to +z, +z keeps to -x
    if (di !== 0) return new THREE.Vector3(0, 0, di > 0 ? LANE : -LANE);
    return new THREE.Vector3(dj > 0 ? -LANE : LANE, 0, 0);
  }

  targetFor(i, j, di, dj) {
    return this.nodePos(i + di, j + dj).add(this.laneOffset(di, dj));
  }

  makeCar(type, x, z, yaw, kind = 'npc') {
    const v = buildVehicle(type);
    v.group.position.set(x, 0.05, z);
    v.group.rotation.y = yaw;
    this.scene.add(v.group);
    const car = {
      kind, type,
      group: v.group, shell: v.shell, spec: v.spec,
      wheels: v.wheels, steerWheels: v.steerWheels,
      headlights: v.headlights, glow: v.glow, tailLights: v.tailLights,
      position: new THREE.Vector3(x, 0.05, z),
      yaw, speed: 0, wheelSpin: 0,
      health: 100, taken: false, damage: 0,
      i: 0, j: 0, di: 0, dj: 1,
      target: new THREE.Vector3(x, 0.05, z + 20),
      lightOn: false,
    };
    this.cars.push(car);
    return car;
  }

  spawnParked() {
    // A few cars parked along the kerb of the avenue the player wakes up on.
    this.makeCar('sedan', 4.6, 33, 0, 'parked');
    this.makeCar('pickup', -4.6, 47, Math.PI, 'parked');
    this.makeCar('sport', 4.6, 62, 0, 'parked');
    this.makeCar('van', 40, 4.6, Math.PI / 2, 'parked');
    this.makeCar('sedan', -62, -4.6, -Math.PI / 2, 'parked');
  }

  spawnNpc(count) {
    let tries = 0;
    while (this.cars.filter((c) => c.kind === 'npc').length < count && tries < 400) {
      tries++;
      const i = 1 + Math.floor(Math.random() * (CITY.grid - 2));
      const j = 1 + Math.floor(Math.random() * (CITY.grid - 2));
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [di, dj] = dirs[Math.floor(Math.random() * 4)];
      const start = this.nodePos(i, j).add(this.laneOffset(di, dj));
      if (Math.hypot(start.x, start.z) < 90) continue;
      const car = this.makeCar(randomVehicleType(), start.x, start.z, Math.atan2(di, dj), 'npc');
      car.i = i; car.j = j; car.di = di; car.dj = dj;
      car.target = this.targetFor(i, j, di, dj);
      car.speed = car.spec.maxSpeed * EDGE_TOP * 0.6;
    }
  }

  /** Nearest parked car to a point (driving.js uses this to pick what you get into). */
  nearestParked(pos, radius = 6) {
    let best = null;
    let bestD = radius;
    for (const c of this.cars) {
      if (c.taken) continue;
      const d = Math.hypot(c.position.x - pos.x, c.position.z - pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /* -------------------------------------------------------------- per frame */

  update(dt, ctx = {}) {
    this.time += dt;
    const player = ctx.player;
    const minutes = ctx.minutes ?? 900;
    const dusk = minutes > 18 * 60 + 20 || minutes < 6 * 60 + 10;
    const playerCar = ctx.playerCar || null;
    const driving = !!ctx.driving;

    for (const car of this.cars) {
      if (car.taken) continue;

      if (car.kind === 'npc') this.drive(car, dt, { player, driving, playerCar });
      this.animate(car, dt);
      this.lightUp(car, dusk, dt);
    }

    // the occasional horn from a stopped car, or ambient city noise at dusk
    this.hornTimer -= dt;
    if (this.hornTimer <= 0 && this.audio) {
      this.hornTimer = 7 + Math.random() * 12;
      const close = this.cars.find((c) => c.kind === 'npc' && c.speed < 1.5
        && Math.hypot(c.position.x - player.position.x, c.position.z - player.position.z) < 45);
      if (close) this.audio.horn(0.5, 0.9 + Math.random() * 0.2);
    }
  }

  /** Is the light at node (i,j) green for a car travelling along `axis`? */
  lightGreen(i, j, axis) {
    const phase = (this.time + i * 1.9 + j * 2.7) % 16;
    if (axis === 'x') return phase < 7.2;
    return phase > 8 && phase < 15.2;
  }

  drive(car, dt, ctx) {
    const spec = car.spec;
    const dX = car.target.x - car.position.x;
    const dZ = car.target.z - car.position.z;
    const dist = Math.hypot(dX, dZ);

    // reached the intersection: choose the next leg (never a U-turn unless dead-ended)
    if (dist < 2.4) {
      car.i += car.di;
      car.j += car.dj;
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => !(di === -car.di && dj === -car.dj));
      const straight = options.find(([di, dj]) => di === car.di && dj === car.dj);
      let pick = straight;
      if (!pick || Math.random() < 0.22) pick = options[Math.floor(Math.random() * options.length)];
      // stay inside the grid
      let [di, dj] = pick;
      if (car.i + di < 0 || car.i + di > CITY.grid - 1 || car.j + dj < 0 || car.j + dj > CITY.grid - 1) {
        [di, dj] = [-car.di, -car.dj];
      }
      car.di = di; car.dj = dj;
      car.target = this.targetFor(car.i, car.j, car.di, car.dj);
    }

    // steer toward the lane point
    const wantYaw = Math.atan2(dX, dZ);
    let delta = wantYaw - car.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    car.yaw += delta * Math.min(1, 3.4 * dt);

    let targetSpeed = spec.maxSpeed * EDGE_TOP * (car.damage > 60 ? 0.7 : 1);

    // red light just ahead? queue at the stop line
    const axis = car.di !== 0 ? 'x' : 'z';
    const stopI = car.i + car.di;
    const stopJ = car.j + car.dj;
    if (dist < 22 && dist > 4 && !this.lightGreen(stopI, stopJ, axis)) {
      targetSpeed = 0;
    }

    // keep a gap to the car in front (same rough heading)
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    for (const other of this.cars) {
      if (other === car || other.taken) continue;
      const ox = other.position.x - car.position.x;
      const oz = other.position.z - car.position.z;
      const along = ox * fx + oz * fz;
      if (along > 0 && along < 11 && Math.abs(ox * fz - oz * fx) < 2.6) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, (along - 5) * 2.2));
      }
    }

    // never run the player over: stop, and lean on the horn
    if (ctx.player) {
      const px = ctx.player.position.x - car.position.x;
      const pz = ctx.player.position.z - car.position.z;
      const along = px * fx + pz * fz;
      const side = Math.abs(px * fz - pz * fx);
      if (along > 1 && along < 10 && side < 2.4) {
        targetSpeed = 0;
        if (this.audio && this.time % 1 < dt && this.hornTimer > 2) this.audio.horn(0.35, 1.1);
      }
    }

    const rate = targetSpeed > car.speed ? spec.accel * 0.7 : spec.brake * 0.55;
    car.speed += THREE.MathUtils.clamp(targetSpeed - car.speed, -rate * dt, rate * dt);
    if (car.speed < 0) car.speed = 0;

    const step = car.speed * dt;
    car.position.x += Math.sin(car.yaw) * step;
    car.position.z += Math.cos(car.yaw) * step;
    car.group.position.copy(car.position);
    car.group.rotation.y = car.yaw;
  }

  animate(car, dt) {
    car.wheelSpin += (car.speed / (car.spec.wheelR || 0.34)) * dt;
    for (const w of car.wheels) w.rotation.x = car.wheelSpin;
    for (const w of car.steerWheels) {
      const target = THREE.MathUtils.clamp((car.target.x - car.position.x) * 0.03, -0.4, 0.4);
      w.rotation.y += (target - w.rotation.y) * Math.min(1, 5 * dt);
    }
    car.tailLights.forEach((l) => { l.material.color.setHex(car.speed < 0.4 ? 0xff2a20 : 0x9a241e); });
  }

  lightUp(car, dusk, dt) {
    if (car.lightOn === dusk) return;
    car.lightOn = dusk;
    car.glow.visible = dusk;
    if (dusk) {
      car.headlights.forEach((h) => { h.scale.set(1.2, 1.2, 1.2); });
    } else {
      car.headlights.forEach((h) => { h.scale.set(1, 1, 1); });
    }
  }

  /** Cars that should stop being simulated (removed on despawn). */
  disposeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.group);
  }
}
