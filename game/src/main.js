// SUNSET CITY — boot, sky, sun, the one loop, and every module wired together.
// The city is generated once from a fixed seed, so Puerto Sol looks the same on every visit.
import * as THREE from 'three';
import { CITY, PALETTE, PLAYER, CAMERA, TIME, PERF } from './config.js';
import { generateCity, buildCityMeshes, districtAt } from './city.js';
import { Player } from './player.js';
import { OrbitCamera } from './camera.js';
import { HUD } from './hud.js';
import { Minimap } from './minimap.js';
import { Traffic } from './traffic.js';
import { Driving } from './driving.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { GameAudio } from './audio.js';
import { MissionSystem } from './missions.js';
import { PauseMenu, GameOverScreen, readSave, writeSave, clearSave } from './menu.js';

const params = new URLSearchParams(window.location.search);
const cinematic = params.get('view') === 'city';

/* ------------------------------------------------------------------ renderer */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PERF.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
const fogColor = new THREE.Color(PALETTE.fog);
scene.fog = new THREE.Fog(fogColor, PERF.fogNear, PERF.fogFar);

const camera = new THREE.PerspectiveCamera(
  CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far,
);
camera.position.set(0, 8, 60);

/* ------------------------------------------------------------------ sky */

const skyUniforms = {
  uTop: { value: new THREE.Color(PALETTE.skyTop) },
  uMid: { value: new THREE.Color(PALETTE.skyMid) },
  uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
  uSunDir: { value: new THREE.Vector3(0, 0.2, -1) },
  uSunColor: { value: new THREE.Color(PALETTE.sun) },
};

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1600, 32, 20),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.03, 0.32, h));
        col = mix(col, uTop, smoothstep(0.22, 0.92, h));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        float disc = pow(sd, 320.0);
        float glow = pow(sd, 7.0);
        float haze = pow(sd, 2.2) * 0.10;
        col += uSunColor * (disc * 1.9 + glow * 0.5 + haze);
        col = mix(col, uHorizon * 0.42, smoothstep(0.0, -0.22, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }),
);
sky.frustumCulled = false;
scene.add(sky);

/* ------------------------------------------------------------------ lights */

const hemi = new THREE.HemisphereLight(0xffb27a, 0x2a2438, 1.05);
scene.add(hemi);

// A soft warm ambient keeps shadowed facades from going black at dusk.
const ambient = new THREE.AmbientLight(0xffc9a8, 0.55);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffb070, 2.0);
sun.position.set(-300, 120, 200);
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0x7a8fc4, 0.42);
fill.position.set(240, 160, -260);
scene.add(fill);

/* ------------------------------------------------------------------ city */

const cityData = generateCity(CITY.seed);
const city = buildCityMeshes(cityData);
scene.add(city.group);

const player = new Player(scene);
const orbit = new OrbitCamera(camera, canvas, cityData.colliders);
orbit.yaw = 2.7;
const hud = new HUD(document);
const minimap = new Minimap(document.getElementById('minimap'), cityData);

/* ------------------------------------------------------------------ new systems */

const audio = new GameAudio();
const traffic = new Traffic(scene, cityData, audio);
const peds = new Peds(scene, cityData, 32);
const police = new Police(scene, cityData, audio);
const driving = new Driving(scene, player, camera, traffic, audio);
const combat = new Combat(scene, {
  player, camera, audio, peds, police, traffic,
  onCrime: commitCrime,
  onToast: (text) => hud.toast(text),
});

police.targetPos = player.position;
combat.onDeath = () => playerDown();

// a rotating landmark itinerary, drawn on the minimap
const landmarks = cityData.landmarks.filter((l) => l.type !== 'tower');
let objectiveIndex = 0;
const objective = { x: 0, z: 0, label: '' };
function refreshObjective() {
  const l = landmarks[objectiveIndex % landmarks.length];
  objective.x = l.x;
  objective.z = l.z;
  objective.label = l.name.toUpperCase();
}
refreshObjective();

const state = {
  mode: 'menu',                 // 'menu' | 'play'
  minutes: TIME.startMinutes,
  money: PLAYER.startMoney,
  health: PLAYER.maxHealth,
  wanted: 0,
  district: districtAt(cityData, player.position.x, player.position.z),
  velocity: player.velocity,
};

hud.setDistrictNow(state.district);

/* ------------------------------------------------------------------ story, save, menus */

let failedMission = null;      // job id to restart from the game-over card
let crimeCrashTimer = 0;       // throttle for petty-crime cash

