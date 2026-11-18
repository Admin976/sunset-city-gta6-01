// SUNSET CITY — boot, sky, sun, the one loop, and every module wired together.
// The city is generated once from a fixed seed, so Puerto Sol looks the same on every visit.
import * as THREE from 'three';
import { CITY, PALETTE, PLAYER, CAMERA, TIME, PERF } from './config.js';
import { generateCity, buildCityMeshes, districtAt } from './city.js';
import { Player } from './player.js';
import { OrbitCamera } from './camera.js';
import { HUD } from './hud.js';
import { Minimap } from './minimap.js';

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

/* ------------------------------------------------------------------ input */

const keys = new Set();
let jumpQueued = false;

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') jumpQueued = true;
  if (e.code === 'KeyR') {
    player.reset();
    state.health = PLAYER.maxHealth;
  }
  if (e.code === 'Enter' && state.mode === 'menu') startGame();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

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
}

document.getElementById('playbtn').addEventListener('click', startGame);
document.getElementById('ctrbtn').addEventListener('click', () => {
  controlsEl.classList.toggle('show');
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
  scene.fog.color.copy(fogColor);
  renderer.setClearColor(fogColor, 1);

  const warmth = THREE.MathUtils.clamp(goldenness, 0, 1);
  sun.color.setRGB(1.0, 0.68 + 0.16 * (1 - warmth), 0.44 + 0.3 * (1 - warmth));
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
window.__fps = 0;
window.__ready = false;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // in-game clock: the sun crosses the sky in ~37 real minutes
  state.minutes = (state.minutes + dt * TIME.minutesPerSecond) % 1440;
  updateSky(state.minutes);

  if (state.mode === 'play') {
    player.update(dt, readInput(), orbit.yaw, cityData.colliders);
    orbit.update(dt, player.position);
  } else {
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

  state.district = districtAt(cityData, player.position.x, player.position.z);
  state.health = player.health;
  state.velocity = player.velocity;

  hud.update(dt, {
    health: state.health,
    money: state.money,
    minutes: state.minutes,
    district: state.district,
    wanted: state.wanted,
    velocity: state.velocity,
  });
  minimap.update(player.position, player.yaw);

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

window.__game = {
  mode: state.mode,
  scene, camera, renderer, player, orbit, hud, city: cityData, state,
  start: startGame,
  info: () => renderer.info.render,
};

hud.setLoading('READY — GOLDEN HOUR');
requestAnimationFrame(frame);
