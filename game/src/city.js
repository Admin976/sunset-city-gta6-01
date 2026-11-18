// Puerto Sol: a deterministic low-poly coastal city built from a seed.
// generateCity() makes the DATA (roads, blocks, lots, props, landmarks, colliders);
// buildCityMeshes() turns that data into a handful of InstancedMeshes — one draw call per material
// family, not one per object — plus a small group of hand-built landmarks.
import * as THREE from 'three';
import { CITY, PALETTE, DISTRICTS } from './config.js';
import { createRandom } from './rng.js';

const { half, spacing, grid, roadWidth, blockSize, sidewalk, bound } = CITY;

const COLOR = (hex) => new THREE.Color(hex);
const PAL = Object.fromEntries(
  Object.entries(PALETTE).map(([k, v]) => [k, Array.isArray(v) ? v.map(COLOR) : COLOR(v)]),
);

/* ------------------------------------------------------------------ data */

export function generateCity(seed = CITY.seed) {
  const rnd = createRandom(seed);
  const roads = [];
  const blocks = [];
  const buildings = [];
  const colliders = [];
  const palms = [];
  const lamps = [];
  const crosswalks = [];
  const dashes = [];
  const benches = [];
  const umbrellas = [];
  const trees = [];
  const trafficLights = [];
  const billboards = [];
  const points = [];       // minimap landmarks

  const roadCoords = [];
  for (let i = 0; i < grid; i++) roadCoords.push(-half + i * spacing);

  // ---- roads (asphalt strips) + centre dashes ----
  for (const c of roadCoords) {
    roads.push({ axis: 'z', x: c, z: 0, width: roadWidth, length: bound * 2 });
    roads.push({ axis: 'x', x: 0, z: c, width: roadWidth, length: bound * 2 });
    for (let t = -half; t < half; t += 9) {
      dashes.push({ x: c, z: t + 2.2, y: 0.045, w: 0.28, d: 4.0, rot: 0 });
      dashes.push({ x: t + 2.2, z: c, y: 0.045, w: 4.0, d: 0.28, rot: 0 });
    }
  }

  const lots = [];

  // ---- blocks, lots, buildings ----
  for (let i = 0; i < grid - 1; i++) {
    for (let j = 0; j < grid - 1; j++) {
      const cx = (roadCoords[i] + roadCoords[i + 1]) / 2;
      const cz = (roadCoords[j] + roadCoords[j + 1]) / 2;
      const dist = Math.hypot(cx, cz);
      const downtown = dist < 210;
      const midtown = dist < 330;
      blocks.push({ x: cx, z: cz, w: blockSize, d: blockSize, downtown });

      // The block just south-east of the crossing is kept clear for Plaza del Reloj.
      const reserved = i === 4 && j === 4;
      if (reserved) {
        lots.push({ x: cx, z: cz, w: blockSize - sidewalk * 2, d: blockSize - sidewalk * 2, empty: true });
        continue;
      }

      // 2x2 lots everywhere except the very centre, where a single tower gets the block.
      const inner = blockSize - sidewalk * 2;
      const lotDefs = downtown && rnd.chance(0.45)
        ? [{ dx: 0, dz: 0, w: inner - 16, d: inner - 16 }]
        : [
            { dx: -(inner / 4 + 1), dz: -(inner / 4 + 1) },
            { dx: inner / 4 + 1, dz: -(inner / 4 + 1) },
            { dx: -(inner / 4 + 1), dz: inner / 4 + 1 },
            { dx: inner / 4 + 1, dz: inner / 4 + 1 },
          ].map((l) => ({ ...l, w: inner / 2 - 4, d: inner / 2 - 4 }));

      for (const lot of lotDefs) {
        // A few empty lots keep the skyline uneven and give the palms somewhere to grow.
        if (rnd.chance(downtown ? 0.03 : 0.14)) {
          lots.push({ x: cx + lot.dx, z: cz + lot.dz, w: lot.w, d: lot.d, empty: true });
          continue;
        }
        const w = lot.w * rnd.range(0.82, 1.0);
        const d = lot.d * rnd.range(0.82, 1.0);
        const floors = downtown
          ? rnd.int(7, CITY.maxFloors)
          : midtown
            ? rnd.int(3, 8)
            : rnd.int(CITY.minFloors, 4);
        const h = floors * CITY.floorHeight;
        // five facade families so the streets never read as one grey mass
        const facade = downtown
          ? rnd.pick(['glass', 'glass', 'white', 'cream', 'yellow', 'brick'])
          : rnd.pick(['cream', 'white', 'brick', 'yellow', 'brick', 'glass', 'white']);
        const baseColor = PAL['facade' + facade[0].toUpperCase() + facade.slice(1)] || PAL.facadeCream;
        const tint = baseColor.clone().offsetHSL(rnd.range(-0.015, 0.015), rnd.range(-0.05, 0.05), rnd.range(-0.07, 0.07));
        const roofRoll = rnd.next();
        const b = {
          x: cx + lot.dx, z: cz + lot.dz, w, d, h, floors,
          color: tint, facade,
          roof: roofRoll < 0.3 ? 'tank' : roofRoll < 0.55 ? 'ac' : roofRoll < 0.72 ? 'antenna' : 'flat',
          roofColor: PAL.roof.clone().offsetHSL(0, 0, rnd.range(-0.04, 0.06)),
          glass: facade === 'glass',
          awning: rnd.pick(PAL.awning),
        };
        buildings.push(b);
        lots.push(b);
        colliders.push({ x0: b.x - w / 2, x1: b.x + w / 2, z0: b.z - d / 2, z1: b.z + d / 2 });
      }

      // ---- street furniture: a lamp on each kerb corner ----
      const k = blockSize / 2 + 1.6;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        lamps.push({ x: cx + sx * k, z: cz + sz * k, rot: Math.atan2(-sx, -sz) });
      }

      // ---- palms on some block corners ----
      const palmSpots = 1 + Math.floor(rnd.next() * 3);
      for (let p = 0; p < palmSpots; p++) {
        const sx = rnd.chance(0.5) ? 1 : -1;
        const sz = rnd.chance(0.5) ? 1 : -1;
        palms.push({
          x: cx + sx * (blockSize / 2 - 1.2) + rnd.range(-1, 1),
          z: cz + sz * (blockSize / 2 - 1.2) + rnd.range(-1, 1),
          h: rnd.range(6, 10.5), lean: rnd.range(-0.09, 0.09), rot: rnd.range(0, 6.283),
        });
      }
      if (rnd.chance(0.35)) {
        benches.push({ x: cx + rnd.range(-3, 3), z: cz + blockSize / 2 - 2.4, rot: 0 });
      }
      // ---- leafy shade trees along the block edges (twice as many as the palms) ----
      for (let t = 0; t < 2; t++) {
        const south = rnd.chance(0.5);
        trees.push({
          x: cx + rnd.range(-blockSize / 2 + 4, blockSize / 2 - 4),
          z: cz + (south ? 1 : -1) * (blockSize / 2 - 1.6),
          h: rnd.range(3.6, 6.4),
          r: rnd.range(1.6, 2.5),
          rot: rnd.range(0, 6.283),
        });
      }
    }
  }

  // ---- zebra crossings at every intersection: bold bars along the traffic direction ----
  for (const x of roadCoords) {
    for (const z of roadCoords) {
      const off = roadWidth / 2 + 2.6;
      for (let k = -7.2; k <= 7.2; k += 2.0) {
        crosswalks.push({ x: x + k, z: z - off, rot: 0, w: 1.1, d: 3.8 });
        crosswalks.push({ x: x + k, z: z + off, rot: 0, w: 1.1, d: 3.8 });
        crosswalks.push({ x: x - off, z: z + k, rot: Math.PI / 2, w: 1.1, d: 3.8 });
        crosswalks.push({ x: x + off, z: z + k, rot: Math.PI / 2, w: 1.1, d: 3.8 });
      }
    }
  }

  // ---- traffic signals on all four corners of every crossing ----
  let signalPhase = 0;
  for (const x of roadCoords) {
    for (const z of roadCoords) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        trafficLights.push({
          x: x + sx * (roadWidth / 2 + 2.1),
          z: z + sz * (roadWidth / 2 + 2.1),
          rot: Math.atan2(-sx, -sz),
          phase: signalPhase++,
        });
      }
    }
  }

  // ---- beach: sand palms, umbrellas, a promenade ----
  for (let i = 0; i < 46; i++) {
    const x = rnd.range(-half - 60, half + 60);
    palms.push({
      x, z: CITY.beachZ + rnd.range(6, 95),
      h: rnd.range(7, 12), lean: rnd.range(-0.16, 0.16), rot: rnd.range(0, 6.283),
    });
  }
  for (let i = 0; i < 22; i++) {
    umbrellas.push({
      x: rnd.range(-half - 30, half + 30),
      z: CITY.beachZ + rnd.range(20, 100),
      color: rnd.pick([PAL.accent, PAL.neon, PAL.lamp]),
      rot: rnd.range(0, 6.283),
    });
  }
  for (let i = 0; i < 40; i++) {
    trees.push({
      x: rnd.range(-half - 50, half + 50),
      z: CITY.beachZ + rnd.range(-14, 18),
      h: rnd.range(4, 7), r: rnd.range(1.8, 2.8), rot: rnd.range(0, 6.283),
    });
  }

  // ---- original neon billboards: two on the promenade, one at the docks ----
  billboards.push(
    { x: -120, z: CITY.beachZ + 10, rot: Math.PI, text: 'MERCADO VIEJO', color: 0xff9a5c },
    { x: 78, z: CITY.beachZ + 10, rot: Math.PI, text: 'PLAYA SOL', color: 0xff5f8a },
    { x: -half + 78, z: CITY.beachZ + 62, rot: Math.PI * 0.5, text: 'COBRA AZUL', color: 0x5fd0ff },
  );

  // ---- landmarks ----
  const landmarkSites = findSites(blocks);
  const landmarks = [
    {
      type: 'tower', name: 'Torre Faro', x: -half + 20, z: -half + 20,
      emoji: '!', color: 0xff5f8a,
    },
    {
      type: 'mall', name: 'Galería Sol', x: landmarkSites.mall.x, z: landmarkSites.mall.z,
      emoji: 'M', color: 0xff9a5c,
    },
    {
      type: 'plaza', name: 'Plaza del Reloj', x: 55, z: 55,
      emoji: 'P', color: 0xffd166,
    },
    {
      type: 'docks', name: 'Muelle Viejo', x: -half + 40, z: CITY.beachZ + 40,
      emoji: 'D', color: 0x7fd1c8,
    },
    {
      type: 'bridge', name: 'Puente Coral', x: half - 60, z: CITY.beachZ + 55,
      emoji: 'B', color: 0xe8d9b8,
    },
  ];
  for (const l of landmarks) points.push({ x: l.x, z: l.z, color: l.color, label: l.name });

  // ---- districts: a 3x3 grid of names, with the beach overriding the south row ----
  const districts = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      districts.push({
        name: DISTRICTS[(i * 3 + j) % DISTRICTS.length],
        x0: -half + (i * (half * 2)) / 3 - 60,
        x1: -half + ((i + 1) * (half * 2)) / 3 + 60,
        z0: -half + (j * (half * 2)) / 3 - 60,
        z1: -half + ((j + 1) * (half * 2)) / 3 + 60,
      });
    }
  }

  return {
    seed, roads, blocks, buildings, colliders, palms, lamps, crosswalks, dashes,
    benches, umbrellas, trees, trafficLights, billboards, landmarks, points, districts,
  };
}