const missions = new MissionSystem(scene, cityData, {
  player, hud, police, traffic, peds, driving, combat, audio,
  addMoney: (n, why) => {
    state.money = Math.max(0, state.money + n);
    if (why) hud.toast(`+$${n.toLocaleString('en-US')} — ${why}`);
  },
  toast: (text) => hud.toast(text),
  onStart: () => saveGame(),
  onComplete: () => saveGame(),
  onFail: (reason, def) => missionFailed(reason, def),
});

const pauseMenu = new PauseMenu(document, {
  missions,
  onResume: () => setPaused(false),
  onRestart: () => restartGame(),
  onStartMission: (id) => {
    failedMission = null;
    missions.start(id);
    setPaused(false);
  },
});

const gameOver = new GameOverScreen(document, {
  onRetry: () => retryJob(),
  onRoam: () => freeRoam(),
});

/** Every crime still reaches the police; the small-time ones also pay a little cash. */
function commitCrime(kind, pos, severity) {
  police.reportCrime(kind, pos, severity);
  if (state.mode !== 'play') return;
  if (kind === 'hitrun') {
    state.money += 75;
    hud.toast('+$75 — HIT AND RUN');
  } else if (kind === 'crash' && crimeCrashTimer <= 0) {
    crimeCrashTimer = 3.5;
    state.money += 20;
  }
}

/* ------------------------------------------------------------------ save file */

function saveGame() {
  if (state.mode !== 'play' && state.mode !== 'paused') return;
  writeSave({
    x: +player.position.x.toFixed(2),
    y: +player.position.y.toFixed(2),
    z: +player.position.z.toFixed(2),
    yaw: +player.yaw.toFixed(3),
    money: Math.round(state.money),
    health: Math.round(player.health),
    wanted: police.level,
    ammo: combat.ammo,
    minutes: +state.minutes.toFixed(1),
    missions: missions.serialize(),
    savedAt: Date.now(),
  });
}

function applySave(save) {
  player.position.set(save.x, save.y ?? CITY.groundY, save.z);
  player.velocity.set(0, 0, 0);
  player.yaw = save.yaw || 0;
  player.group.position.copy(player.position);
  player.health = Math.min(PLAYER.maxHealth, Math.max(30, save.health ?? PLAYER.maxHealth));
  state.money = Math.max(0, Math.round(save.money || 0));
  state.minutes = save.minutes ?? state.minutes;
  combat.ammo = Math.max(0, Math.min(combat.maxAmmo, save.ammo ?? 30));
  police.clear();
  if (save.wanted > 0) police.setWanted(save.wanted);
  orbit.initialised = false;
  if (save.missions) missions.restore(save.missions);
}

/* ------------------------------------------------------------------ pause / death */

function setPaused(on) {
  if (on && state.mode === 'play') {
    state.mode = 'paused';
    keys.clear();
    if (document.pointerLockElement) document.exitPointerLock?.();
    const stars = '★'.repeat(police.level) || '—';
    pauseMenu.show(
      `CASH $${Math.round(state.money).toLocaleString('en-US')}  ·  `
      + `JOBS ${missions.progress.completed.length}/${missions.defs.length}  ·  WANTED ${stars}`,
    );
    saveGame();
  } else if (!on && state.mode === 'paused') {
    state.mode = 'play';
    pauseMenu.hide();
  }
  if (window.__game) window.__game.mode = state.mode;
}

function playerDown() {
  if (state.mode !== 'play' && state.mode !== 'paused') return;
  const def = missions.active ? missions.def : null;
  if (def) failedMission = def.id;
  missions.onPlayerDeath();
  if (driving.active) driving.exit();
  pauseMenu.hide();
  state.mode = 'dead';
  keys.clear();
  if (document.pointerLockElement) document.exitPointerLock?.();
  gameOver.show({
    kicker: def ? `JOB FAILED — ${def.title}` : 'SUNSET CITY',
    title: 'WASTED',
    sub: def ? 'NICO IS DOWN. THE JOB IS BLOWN.' : 'NICO IS DOWN ON THE COAST ROAD.',
    retryLabel: def ? 'RETRY JOB' : 'RESPAWN',
  });
  if (window.__game) window.__game.mode = state.mode;
}

