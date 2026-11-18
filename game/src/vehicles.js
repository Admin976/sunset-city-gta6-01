// Low-poly cars built from primitives: a slab chassis, a glass cabin, four wheels,
// headlights and tail lights. Four original models — sedan, pickup, van, sport —
// each with its own speed / acceleration / grip numbers used by driving.js and traffic.js.
import * as THREE from 'three';

export const VEHICLE_TYPES = {
  sedan: {
    label: 'SEDAN',
    length: 4.5, width: 1.86, height: 1.34, wheelR: 0.34,
    maxSpeed: 27, accel: 9.5, brake: 24, grip: 7.4, steer: 2.05, mass: 1200,
    colors: [0xd8d2c4, 0x8a3f3f, 0x2f4a63, 0x2b2b33, 0xb5895e, 0x4d6b5a],
  },
  pickup: {
    label: 'PICKUP',
    length: 5.1, width: 2.0, height: 1.62, wheelR: 0.4,
    maxSpeed: 24, accel: 8.0, brake: 21, grip: 6.4, steer: 1.85, mass: 1650,
    colors: [0x9c5a3c, 0x3d5a4a, 0xb0a48c, 0x50556b, 0x8d3535],
  },
  van: {
    label: 'VAN',
    length: 5.4, width: 2.08, height: 2.1, wheelR: 0.38,
    maxSpeed: 21, accel: 6.4, brake: 19, grip: 6.0, steer: 1.7, mass: 2000,
    colors: [0xe6e0d2, 0x7f8b93, 0xd0a45c, 0x4a5c6e, 0x9a8f7d],
  },
  sport: {
    label: 'SPORT',
    length: 4.4, width: 2.0, height: 1.14, wheelR: 0.36,
    maxSpeed: 38, accel: 15.0, brake: 28, grip: 9.2, steer: 2.35, mass: 1050,
    colors: [0xd93b3b, 0xf0c33c, 0x1f2a44, 0x2f8f7a, 0xe8e8ee],
  },
};

const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
const lambert = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
const basic = (color, extra) => new THREE.MeshBasicMaterial({ color, ...extra });

function boxMesh(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function makeWheel(r, dark) {
  // group origin at the hub; spin about local X, steer about local Y
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 0.3, 10),
    lambert(dark),
  );
  tire.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.32, 8),
    lambert(0xb9b4ad),
  );
  hub.rotation.z = Math.PI / 2;
  g.add(tire, hub);
  return g;
}

/**
 * Build one car. Local space: +z is forward, y is up, the origin sits on the road.
 * @param {string} type one of VEHICLE_TYPES
 * @param {object} opts { color, police }
 */