/** Two block centres reserved for the mall (kept clear of the plaza at the origin). */
function findSites(blocks) {
  let best = null;
  for (const b of blocks) {
    const d = Math.hypot(b.x - 210, b.z - 120);
    if (!best || d < best.d) best = { ...b, d };
  }
  return { mall: best };
}

/** Which district a world position falls in (HUD label). */
export function districtAt(data, x, z) {
  if (z > CITY.beachZ) return 'PLAYA DORADA';
  for (const d of data.districts || []) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.name;
  }
  return 'PUERTO SOL';
}

/* --------------------------------------------------------------- meshes */

function vertexShade(geo, low = 0.78, high = 1.0) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) + 0.5, 0, 1);
    const v = low + (high - low) * t;
    colors[i * 3] = v; colors[i * 3 + 1] = v; colors[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

const unitBox = () => vertexShade(new THREE.BoxGeometry(1, 1, 1));

function instanced(parent, geo, mat, items, place) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < items.length; i++) {
    place(items[i], dummy);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (items[i].color) {
      color.set(items[i].color);
      mesh.setColorAt(i, color);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;   // instances span the whole map; the group is not split per cell
  parent.add(mesh);
  return mesh;
}

const litMat = (extra = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });

export function buildCityMeshes(data) {
  const group = new THREE.Group();
  group.name = 'PuertoSol';

  /* ---- ground, asphalt, kerbs ---- */
  const groundGeo = new THREE.PlaneGeometry(bound * 2.6, bound * 2.6);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshLambertMaterial({ color: 0x4c4657 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);

  const asphalt = litMat();
  instanced(group, unitBox(), asphalt, data.roads.map((r) => ({ ...r, color: PAL.asphalt })),
    (r, d) => {
      d.position.set(r.axis === 'z' ? r.x : 0, 0, r.axis === 'x' ? r.z : 0);
      d.scale.set(r.axis === 'z' ? r.width : r.length, 0.08, r.axis === 'z' ? r.length : r.width);
      d.rotation.set(0, 0, 0);
    });

  const paint = new THREE.MeshBasicMaterial({ color: PAL.asphaltLine, transparent: true, opacity: 0.85 });
  instanced(group, unitBox(), paint, data.dashes,
    (s, d) => { d.position.set(s.x, s.y, s.z); d.scale.set(s.w, 0.02, s.d); d.rotation.set(0, s.rot, 0); });

  // sidewalks: one slab per block
  const walkMat = litMat();
  instanced(group, unitBox(), walkMat, data.blocks.map((b) => ({ ...b, color: PAL.sidewalk })),
    (b, d) => {
      d.position.set(b.x, 0.05, b.z);
      d.scale.set(b.w + sidewalk * 1.7, 0.26, b.d + sidewalk * 1.7);
      d.rotation.set(0, 0, 0);
    });

  // crosswalks (bright paint, slightly above the asphalt)
  const zebra = new THREE.MeshBasicMaterial({ color: 0xf7ecd2, transparent: true, opacity: 0.95 });
  instanced(group, unitBox(), zebra, data.crosswalks,
    (s, d) => { d.position.set(s.x, 0.06, s.z); d.scale.set(s.w, 0.015, s.d); d.rotation.set(0, s.rot, 0); });

  /* ---- buildings: body, roof slab, rooftop clutter ---- */
  const bodyGeo = unitBox();
  const bodies = new THREE.InstancedMesh(bodyGeo, litMat(), data.buildings.length);
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  const roofs = [];
  const clutter = [];
  const tanks = [];
  data.buildings.forEach((b, i) => {
    dummy.position.set(b.x, 0.18 + b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, b.color);

    roofs.push({ x: b.x, z: b.z, w: b.w + 0.8, d: b.d + 0.8, y: 0.18 + b.h, color: b.roofColor });
    if (b.roof === 'ac') {
      clutter.push({
        x: b.x + b.w * 0.18, z: b.z - b.d * 0.15, w: b.w * 0.28, h: 1.5, d: b.d * 0.26,
        y: 0.18 + b.h + 0.6, color: 0x8d8794,
      });
    } else if (b.roof === 'antenna') {
      clutter.push({ x: b.x, z: b.z, w: 0.5, h: 7, d: 0.5, y: 0.18 + b.h + 3.5, color: 0xb9b2bd });
    } else if (b.roof === 'tank') {
      // a wooden water tank on a steel frame — the classic Caribbean rooftop silhouette
      tanks.push({ x: b.x + b.w * 0.22, z: b.z + b.d * 0.18, y: 0.18 + b.h + 2.1, color: 0x9a8168 });
      clutter.push({ x: b.x + b.w * 0.22, z: b.z + b.d * 0.18, w: 4.2, h: 0.7, d: 4.2, y: 0.18 + b.h + 0.55, color: 0x574c46 });
      clutter.push({ x: b.x + b.w * 0.22, z: b.z + b.d * 0.18, w: 0.35, h: 2.0, d: 3.4, y: 0.18 + b.h + 1.1, color: 0x3f3a3d });
    }
  });
  bodies.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  bodies.frustumCulled = false;
  group.add(bodies);

  instanced(group, unitBox(), litMat(), roofs,
    (r, d) => { d.position.set(r.x, r.y + 0.25, r.z); d.scale.set(r.w, 0.5, r.d); d.rotation.set(0, 0, 0); });
  instanced(group, unitBox(), litMat(), clutter,
    (r, d) => { d.position.set(r.x, r.y, r.z); d.scale.set(r.w, r.h, r.d); d.rotation.set(0, 0, 0); });

  const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  instanced(group, tankGeo, litMat(), tanks,
    (t, d) => { d.position.set(t.x, t.y, t.z); d.scale.set(2.3, 3.2, 2.3); d.rotation.set(0, 0, 0); });

  /* ---- window grid: every floor gets real punched openings on all four faces ---- */
  const wins = [];
  const hash = (a, b2, c2, d2) => {
    const v = Math.sin(a * 12.9898 + b2 * 78.233 + c2 * 37.719 + d2 * 3.17) * 43758.5453;
    return v - Math.floor(v);
  };
  for (const b of data.buildings) {
    const colsX = Math.max(2, Math.floor((b.w - 2.4) / 3.4));
    const colsZ = Math.max(2, Math.floor((b.d - 2.4) / 3.4));
    const ww = Math.min(1.7, (b.w / colsX) * 0.52);
    const wd = Math.min(1.7, (b.d / colsZ) * 0.52);
    for (let f = 1; f < b.floors; f++) {
      const y = 0.18 + f * CITY.floorHeight + CITY.floorHeight * 0.55;
      for (let ci = 0; ci < colsX; ci++) {
        const x = b.x - b.w / 2 + (ci + 0.5) * (b.w / colsX);
        for (const side of [1, -1]) {
          wins.push({
            x, y, z: b.z + side * (b.d / 2 + 0.06), sx: ww, sy: 1.6, sz: 0.1,
            lit: hash(b.x, b.z, f * 3.1, ci * 2.3 + side) < 0.2,
          });
        }
      }
      for (let ci = 0; ci < colsZ; ci++) {
        const z = b.z - b.d / 2 + (ci + 0.5) * (b.d / colsZ);
        for (const side of [1, -1]) {
          wins.push({
            x: b.x + side * (b.w / 2 + 0.06), y, z, sx: 0.1, sy: 1.6, sz: wd,
            lit: hash(b.x, b.z, f * 4.7 + 1, ci * 1.9 + side) < 0.2,
          });
        }
      }
    }
  }
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const winMesh = instanced(group, unitBox(), winMat, wins,
    (w, d) => { d.position.set(w.x, w.y, w.z); d.scale.set(w.sx, w.sy, w.sz); d.rotation.set(0, 0, 0); });
  if (winMesh) {
    const wc = new THREE.Color();
    for (let i = 0; i < wins.length; i++) {
      wc.set(wins[i].lit ? PAL.windowLit : PAL.window);
      winMesh.setColorAt(i, wc);
    }
    if (winMesh.instanceColor) winMesh.instanceColor.needsUpdate = true;
  }

  /* ---- ground-floor shops: dark glazing, striped awnings on every street face ---- */
  const shops = [];
  const awnings = [];
  for (const b of data.buildings) {
    const name = b.facade;
    shops.push({ x: b.x, z: b.z + b.d / 2 + 0.08, sx: b.w * 0.86, sy: 2.4, sz: 0.1, color: 0x1a2731 });
    shops.push({ x: b.x, z: b.z - b.d / 2 - 0.08, sx: b.w * 0.86, sy: 2.4, sz: 0.1, color: 0x1a2731 });
    shops.push({ x: b.x + b.w / 2 + 0.08, z: b.z, sx: 0.1, sy: 2.4, sz: b.d * 0.86, color: 0x1a2731 });
    shops.push({ x: b.x - b.w / 2 - 0.08, z: b.z, sx: 0.1, sy: 2.4, sz: b.d * 0.86, color: 0x1a2731 });
    const ac = b.awning || PAL.accent;
    awnings.push({ x: b.x, z: b.z + b.d / 2 + 0.85, sx: b.w * 0.9, sz: 1.7, rot: 0, color: ac });
    awnings.push({ x: b.x, z: b.z - b.d / 2 - 0.85, sx: b.w * 0.9, sz: 1.7, rot: 0, color: ac });
    awnings.push({ x: b.x + b.w / 2 + 0.85, z: b.z, sx: 1.7, sz: b.d * 0.9, rot: 0, color: ac });
    awnings.push({ x: b.x - b.w / 2 - 0.85, z: b.z, sx: 1.7, sz: b.d * 0.9, rot: 0, color: ac });
    if (name === 'glass') { /* curtain wall: taller glazing reads at street level */ }
  }
  const shopMesh = new THREE.InstancedMesh(unitBox(), litMat(), shops.length);
  shops.forEach((s, i) => {
    dummy.position.set(s.x, 1.7, s.z);
    dummy.scale.set(s.sx, s.sy, s.sz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    shopMesh.setMatrixAt(i, dummy.matrix);
    c.set(s.color);
    shopMesh.setColorAt(i, c);
  });
  shopMesh.instanceMatrix.needsUpdate = true;
  if (shopMesh.instanceColor) shopMesh.instanceColor.needsUpdate = true;
  shopMesh.frustumCulled = false;
  group.add(shopMesh);

  instanced(group, unitBox(), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x242024 }), awnings,
    (a, d) => { d.position.set(a.x, 3.55, a.z); d.scale.set(a.sx, 0.18, a.sz); d.rotation.set(0.12, a.rot, 0); });

  // window bands: thin emissive strips on the taller towers, one instanced mesh for all
  const bands = [];
  for (const b of data.buildings) {
    if (b.floors < 4) continue;
    for (let f = 1; f < b.floors; f += 1) {
      bands.push({
        x: b.x, z: b.z, y: 0.18 + f * CITY.floorHeight,
        w: b.w + 0.12, d: b.d + 0.12, color: b.glass ? 0x9fc6d4 : 0xf2d3a0,
      });
    }
  }
  const bandMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false,
  });
  instanced(group, unitBox(), bandMat, bands,
    (r, d) => { d.position.set(r.x, r.y, r.z); d.scale.set(r.w, 0.16, r.d); d.rotation.set(0, 0, 0); });

  /* ---- palms: trunk + fronds ---- */
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 5, 1);
  trunkGeo.translate(0, 0.5, 0);
  instanced(group, trunkGeo, litMat(), data.palms.map((p) => ({ ...p, color: PAL.trunk })),
    (p, d) => { d.position.set(p.x, 0.1, p.z); d.scale.set(1, p.h, 1); d.rotation.set(p.lean, p.rot, p.lean * 0.6); });

  const frondGeo = new THREE.ConeGeometry(2.4, 1.1, 6, 1, true);
  frondGeo.translate(0, 0.4, 0);
  instanced(group, frondGeo, litMat(), data.palms.map((p) => ({ ...p, color: PAL.palm })),
    (p, d) => {
      d.position.set(p.x + p.lean * p.h, 0.1 + p.h, p.z);
      d.scale.set(1, 1, 1);
      d.rotation.set(0, p.rot, 0);
    });

  /* ---- shade trees: trunk plus two lumpy canopy layers ---- */
  const treeTrunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 1, 5);
  treeTrunkGeo.translate(0, 0.5, 0);
  instanced(group, treeTrunkGeo, litMat(), data.trees.map((t) => ({ ...t, color: PAL.trunk })),
    (t, d) => { d.position.set(t.x, 0.1, t.z); d.scale.set(1, t.h, 1); d.rotation.set(0, t.rot, 0); });
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  instanced(group, canopyGeo, litMat(), data.trees.map((t, i) => ({
    ...t, y: 0.1 + t.h, color: PAL.tree.clone().offsetHSL(0.01 * (i % 3), 0, (i % 5) * 0.012),
  })),
    (t, d) => {
      d.position.set(t.x, t.y, t.z);
      d.scale.set(t.r, t.r * 0.85, t.r);
      d.rotation.set(0, t.rot, 0);
    });
  instanced(group, canopyGeo, litMat(), data.trees.map((t) => ({
    ...t, y: 0.1 + t.h - t.r * 0.6, color: PAL.tree,
  })),
    (t, d) => {
      d.position.set(t.x + t.r * 0.3, t.y, t.z - t.r * 0.2);
      d.scale.set(t.r * 0.7, t.r * 0.6, t.r * 0.7);
      d.rotation.set(0, t.rot * 1.3, 0);
    });

  /* ---- street lamps: pole, arm, glowing head ---- */
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 1, 5);
  poleGeo.translate(0, 0.5, 0);
  instanced(group, poleGeo, new THREE.MeshLambertMaterial({ color: 0x3b3a44 }), data.lamps,
    (l, d) => { d.position.set(l.x, 0.1, l.z); d.scale.set(1, 7.2, 1); d.rotation.set(0, l.rot, 0); });
  const headGeo = new THREE.SphereGeometry(0.34, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: PAL.lamp });
  instanced(group, headGeo, lampMat, data.lamps,
    (l, d) => {
      d.position.set(l.x + Math.sin(l.rot) * 0.0, 7.3, l.z);
      d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
    });

  // soft additive halo over every lamp head; main.js fades it in as the sun drops
  const glowTex = makeGlowTexture();
  const glowPos = new Float32Array(data.lamps.length * 3);
  data.lamps.forEach((l, i) => {
    glowPos[i * 3] = l.x; glowPos[i * 3 + 1] = 7.3; glowPos[i * 3 + 2] = l.z;
  });
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  const glowMat = new THREE.PointsMaterial({
    map: glowTex, color: 0xffc27a, size: 6.5, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const lampGlow = new THREE.Points(glowGeo, glowMat);
  lampGlow.frustumCulled = false;
  group.add(lampGlow);
  group.userData.lampGlow = glowMat;

  /* ---- traffic signals: pole, box head, three lamps, red/green split by phase ---- */
  const sigPoles = [];
  const sigHeads = [];
  const bulbs = [];
  for (const l of data.trafficLights) {
    const fx = Math.sin(l.rot);
    const fz = Math.cos(l.rot);
    sigPoles.push(l);
    const hx = l.x + fx * 0.18;
    const hz = l.z + fz * 0.18;
    sigHeads.push({ x: hx, z: hz, rot: l.rot });
    const green = (l.phase * 7) % 13 < 6;
    bulbs.push({ x: hx + fx * 0.24, y: 4.95, z: hz + fz * 0.24, rot: l.rot, color: green ? 0x35121a : 0xff3626 });
    bulbs.push({ x: hx + fx * 0.24, y: 4.55, z: hz + fz * 0.24, rot: l.rot, color: 0x2d2417 });
    bulbs.push({ x: hx + fx * 0.24, y: 4.15, z: hz + fz * 0.24, rot: l.rot, color: green ? 0x3cf07a : 0x132a1c });
  }
  instanced(group, poleGeo, new THREE.MeshLambertMaterial({ color: 0x33313a }), sigPoles,
    (l, d) => { d.position.set(l.x, 0.1, l.z); d.scale.set(0.75, 4.7, 0.75); d.rotation.set(0, 0, 0); });
  instanced(group, unitBox(), litMat(), sigHeads.map((s) => ({ ...s, color: 0x25232a })),
    (s, d) => { d.position.set(s.x, 4.55, s.z); d.scale.set(0.56, 1.5, 0.42); d.rotation.set(0, s.rot, 0); });
  instanced(group, new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs,
    (b, d) => { d.position.set(b.x, b.y, b.z); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0); });

  /* ---- benches & beach umbrellas ---- */
  instanced(group, unitBox(), litMat(), data.benches.map((b) => ({ ...b, color: 0x7a5b46 })),
    (b, d) => { d.position.set(b.x, 0.5, b.z); d.scale.set(2.6, 0.16, 0.7); d.rotation.set(0, b.rot, 0); });
  const umb = new THREE.ConeGeometry(2.2, 1.2, 8, 1, true);
  instanced(group, umb, litMat(), data.umbrellas,
    (u, d) => { d.position.set(u.x, 3.2, u.z); d.scale.set(1, 1, 1); d.rotation.set(0, u.rot, 0); });
  const uPole = new THREE.CylinderGeometry(0.06, 0.06, 3.0, 4);
  instanced(group, uPole, new THREE.MeshLambertMaterial({ color: 0xe6dfd4 }), data.umbrellas,
    (u, d) => { d.position.set(u.x, 1.6, u.z); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0); });

  /* ---- beach & sea ---- */
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(bound * 2.4, 220),
    new THREE.MeshLambertMaterial({ color: PAL.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CITY.beachZ + 110);
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 1400),
    new THREE.MeshLambertMaterial({ color: PAL.water }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.35, CITY.waterZ + 690);
  group.add(sea);

  const prom = new THREE.Mesh(
    new THREE.BoxGeometry(bound * 2.4, 0.3, 8),
    new THREE.MeshLambertMaterial({ color: 0xb0a3a2 }),
  );
  prom.position.set(0, 0.15, CITY.beachZ + 4);
  group.add(prom);

  /* ---- neon signage: rooftop boards + promenade billboards ---- */
  addSignage(group, data);

  /* ---- landmarks ---- */
  group.add(buildTower());
  group.add(buildMall(landmarkOf(data, 'mall')));
  group.add(buildPlaza(landmarkOf(data, 'plaza')));
  group.add(buildDocks());
  group.add(buildBridge());

  return { group, drawCalls: group.children.length };
}

