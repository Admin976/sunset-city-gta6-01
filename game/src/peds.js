// Pedestrians: simple low-poly citizens walking the block perimeters, occasionally crossing at
// the zebra stripes, and bolting in panic when they hear a gunshot or see a car crash.
import * as THREE from 'three';
import { CITY } from './config.js';

const SKIN = [0xc98d68, 0xa9714f, 0xe0b48c, 0x7d5238, 0xf0c9a4];
const SHIRT = [0xe8e2d4, 0x9c4b4b, 0x3e5a73, 0x4f6b52, 0xc78f4a, 0x6b5b7a, 0xf0e6c8];
const PANTS = [0x2f3b4e, 0x3c3a40, 0x5a4a3a, 0x232830, 0x6a6f78];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** A cheap humanoid — shared by pedestrians and police officers. Origin at the feet. */
export function makeCitizen(opts = {}) {
  const shirt = opts.shirt ?? pick(SHIRT);
  const pants = opts.pants ?? pick(PANTS);
  const skin = opts.skin ?? pick(SKIN);
  const hair = opts.hair ?? 0x2a1d18;

  const group = new THREE.Group();
  const hips = new THREE.Group();
  group.add(hips);

  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c));

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.14, 0.82, 0);
    const thigh = box(0.19, 0.8, 0.22, pants);
    thigh.position.y = -0.4;
    const shoe = box(0.21, 0.1, 0.3, 0x1b1a20);
    shoe.position.set(0, -0.83, 0.04);
    hip.add(thigh, shoe);
    hips.add(hip);
    legs.push(hip);
  }

  const torso = box(0.56, 0.66, 0.32, shirt);
  torso.position.y = 1.15;
  hips.add(torso);

  const head = box(0.3, 0.3, 0.28, skin);
  head.position.y = 1.65;
  const hairTop = box(0.33, 0.12, 0.31, hair);
  hairTop.position.y = 1.8;
  hips.add(head, hairTop);

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.36, 1.4, 0);
    const arm = box(0.15, 0.62, 0.16, shirt);
    arm.position.y = -0.3;
    const hand = box(0.14, 0.14, 0.16, skin);
    hand.position.y = -0.66;
    shoulder.add(arm, hand);
    shoulder.rotation.z = side * 0.08;
    hips.add(shoulder);
    arms.push(shoulder);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  return { group, hips, legs, arms, head, shadow };
}

export class Peds {
  constructor(scene, data, count = 34) {
    this.scene = scene;
    this.data = data;
    this.peds = [];
    this.blocks = data.blocks;
    this.horizon = CITY.blockSize / 2 + 1.6;
    for (let i = 0; i < count; i++) this.spawn();
  }

  corners(b) {
    const h = this.horizon;
    return [
      [b.x - h, b.z - h],
      [b.x + h, b.z - h],
      [b.x + h, b.z + h],
      [b.x - h, b.z + h],
    ];
  }

  spawn() {
    const block = pick(this.blocks);
    const corners = this.corners(block);
    const ci = Math.floor(Math.random() * 4);
    const [x, z] = corners[ci];
    const body = makeCitizen({});
    body.group.position.set(x + (Math.random() - 0.5) * 2, 0.18, z + (Math.random() - 0.5) * 2);
    this.scene.add(body.group);

    const ped = {
      body,
      group: body.group,
      position: body.group.position,
      yaw: Math.random() * Math.PI * 2,
      phase: Math.random() * 6,
      speed: 1.4,
      state: 'walk',
      timer: 0,
      corner: ci,
      dir: Math.random() < 0.5 ? 1 : -1,
      block,
      target: new THREE.Vector3(),
      health: 45,
      panicDir: new THREE.Vector3(),
    };
    this.peds.push(ped);
    this.setTarget(ped);
    return ped;
  }

  setTarget(ped) {
    if (ped.state === 'cross') {
      ped.group.position.y = 0.05;
      return;
    }
    const corners = this.corners(ped.block);
    const [x, z] = corners[(ped.corner + ped.dir + 4) % 4];
    ped.target.set(x, 0.18, z);
  }

  /** nearest pedestrian in front of a bullet path; used by combat */
  nearest(pos, radius = 1.2) {
    let best = null;
    let bestD = radius;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.position.x - pos.x, p.position.z - pos.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  panic(origin, radius = 55) {
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const dx = p.position.x - origin.x;
      const dz = p.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      p.state = 'panic';
      p.timer = 2.4 + Math.random() * 2.2;
      const len = Math.max(0.001, d);
      p.panicDir.set(dx / len, 0, dz / len);
    }
  }