export function buildVehicle(type = 'sedan', opts = {}) {
  const spec = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
  const color = opts.color ?? spec.colors[Math.floor(Math.random() * spec.colors.length)];

  const group = new THREE.Group();
  group.name = `Vehicle_${type}`;
  group.rotation.order = 'YXZ';

  // body shell: everything above the wheels lives in `shell`, which can pitch and roll
  const shell = new THREE.Group();
  group.add(shell);

  const L = spec.length;
  const W = spec.width;
  const wheelR = spec.wheelR;
  const bodyY = wheelR + 0.28;

  const paint = lambert(color);
  const darkPaint = lambert(shade(color, 0.62));
  const glass = lambert(0x2b3a4a, { transparent: true, opacity: 0.72 });
  const trim = lambert(0x2a2830);

  // main body slab
  const chassis = boxMesh(W, 0.62, L * 0.98, paint);
  chassis.position.y = bodyY;
  shell.add(chassis);

  // skirt / bumpers
  const skirt = boxMesh(W * 0.98, 0.22, L * 0.96, darkPaint);
  skirt.position.y = bodyY - 0.34;
  shell.add(skirt);

  const bumperF = boxMesh(W * 1.02, 0.24, 0.34, trim);
  bumperF.position.set(0, bodyY - 0.14, L / 2 - 0.08);
  const bumperB = bumperF.clone();
  bumperB.position.z = -L / 2 + 0.08;
  shell.add(bumperF, bumperB);

  // cabin volume per type
  let cabinLen = L * 0.5;
  let cabinH = 0.52;
  let cabinZ = -L * 0.06;
  if (type === 'pickup') {
    cabinLen = L * 0.34;
    cabinH = 0.56;
    cabinZ = L * 0.08;
  } else if (type === 'van') {
    cabinLen = L * 0.66;
    cabinH = 1.0;
    cabinZ = -L * 0.14;
  } else if (type === 'sport') {
    cabinLen = L * 0.44;
    cabinH = 0.42;
    cabinZ = -L * 0.1;
  }

  const cabin = boxMesh(W * 0.86, cabinH, cabinLen, paint);
  cabin.position.set(0, bodyY + 0.32 + cabinH / 2, cabinZ);
  shell.add(cabin);

  const windows = boxMesh(W * 0.88, cabinH * 0.66, cabinLen * 0.96, glass);
  windows.position.set(0, bodyY + 0.36 + cabinH * 0.5, cabinZ);
  shell.add(windows);

  const roof = boxMesh(W * 0.8, 0.1, cabinLen * 0.8, darkPaint);
  roof.position.set(0, bodyY + 0.34 + cabinH, cabinZ);
  shell.add(roof);

  if (type === 'van') {
    // side panel ribs
    for (const s of [-1, 1]) {
      const rib = boxMesh(0.06, 0.1, cabinLen * 0.8, darkPaint);
      rib.position.set(s * W * 0.44, bodyY + 0.5, cabinZ);
      shell.add(rib);
    }
  }

  if (type === 'pickup') {
    // open bed: floor plus three rails
    const bedZ = -L * 0.24;
    const bed = boxMesh(W * 0.9, 0.08, L * 0.42, trim);
    bed.position.set(0, bodyY + 0.3, bedZ);
    shell.add(bed);
    for (const s of [-1, 1]) {
      const rail = boxMesh(0.1, 0.3, L * 0.42, paint);
      rail.position.set(s * W * 0.44, bodyY + 0.45, bedZ);
      shell.add(rail);
    }
    const tail = boxMesh(W * 0.9, 0.3, 0.1, paint);
    tail.position.set(0, bodyY + 0.45, bedZ - L * 0.21);
    shell.add(tail);
  }

  if (type === 'sport') {
    // rear wing and a low splitter
    const wing = boxMesh(W * 0.86, 0.07, 0.42, darkPaint);
    wing.position.set(0, bodyY + 0.62, -L * 0.42);
    shell.add(wing);
    for (const s of [-1, 1]) {
      const post = boxMesh(0.08, 0.24, 0.1, trim);
      post.position.set(s * W * 0.34, bodyY + 0.5, -L * 0.42);
      shell.add(post);
    }
  }

  // lights
  const headMat = basic(0xfff2c4);
  const headlights = [];
  for (const s of [-1, 1]) {
    const hl = boxMesh(0.34, 0.16, 0.07, headMat);
    hl.position.set(s * W * 0.3, bodyY + 0.06, L / 2 + 0.01);
    shell.add(hl);
    headlights.push(hl);
  }
  const tailMat = basic(0xff3b32);
  const tailLights = [];
  for (const s of [-1, 1]) {
    const tl = boxMesh(0.32, 0.12, 0.06, tailMat);
    tl.position.set(s * W * 0.3, bodyY + 0.12, -L / 2 - 0.01);
    shell.add(tl);
    tailLights.push(tl);
  }

  // light pool on the road, shown at dusk (cheap stand-in for a real spotlight)
  const glowGeo = new THREE.PlaneGeometry(W * 1.8, 11);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffe0a0, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.04, L / 2 + 5.4);
  glow.visible = false;
  group.add(glow);

  // wheels
  const wheels = [];
  const steerWheels = [];
  const axleZ = [L * 0.31, -L * 0.31];
  const dark = 0x17161b;
  for (let i = 0; i < 2; i++) {
    for (const s of [-1, 1]) {
      const w = makeWheel(wheelR, dark);
      w.position.set(s * (W / 2 + 0.04), wheelR, axleZ[i]);
      group.add(w);
      wheels.push(w);
      if (i === 0) steerWheels.push(w);
    }
  }

  // soft contact shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.15, L * 1.05),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  // police light bar
  let siren = null;
  if (opts.police) {
    const barRed = basic(0xff2a2a);
    const barBlue = basic(0x2a5bff);
    const bar = new THREE.Group();
    bar.position.set(0, bodyY + 0.34 + cabinH + 0.16, cabinZ);
    const housing = boxMesh(1.15, 0.12, 0.34, lambert(0x14161c));
    bar.add(housing);
    const lamps = [];
    for (const [s, mat] of [[-1, barRed], [1, barBlue]]) {
      const lamp = boxMesh(0.5, 0.18, 0.26, mat);
      lamp.position.set(s * 0.3, 0.09, 0);
      bar.add(lamp);
      lamps.push(lamp);
    }
    shell.add(bar);
    siren = lamps;      // the two lamp meshes, flashed by police.js

    // blue side stripe + a POLICE door decal so the white patrol car reads at a glance
    for (const s of [-1, 1]) {
      const stripe = boxMesh(0.045, 0.2, 2.4, lambert(0x1f3f7a));
      stripe.position.set(s * (W / 2 + 0.012), bodyY + 0.42, 0.1);
      shell.add(stripe);
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 0.32),
        new THREE.MeshBasicMaterial({ map: makePoliceTexture(), transparent: true }),
      );
      decal.position.set(s * (W / 2 + 0.05), bodyY + 0.42, 0.1);
      decal.rotation.y = s * Math.PI / 2;
      shell.add(decal);
    }
    // additive halos make the light bar read at street distance
    const glowTex = makeGlowSpriteTexture();
    for (const [s, col] of [[-1, 0xff2a2a], [1, 0x2a5bff]]) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: col, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.position.set(s * 0.32, 0.2, 0);
      halo.scale.set(2.0, 1.1, 1);
      bar.add(halo);
      lamps.push(halo);
    }
  }

  return {
    group, shell, spec, type,
    wheels, steerWheels, headlights, tailLights, glow, siren,
    wheelR,
  };
}

let policeTexture = null;
function makePoliceTexture() {
  if (policeTexture) return policeTexture;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 72;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 72);
  g.fillStyle = '#10141c';
  g.font = 'bold 44px "Arial Black", "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('POLICE', 128, 38);
  policeTexture = new THREE.CanvasTexture(cv);
  if ('colorSpace' in policeTexture) policeTexture.colorSpace = THREE.SRGBColorSpace;
  return policeTexture;
}

let glowSpriteTexture = null;
function makeGlowSpriteTexture() {
  if (glowSpriteTexture) return glowSpriteTexture;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowSpriteTexture = new THREE.CanvasTexture(cv);
  return glowSpriteTexture;
}

/** Type key picked by a seeded-ish random roll, weighted toward sedans. */
export function randomVehicleType() {
  const r = Math.random();
  if (r < 0.5) return 'sedan';
  if (r < 0.72) return 'pickup';
  if (r < 0.9) return 'van';
  return 'sport';
}