function landmarkOf(data, type) {
  return data.landmarks.find((l) => l.type === type) || { x: 0, z: 0 };
}

function buildTower() {
  const g = new THREE.Group();
  const x = -half + 22;
  const z = -half + 22;
  const mat = new THREE.MeshLambertMaterial({ color: 0xb04a5a });
  const legGeo = new THREE.CylinderGeometry(0.7, 1.1, 74, 4);
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(x + dx, 37, z + dz);
    leg.rotation.z = dx * 0.012;
    leg.rotation.x = -dz * 0.012;
    g.add(leg);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 14), new THREE.MeshLambertMaterial({ color: 0xd9c3a5 }));
  deck.position.set(x, 66, z);
  g.add(deck);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b5c }));
  beacon.position.set(x, 80, z);
  g.add(beacon);
  g.userData.beacon = beacon;
  // a couple of stays for silhouette
  const stayMat = new THREE.MeshBasicMaterial({ color: 0x2b2430, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 3; i++) {
    const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 46, 3), stayMat);
    stay.position.set(x + Math.cos(i * 2.1) * 9, 46, z + Math.sin(i * 2.1) * 9);
    stay.rotation.z = Math.cos(i * 2.1) * 0.32;
    stay.rotation.x = -Math.sin(i * 2.1) * 0.32;
    g.add(stay);
  }
  g.name = 'TorreFaro';
  return g;
}