function missionFailed(reason, def) {
  failedMission = def ? def.id : null;
  if (driving.active) driving.exit();
  pauseMenu.hide();
  state.mode = 'failed';
  keys.clear();
  if (document.pointerLockElement) document.exitPointerLock?.();
  gameOver.show({
    kicker: def ? `JOB FAILED — ${def.title}` : 'JOB FAILED',
    title: reason === 'TIME' ? 'OUT OF TIME' : 'WASTED',
    sub: reason === 'TIME'
      ? 'COBRA AZUL DOES NOT WAIT. RUN THE JOB AGAIN.'
      : 'THE STREET TOOK YOU. RUN THE JOB AGAIN.',
    retryLabel: 'RETRY JOB',
  });
  if (window.__game) window.__game.mode = state.mode;
}

function retryJob() {
  gameOver.hide();
  if (driving.active) driving.exit();
  player.reset();
  player.health = PLAYER.maxHealth;
  combat.ammo = Math.max(30, combat.ammo);
  combat.hitFlash = 0;
  police.clear();
  state.mode = 'play';
  const id = failedMission;
  failedMission = null;
  if (id) missions.start(id);
  else missions.beginNext();
  hud.toast(id ? 'JOB RESTARTED' : 'BACK ON THE PROMENADE');
  if (window.__game) window.__game.mode = state.mode;
  saveGame();
}

function freeRoam() {
  gameOver.hide();
  if (driving.active) driving.exit();
  missions.abort();
  player.reset();
  player.health = PLAYER.maxHealth;
  police.clear();
  failedMission = null;
  state.mode = 'play';
  if (window.__game) window.__game.mode = state.mode;
  saveGame();
}

function restartGame() {
  clearSave();
  window.location.reload();
}

/* ------------------------------------------------------------------ input */

