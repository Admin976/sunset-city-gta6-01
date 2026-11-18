// SUNSET CITY — all tuning numbers in one place. World units are metres-ish; y is up.
// The city is a deterministic grid: N roads per axis, spaced `spacing` apart, centred on the origin.

const GRID = 9;          // roads per axis (9 x 9 crossings)
const SPACING = 110;     // centre-to-centre distance between parallel roads
const ROAD_W = 18;       // asphalt width
const SIDEWALK = 4;      // raised concrete apron around each block

export const CITY = {
  seed: 20261119,
  grid: GRID,
  spacing: SPACING,
  roadWidth: ROAD_W,
  sidewalk: SIDEWALK,
  half: ((GRID - 1) * SPACING) / 2,          // 440: outermost road centre
  blockSize: SPACING - ROAD_W,               // 92: kerb-to-kerb block footprint
  lotInset: 7,                               // building setback inside a block
  groundY: 0.05,                             // where the player's feet rest
  bound: ((GRID - 1) * SPACING) / 2 + 110,   // hard map limit (beach side extends past it)
  beachZ: ((GRID - 1) * SPACING) / 2 + 60,   // sand starts here (south/+z)
  waterZ: ((GRID - 1) * SPACING) / 2 + 190,  // sea starts here
  floorHeight: 3.6,
  maxFloors: 12,
  minFloors: 2,
};

export const PLAYER = {
  radius: 0.55,
  height: 1.8,
  walkSpeed: 5.0,
  runSpeed: 10.0,
  accel: 26,
  friction: 14,
  jumpSpeed: 8.2,
  gravity: 26,
  turnLerp: 12,
  spawn: { x: 0, z: 30 },
  maxHealth: 100,
  startMoney: 2500,
};

export const CAMERA = {
  fov: 62,
  near: 0.1,
  far: 2200,
  distance: 8.5,
  minDistance: 4.0,
  maxDistance: 18.0,
  height: 1.55,          // look-at height above player feet
  pitch: 0.22,           // radians above the horizon (positive = looking down)
  minPitch: -0.25,
  maxPitch: 1.15,
  sensitivity: 0.0026,
  lerp: 9,
  collisionPad: 0.45,
};

export const TIME = {
  startMinutes: 17 * 60 + 40,   // low golden-hour sun
  minutesPerSecond: 0.65,       // real 1 s ≈ 0.65 in-game minutes (≈ 37 min per in-game day)
  dayStart: 5 * 60 + 30,
  nightStart: 21 * 60,
};

export const WANTED = { max: 5, start: 0 };

// Sunset coast palette. Hex strings; meshes convert with THREE.Color.
export const PALETTE = {
  skyTop: 0x241a44,
  skyMid: 0xc2534a,
  skyHorizon: 0xffb469,
  sun: 0xffe6b0,
  fog: 0x6d84a6,          // thin, cool haze over an orange horizon
  water: 0x1d4a60,
  sand: 0xf2d6a8,
  asphalt: 0x6b6874,
  asphaltLine: 0xe8d9b8,
  sidewalk: 0xc2b5ae,
  concrete: 0x6f6870,
  glass: [0x6f93a8, 0x7fa9b6, 0x8fa8a0, 0x6d7f96, 0x93a7b8],
  warm: [0xd8a17a, 0xc98d76, 0xe0b493, 0xb98a72],
  // facade families: cream stucco, white render, brick, blue curtain glass, pastel yellow
  facadeCream: 0xe8d3a8,
  facadeWhite: 0xf1e8d7,
  facadeBrick: 0xa5553f,
  facadeGlass: 0x6f9fb6,
  facadeYellow: 0xefd88f,
  window: 0x223140,
  windowLit: 0xffd9a0,
  awning: [0xc9533f, 0x2f7a6a, 0xd8a23c, 0x3f5f8a, 0xb44f6f],
  tree: 0x3d6b45,
  treeTrunk: 0x5b4636,
  roof: 0x4a444f,
  trim: 0xd9c3a5,
  trunk: 0x6a5140,
  palm: 0x3f6f4a,
  lamp: 0xffd9a0,
  accent: 0xff8a3d,
  neon: 0xff5f8a,
  playerSkin: 0xc98d68,
  playerShirt: 0xf2f0e8,
  playerPants: 0x2b3a55,
  playerHair: 0x2a1d18,
};

export const DISTRICTS = [
  'PUERTO SOL CENTRO',
  'PLAYA DORADA',
  'MUELLE VIEJO',
  'BARRIO DEL MERCADO',
  'COLINAS ALTAS',
  'DISTRITO AZUL',
  'LA MARINA',
  'COSTA NORTE',
  'EL MIRADOR',
];

// Rendering budget knobs: beyond these the instancing simply spreads further.
export const PERF = {
  maxPixelRatio: 1.75,
  shadowless: true,
  fogNear: 150,
  fogFar: 900,
};