function buildMall(mark) {
  const g = new THREE.Group();
  const x = mark.x ?? 200;
  const z = mark.z ?? 120;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(52, 15, 42),
    new THREE.MeshLambertMaterial({ color: 0xcfc3bb }),
  );
  body.position.set(x, 7.6, z);
  g.add(body);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(52.6, 6, 42.6),
    new THREE.MeshLambertMaterial({ color: 0x7fa9b6, emissive: 0x21323c, emissiveIntensity: 0.6 }),
  );
  glass.position.set(x, 5.2, z);
  g.add(glass);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(30, 2.6, 0.6),
    new THREE.MeshBasicMaterial({ color: PAL.neon }),
  );
  sign.position.set(x, 13.4, z + 21.4);
  g.add(sign);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xe6dfd4 }));
  canopy.position.set(x, 4.2, z + 24);
  g.add(canopy);
  // car park blocks
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(40, 0.12, 6), new THREE.MeshLambertMaterial({ color: 0x3a3842 }));
    p.position.set(x - 6 + i * 16, 0.06, z + 30);
    g.add(p);
  }
  g.name = 'GaleriaSol';
  return g;
}

function buildPlaza(mark) {
  const g = new THREE.Group();
  const px = mark?.x ?? 55;
  const pz = mark?.z ?? 55;
  const stone = new THREE.MeshLambertMaterial({ color: 0xa89b92 });
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 0.4, 24), stone);
  plaza.position.set(px, 0.2, pz);
  g.add(plaza);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(12, 12, 0.3, 24),
    new THREE.MeshLambertMaterial({ color: 0x3f7d8c }),
  );
  water.position.set(px, 0.42, pz);
  g.add(water);
  const obelisk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.8, 16, 4),
    new THREE.MeshLambertMaterial({ color: 0xe0d3bd }),
  );
  obelisk.position.set(px, 8.4, pz);
  g.add(obelisk);
  const clock = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  clock.position.set(px, 17, pz);
  g.add(clock);
  g.name = 'Plaza';
  return g;
}