  hitByCar(pos, speed, onCrime) {
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      if (Math.hypot(p.position.x - pos.x, p.position.z - pos.z) < 2.6) {
        p.health = 0;
        this.knockDown(p, new THREE.Vector3(
          (p.position.x - pos.x) * 0.3, 0, (p.position.z - pos.z) * 0.3,
        ));
        if (onCrime) onCrime('hitrun', p.position, 1);
      }
    }
  }

  knockDown(ped, push) {
    ped.state = 'down';
    ped.timer = 0;
    ped.health = 0;
    ped.group.rotation.set(0, ped.yaw, 0);
    ped.body.hips.rotation.x = -1.45;
    ped.body.hips.position.y = 0.35;
    ped.body.shadow.visible = false;
    if (push) {
      ped.position.x += push.x;
      ped.position.z += push.z;
    }
  }

  hurt(ped, amount, from) {
    if (ped.state === 'down') return;
    ped.health -= amount;
    if (ped.health <= 0) {
      this.knockDown(ped, null);
      this.panic(ped.position, 45);
    } else if (from) {
      ped.state = 'panic';
      ped.timer = 2.2;
      const dx = ped.position.x - from.x;
      const dz = ped.position.z - from.z;
      const l = Math.max(0.001, Math.hypot(dx, dz));
      ped.panicDir.set(dx / l, 0, dz / l);
    }
  }

  update(dt, ctx = {}) {
    const colliders = ctx.colliders || [];
    for (const p of this.peds) {
      if (p.state === 'down') {
        p.timer += dt;
        continue;
      }
      // mission actors (thugs, the informant) are driven by missions.js, not the crowd AI
      if (p.state === 'thug') {
        p.timer += dt;
        continue;
      }

      let speed = 1.45;
      if (p.state === 'panic') {
        speed = 5.2;
        p.timer -= dt;
        p.yaw = Math.atan2(p.panicDir.x, p.panicDir.z);
        if (p.timer <= 0) {
          p.state = 'walk';
          this.setTarget(p);
        }
      } else if (p.state === 'cross') {
        speed = 1.6;
        const dx = p.target.x - p.position.x;
        const dz = p.target.z - p.position.z;
        p.yaw = Math.atan2(dx, dz);
        if (Math.hypot(dx, dz) < 1.2) {
          p.state = 'walk';
          p.block = this.nearestBlock(p.position);
          p.corner = this.nearestCorner(p);
          this.setTarget(p);
        }
      } else {
        // walk / stop
        if (ctx.player && ctx.player.velocity.lengthSq() > 25) {
          const dx = p.position.x - ctx.player.position.x;
          const dz = p.position.z - ctx.player.position.z;
          if (Math.hypot(dx, dz) < 3.5) {
            speed = 3.4;
            p.yaw = Math.atan2(dx, dz);
            p.phase += dt * 5;
            p.group.position.x += Math.sin(p.yaw) * speed * dt;
            p.group.position.z += Math.cos(p.yaw) * speed * dt;
            this.animate(p, dt, speed);
            continue;
          }
        }
        const dx = p.target.x - p.position.x;
        const dz = p.target.z - p.position.z;
        p.yaw = Math.atan2(dx, dz);
        if (Math.hypot(dx, dz) < 0.9) {
          p.corner = (p.corner + p.dir + 4) % 4;
          if (p.corner === 0 || p.corner === 2) {
            if (Math.random() < 0.25) this.startCross(p);
            else this.setTarget(p);
          } else {
            this.setTarget(p);
          }
        }
      }

      // move
      const step = speed * dt;
      let nx = p.position.x + Math.sin(p.yaw) * step;
      let nz = p.position.z + Math.cos(p.yaw) * step;
      if (this.blocked(nx, nz, colliders)) {
        if (p.state === 'panic') {
          // spin away from the wall
          p.panicDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.1);
          nx = p.position.x + p.panicDir.x * step;
          nz = p.position.z + p.panicDir.z * step;
        } else {
          nx = p.position.x;
          nz = p.position.z;
        }
      }
      p.position.x = nx;
      p.position.z = nz;
      p.position.y = p.state === 'cross' ? 0.05 : 0.18;
      p.group.rotation.y = p.yaw;
      this.animate(p, dt, speed);
    }
  }

  startCross(p) {
    // step out over the road toward the next block
    const c = this.corners(p.block)[p.corner];
    const outX = Math.sign(c[0] - p.block.x) || 1;
    const outZ = Math.sign(c[1] - p.block.z) || 1;
    // choose the side that faces a road (both do at a corner) — pick one at random
    const useX = Math.random() < 0.5;
    const dist = CITY.roadWidth + 1.5;
    p.target.set(
      p.position.x + (useX ? outX * dist : 0),
      0.05,
      p.position.z + (useX ? 0 : outZ * dist),
    );
    p.state = 'cross';
  }

  nearestBlock(pos) {
    let best = this.blocks[0];
    let bd = Infinity;
    for (const b of this.blocks) {
      const d = Math.hypot(b.x - pos.x, b.z - pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  nearestCorner(p) {
    const corners = this.corners(p.block);
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < 4; i++) {
      const d = Math.hypot(corners[i][0] - p.position.x, corners[i][1] - p.position.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  blocked(x, z, colliders) {
    const r = 0.4;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
    }
    return false;
  }

  animate(p, dt, speed) {
    p.phase += dt * (speed * 3.2 + 0.6);
    const swing = Math.min(1, speed / 3) * 0.85;
    const s = Math.sin(p.phase);
    p.body.legs[0].rotation.x = s * swing;
    p.body.legs[1].rotation.x = -s * swing;
    p.body.arms[0].rotation.x = -s * swing * 0.8;
    p.body.arms[1].rotation.x = s * swing * 0.8;
    p.body.hips.position.y = Math.abs(Math.cos(p.phase)) * 0.05 * swing;
    p.body.shadow.position.y = 0.03 - (p.position.y - 0.05);
    if (p.state === 'panic') {
      p.body.arms[0].rotation.x = -2.2 + Math.sin(p.phase * 1.4) * 0.2;
      p.body.arms[1].rotation.x = -2.0 - Math.sin(p.phase * 1.4) * 0.2;
    }
  }
}