const keys = new Set();
let jumpQueued = false;

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;

  // pause / resume from anywhere in play
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state.mode === 'play') setPaused(true);
    else if (state.mode === 'paused') setPaused(false);
    return;
  }
  if (e.code === 'Enter' && state.mode === 'menu') { startGame(); return; }
  if (state.mode !== 'play') return;

  keys.add(e.code);
  if (e.code === 'Space' && !driving.active) jumpQueued = true;
  if (e.code === 'KeyE') toggleVehicle();
  if (e.code === 'KeyF' && state.mode === 'play' && !driving.active) combat.punch();
  if (e.code === 'KeyH') {
    if (audio.started) audio.horn(0.8);
    else audio.start();
  }
  if (e.code === 'KeyK' && state.mode === 'play') {
    police.reportCrime('assault', player.position, 1);
    hud.toast('POLICE ALERTED — DEMO');
  }
  if (e.code === 'KeyR') {
    if (driving.active) driving.exit();
    player.reset();
    player.health = PLAYER.maxHealth;
    combat.ammo = 30;
    police.clear();
    hud.toast('RESET');
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/* ------------------------------------------------------------------ vehicles / weapons */

function toggleVehicle() {
  if (state.mode !== 'play') return;
  if (driving.active) {
    driving.exit();
    hud.toast('BACK ON FOOT');
    return;
  }
  const car = driving.nearest(player.position);
  if (!car) {
    hud.toast('NO VEHICLE NEARBY');
    return;
  }
  let witnesses = 0;
  for (const p of peds.peds) {
    if (p.state === 'down') continue;
    if (Math.hypot(p.position.x - player.position.x, p.position.z - player.position.z) < 26) witnesses++;
  }
  driving.enter(car);
  if (witnesses > 0) {
    police.reportCrime('carjack', player.position, 2);
    state.money += 150;
    hud.toast(`GRAND THEFT AUTO — ${car.spec.label}  +$150`);
  } else {
    hud.toast(`${car.spec.label} — GO`);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (state.mode !== 'play') return;
  if (!audio.started) audio.start();
  if (!driving.active) combat.fire();
});

function readInput() {
  const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  return { x, z, run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: jumpQueued };
}

/* ------------------------------------------------------------------ title / state */

const titleEl = document.getElementById('title');
const controlsEl = document.getElementById('controls');

function startGame() {
  state.mode = 'play';
  titleEl.classList.add('hidden');
  hud.setLoading('');
  window.__game.mode = 'play';
  audio.start();
  const save = readSave();
  if (save) {
    applySave(save);
    hud.toast('SAVE LOADED — WELCOME BACK');
  }
  if (!missions.active) missions.beginNext();
  hud.toast('CLICK TO FIRE — E TO DRIVE');
}

document.getElementById('playbtn').addEventListener('click', startGame);
document.getElementById('ctrbtn').addEventListener('click', () => {
  controlsEl.classList.toggle('show');
});
document.getElementById('btnfire').addEventListener('click', () => {
  if (state.mode !== 'play') return;
  audio.start();
  if (!driving.active) combat.fire();
});
document.getElementById('btnpunch').addEventListener('click', () => {
  if (state.mode === 'play' && !driving.active) combat.punch();
});
document.getElementById('btnuse').addEventListener('click', toggleVehicle);
document.getElementById('btnhorn').addEventListener('click', () => {
  audio.start();
  audio.horn(0.7);
});
if (cinematic) titleEl.classList.add('hidden');

/* ------------------------------------------------------------------ sun & sky per frame */

const dayTop = new THREE.Color(0x2c4f8c);
const dayMid = new THREE.Color(0x6f9ac4);
const dayHorizon = new THREE.Color(0xcfe0e8);
const duskTop = new THREE.Color(PALETTE.skyTop);
const duskMid = new THREE.Color(PALETTE.skyMid);
const duskHorizon = new THREE.Color(PALETTE.skyHorizon);
const nightTop = new THREE.Color(0x070a18);
const nightMid = new THREE.Color(0x131a2f);
const nightHorizon = new THREE.Color(0x33253c);
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const fogBlue = new THREE.Color(0x3d5574);

function updateSky(minutes) {
  // Elevation: 0 at 06:00, 1 at 12:00, 0 at 18:00, negative at night.
  const elevation = Math.sin(((minutes - 360) / 720) * Math.PI);
  const az = Math.PI * 0.86;
  const cosE = Math.cos(Math.asin(THREE.MathUtils.clamp(elevation, -1, 1)));
  const dir = skyUniforms.uSunDir.value.set(
    Math.cos(az) * cosE,
    THREE.MathUtils.clamp(elevation, -0.35, 1),
    Math.sin(az) * cosE,
  ).normalize();

  const dayness = THREE.MathUtils.smoothstep(elevation, -0.02, 0.42);
  const goldenness = 1 - Math.abs(THREE.MathUtils.clamp(elevation, -0.1, 0.5) - 0.16) / 0.66;

  tmpA.copy(nightTop).lerp(duskTop, THREE.MathUtils.smoothstep(elevation, -0.28, 0.02));
  skyUniforms.uTop.value.copy(tmpA).lerp(dayTop, dayness * 0.85);
  tmpB.copy(nightMid).lerp(duskMid, THREE.MathUtils.smoothstep(elevation, -0.25, 0.05));
  skyUniforms.uMid.value.copy(tmpB).lerp(dayMid, dayness * 0.8);
  tmpA.copy(nightHorizon).lerp(duskHorizon, THREE.MathUtils.smoothstep(elevation, -0.22, 0.0));
  skyUniforms.uHorizon.value.copy(tmpA).lerp(dayHorizon, Math.max(0, dayness - 0.25));

  fogColor.copy(skyUniforms.uHorizon.value).lerp(skyUniforms.uMid.value, 0.42).multiplyScalar(0.86);
  // a thin, cool haze sits over the warm horizon
  fogColor.lerp(fogBlue, 0.5);
  scene.fog.color.copy(fogColor);
  renderer.setClearColor(fogColor, 1);

  // street lamps and shop neon come up as the sun drops
  const dusk = 1 - THREE.MathUtils.smoothstep(elevation, -0.06, 0.28);
  const glow = city.group.userData.lampGlow;
  if (glow) glow.opacity = 0.1 + 0.8 * dusk;

  const warmth = THREE.MathUtils.clamp(goldenness, 0, 1);
  sun.color.setRGB(1.0, 0.5 + 0.24 * (1 - warmth), 0.3 + 0.28 * (1 - warmth));
  sun.intensity = THREE.MathUtils.clamp(2.0 + elevation * 2.4, 1.4, 4.4);
  sun.position.copy(dir).multiplyScalar(520);
  hemi.intensity = THREE.MathUtils.clamp(2.1 + elevation * 1.6, 1.5, 3.4);
  hemi.color.copy(skyUniforms.uHorizon.value);
  hemi.groundColor.setHex(0x38303f);
  fill.intensity = THREE.MathUtils.clamp(1.35 - elevation * 0.4, 0.7, 1.35);
  renderer.toneMappingExposure = 1.0 + THREE.MathUtils.clamp(elevation, 0, 1) * 0.28;
}

/* ------------------------------------------------------------------ loop */

const clock = new THREE.Clock();
let elapsed = 0;
let frames = 0;
let fpsTimer = 0;
let footstepTimer = 0;
let objectiveTimer = 0;
let saveTimer = 6;
const driveVel = new THREE.Vector3();
window.__fps = 0;
window.__ready = false;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // in-game clock: the sun crosses the sky in ~37 real minutes (frozen while paused)
  if (state.mode === 'play') {
    state.minutes = (state.minutes + dt * TIME.minutesPerSecond) % 1440;
  }
  updateSky(state.minutes);

  if (state.mode === 'play') {
    if (driving.active) {
      driving.update(dt, {
        throttle: keys.has('KeyW'),
        brake: keys.has('KeyS'),
        left: keys.has('KeyA'),
        right: keys.has('KeyD'),
        handbrake: keys.has('Space'),
      }, cityData.colliders, {
        peds,
        police,
        onCrime: commitCrime,
      });
      driving.updateCamera(dt);
      player.group.visible = false;
    } else {
      player.group.visible = true;
      player.update(dt, readInput(), orbit.yaw, cityData.colliders);
      orbit.update(dt, player.position);
      // footsteps
      footstepTimer -= dt;
      if (player.speed > 1.2 && footstepTimer <= 0) {
        footstepTimer = player.speed > 7 ? 0.28 : 0.44;
        audio.footstep(player.speed > 7 ? 0.7 : 0.4);
      }
    }
  } else if (state.mode === 'menu') {
    // title / vista: a slow drift around the spawn point
    if (cinematic) {
      const a = elapsed * 0.075;
      camera.position.set(Math.sin(a) * 250, 72, Math.cos(a) * 250 + 30);
      camera.lookAt(0, 26, 20);
    } else {
      player.update(dt, { x: 0, z: 0, run: false, jump: false }, orbit.yaw, cityData.colliders);
      orbit.yaw += dt * 0.06;
      orbit.update(dt, player.position);
    }
  }
  jumpQueued = false;

  sky.position.copy(camera.position);

  // the beacon on Torre Faro pulses at dusk
  const beacon = city.group.getObjectByName('TorreFaro')?.userData.beacon;
  if (beacon) beacon.material.color.setRGB(1, 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(elapsed * 3)), 0.32);

  /* -------------------------------------------------------- world systems */
  const playing = state.mode === 'play';
  const simRunning = playing || state.mode === 'menu';
  if (simRunning) {
    traffic.update(dt, {
      player,
      minutes: state.minutes,
      driving: driving.active,
      playerCar: driving.car,
    });
    peds.update(dt, { player, colliders: cityData.colliders });
    police.update(dt, {
      player,
      driving: driving.active,
      combat,
      toast: (t) => hud.toast(t),
    });
    combat.update(dt);
    audio.update(dt, {
      driving: driving.active,
      speed: driving.active ? Math.abs(driving.speed) : 0,
      throttle: driving.throttle > 0,
    });
  }
  if (playing) {
    missions.update(dt);
    crimeCrashTimer = Math.max(0, crimeCrashTimer - dt);
    saveTimer -= dt;
    if (saveTimer <= 0) {
      saveTimer = 8;
      saveGame();
    }
  }

  // objective: a mission marker when a job is live, otherwise the rotating landmark tour
  const missionActive = missions.active;
  const objX = missionActive ? missions.objective.x : objective.x;
  const objZ = missionActive ? missions.objective.z : objective.z;
  const objDist = Math.hypot(player.position.x - objX, player.position.z - objZ);
  objectiveTimer -= dt;
  if (!missionActive && objDist < 24 && objectiveTimer <= 0) {
    objectiveIndex = (objectiveIndex + 1) % landmarks.length;
    refreshObjective();
    objectiveTimer = 6;
    if (playing) hud.toast('NEW DESTINATION — ' + objective.label);
  }

  state.district = districtAt(cityData, player.position.x, player.position.z);
  state.health = player.health;
  if (driving.active) {
    driveVel.set(Math.sin(driving.yaw) * driving.speed, 0, Math.cos(driving.yaw) * driving.speed);
    state.velocity = driveVel;
  } else {
    state.velocity = player.velocity;
  }

  hud.update(dt, {
    health: state.health,
    money: state.money,
    minutes: state.minutes,
    district: state.district,
    wanted: police.level,
    velocity: state.velocity,
    ammo: combat.ammo,
    weapon: combat.weapon,
    carName: driving.active && driving.car ? driving.car.spec.label : 'ON FOOT',
    damage: driving.damage,
    driving: driving.active,
    objective: missionActive
      ? missions.objectiveLabel()
      : `${objective.label}  ${Math.round(objDist)}m`,
    hurtFlash: combat.hitFlash > 0,
  });
  minimap.update(player.position, driving.active ? driving.yaw : player.yaw, {
    objective: missionActive ? missions.objective : objective,
    police: [
      ...police.cars.map((c) => ({ x: c.position.x, z: c.position.z })),
      ...police.officers.filter((o) => o.state !== 'down').map((o) => ({ x: o.position.x, z: o.position.z })),
    ],
    playerCar: driving.active && driving.car ? driving.car.position : null,
  });

  renderer.render(scene, camera);

  frames += 1;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    window.__fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
  }
  if (elapsed > 0.2) window.__ready = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------- screenshot staging */