function buildDocks() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4f3a });
  for (let i = 0; i < 3; i++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 74), wood);
    pier.position.set(-half + 40 + i * 26, 0.28, CITY.beachZ + 130);
    g.add(pier);
    for (let p = 0; p < 6; p++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.4, 5), wood);
      post.position.set(-half + 40 + i * 26 + (p % 2 ? 3.6 : -3.6), 0.2, CITY.beachZ + 100 + p * 12);
      g.add(post);
    }
  }
  const warehouse = new THREE.Mesh(
    new THREE.BoxGeometry(34, 11, 22),
    new THREE.MeshLambertMaterial({ color: 0x8d7f78 }),
  );
  warehouse.position.set(-half + 66, 5.6, CITY.beachZ + 34);
  g.add(warehouse);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(36, 0.8, 24), new THREE.MeshLambertMaterial({ color: 0x5c514c }));
  roof.position.set(-half + 66, 11.4, CITY.beachZ + 34);
  g.add(roof);
  // crane
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a23c });
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.4, 26, 1.4), craneMat);
  mast.position.set(-half + 118, 13, CITY.beachZ + 120);
  g.add(mast);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(30, 1.1, 1.1), craneMat);
  jib.position.set(-half + 128, 25, CITY.beachZ + 120);
  g.add(jib);
  g.name = 'Docks';
  return g;
}

function buildBridge() {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshLambertMaterial({ color: 0xb9b0a6 });
  const x = half - 60;
  const z0 = CITY.beachZ + 20;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 110), deckMat);
  deck.position.set(x, 6.5, z0 + 55);
  g.add(deck);
  const cableMat = new THREE.MeshBasicMaterial({ color: 0xd8c9b4 });
  for (const dz of [0, 110]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 26, 2.4), deckMat);
    tower.position.set(x, 13, z0 + dz);
    g.add(tower);
  }
  for (let i = 0; i <= 10; i++) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 15, 3), cableMat);
    cable.position.set(x, 19, z0 + i * 11);
    cable.rotation.x = 0.32;
    g.add(cable);
  }
  for (let i = 0; i < 5; i++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 7, 4), new THREE.MeshLambertMaterial({ color: 0x9a9188 }));
    pier.position.set(x, 3, z0 + 10 + i * 24);
    g.add(pier);
  }
  g.name = 'Bridge';
  return g;
}

/* ------------------------------------------------------------ signage & glow */

function makeTextTexture(text, colorHex) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  const col = '#' + colorHex.toString(16).padStart(6, '0');
  g.fillStyle = '#140f1c';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = col;
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 112);
  g.shadowColor = col;
  g.shadowBlur = 26;
  g.fillStyle = col;
  g.font = 'bold 52px "Trebuchet MS", "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addSignage(group, data) {
  // roof boards on the three tallest downtown blocks, each with its own neon message
  const names = [
    { text: 'MERCADO VIEJO', color: 0xff9a5c },
    { text: 'PLAYA SOL', color: 0xff5f8a },
    { text: 'COBRA AZUL', color: 0x5fd0ff },
  ];
  const cand = data.buildings
    .filter((b) => b.h > 22 && Math.abs(b.x) < 330 && Math.abs(b.z) < 330)
    .sort((a, b) => b.h - a.h);
  const picked = [];
  for (const b of cand) {
    if (picked.every((p) => Math.hypot(p.x - b.x, p.z - b.z) > 110)) picked.push(b);
    if (picked.length === names.length) break;
  }
  picked.forEach((b, i) => {
    const { text, color } = names[i % names.length];
    const sign = new THREE.Group();
    const w = Math.min(18, b.w * 0.9);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 3.6, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x1d1724 }),
    );
    sign.add(frame);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 3.2),
      new THREE.MeshBasicMaterial({ map: makeTextTexture(text, color), transparent: true }),
    );
    face.position.z = 0.24;
    sign.add(face);
    const railMat = new THREE.MeshBasicMaterial({ color });
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.14, 0.14), railMat);
    railTop.position.set(0, 1.85, 0.28);
    sign.add(railTop);
    const railBot = railTop.clone();
    railBot.position.y = -1.85;
    sign.add(railBot);
    sign.position.set(b.x, 0.18 + b.h + 2.1, b.z + b.d / 2 - 0.35);
    group.add(sign);
  });

  // pole billboards along the promenade and the docks
  for (const bb of data.billboards || []) {
    const g = new THREE.Group();
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3540 });
    for (const dx of [-3.4, 3.4]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 7.4, 6), poleMat);
      pole.position.set(dx, 3.7, 0);
      g.add(pole);
    }
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(10.4, 3.4, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x17131f }),
    );
    frame.position.set(0, 8.6, 0);
    g.add(frame);
    const faceMat = new THREE.MeshBasicMaterial({
      map: makeTextTexture(bb.text, bb.color), transparent: true, side: THREE.DoubleSide,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 3.0), faceMat);
    face.position.set(0, 8.6, 0.23);
    g.add(face);
    const halo = new THREE.PointLight(bb.color, 18, 26, 2);
    halo.position.set(0, 8.6, 1.2);
    g.add(halo);
    g.position.set(bb.x, 0.1, bb.z);
    g.rotation.y = bb.rot;
    group.add(g);
  }
}

function makeGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,236,190,1)');
  grd.addColorStop(0.35, 'rgba(255,190,110,0.55)');
  grd.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