function posePlayer(x, z, yaw, camYaw, pitch, dist) {
  player.position.set(x, CITY.groundY, z);
  player.velocity.set(0, 0, 0);
  player.yaw = yaw;
  player.group.position.copy(player.position);
  player.group.rotation.y = yaw;
  orbit.yaw = camYaw;
  orbit.pitch = pitch;
  orbit.wantDistance = dist;
  orbit.distance = dist;
  orbit.initialised = false;
}

function quietMission() {
  missions.state = 'idle';
  missions.progress.active = null;
  missions.def = null;
  missions.dialogQueue.length = 0;
  missions.dialogLine = null;
  missions.hideMarker?.();
  missions.hideSubtitle?.();
  missions.el?.panel?.classList.add('hidden');
  missions.bannerTimer = 0;
  missions.el?.banner?.classList.remove('show');
  hud.toastTimer = 0;
  hud.el?.toast?.classList.remove('show');
  hud.hintTimer = 0;
  hud.el?.hint?.classList.remove('show');
  const hintEl = document.getElementById('hint');
  if (hintEl) hintEl.style.display = 'none';
}

/** Deterministic set-ups for the four submission screenshots. */
function stageShot(kind) {
  if (state.mode !== 'play') startGame();
  keys.clear();
  quietMission();
  police.disposeAll();
  police.level = 0;
  if (driving.active) driving.exit();

  if (kind === 'chase') {
    // clear the kerb beside the chase so the patrol car is the only vehicle in frame
    for (const c of traffic.cars) {
      if (c.kind === 'parked' && Math.abs(c.position.x) < 22 && Math.abs(c.position.z - 40) < 70) {
        c.position.z += 260;
        c.group.position.copy(c.position);
      }
    }
    posePlayer(4.2, 40, Math.PI, 0, 0.1, 12.0);
    police.level = 3;
    police.heat = 0;
    police.lightPhase = 0.2;
    police.spawnCar(7.6, 43.5, 0.25);
    police.spawnCar(-4.5, 24, 0.1);
    police.updateSirens(0.016);
    hud.toast('WANTED — 3 STARS');
    // legs pumping and a real running speed on the speedometer
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  } else if (kind === 'city') {
    posePlayer(-10.5, 55, Math.PI, 0, 0.14, 7.5);
  } else if (kind === 'drive') {
    const car = traffic.cars.find((c) => c.kind === 'parked' && c.type === 'sport')
      || traffic.cars.find((c) => c.kind === 'parked');
    if (car) {
      driving.enter(car);
      car.position.set(4.6, 0.05, 42);
      car.yaw = 0;
      car.group.position.copy(car.position);
      car.group.rotation.y = 0;
      driving.yaw = 0;
      driving.speed = 16;
      driving.camReady = false;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    }
  } else if (kind === 'mission') {
    missions.progress.completed = ['m1'];
    missions.start('m2');
    missions.bannerTimer = 0;
    missions.el?.banner?.classList.remove('show');
    posePlayer(55, 30, 0, Math.PI, 0.12, 7.5);
    missions.say([{ who: 'RICO', text: 'Vela still owes Cobra Azul. Make him remember.', hold: 300 }]);
    missions.updateDialog(0.01);
  }
}

window.__game = {
  mode: state.mode,
  scene, camera, renderer, player, orbit, hud, city: cityData, state,
  vehicles: traffic, traffic, driving, peds, police, combat, audio, objective,
  missions, pauseMenu, gameOver,
  start: startGame,
  pause: setPaused,
  save: saveGame,
  revive: retryJob,
  shot: stageShot,
  info: () => renderer.info.render,
};

const existingSave = readSave();
if (existingSave) {
  const pb = document.getElementById('playbtn');
  if (pb) pb.textContent = 'CONTINUE';
}

hud.setLoading('READY — GOLDEN HOUR');
requestAnimationFrame(frame);
