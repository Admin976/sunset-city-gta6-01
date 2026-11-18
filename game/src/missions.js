// Missions: five chained jobs for Nico Reyes, a courier who owes the Cobra Azul syndicate.
// Each job is a list of stages (go here, hold position, steal this car, chase this man, win a
// shootout). The system owns the world beacon, the mission HUD panel, subtitles, timers and the
// reward/progression bookkeeping; main.js only feeds it the frame and asks where the objective is.
import * as THREE from 'three';
import { CITY } from './config.js';
import { makeCitizen } from './peds.js';

const THUG_LOOK = { shirt: 0x2b4a8c, pants: 0x1c2230, skin: 0xb98a68, hair: 0x10131a };
const RUNNER_LOOK = { shirt: 0xd8d2c0, pants: 0x3c3a40, skin: 0x7d5238, hair: 0x1b1712 };

const T = (who, text, hold = 3.9) => ({ who, text, hold });

/**
 * The five jobs, in order. Positions come from the generated city so they always sit on a real
 * landmark or road (the city seed is fixed, but this keeps the two in sync if the grid changes).
 */
export function buildMissionDefs(data) {
  const lm = (type) => data.landmarks.find((l) => l.type === type) || { x: 0, z: 0 };
  const mall = lm('mall');
  const plaza = lm('plaza');
  const docks = lm('docks');
  // the mall landmark is the block centre (inside the building): the drop point is the front apron
  const mallFront = { x: mall.x, z: mall.z + 36 };

  return [
    {
      id: 'm1',
      title: 'EL PAQUETE',
      client: 'COBRA AZUL',
      tag: 'JOB 01 / DELIVERY',
      reward: 600,
      timeLimit: 300,
      stages: [
        {
          type: 'goto', x: mallFront.x, z: mallFront.z, radius: 9,
          label: 'DELIVER THE PARCEL — GALERÍA SOL',
          dialog: [
            T('RICO', 'Nico Reyes. You owe Cobra Azul eight thousand. Tonight you start paying.'),
            T('NICO', "I just drive, Rico. I never touched the merchandise."),
            T('RICO', 'Then drive. Galería Sol. The parcel stays closed.'),
          ],
        },
        {
          type: 'wait', x: mallFront.x, z: mallFront.z, radius: 10, seconds: 3,
          label: 'HAND THE PARCEL TO THE BUYER',
          dialog: [
            T('BUYER', "You're late, courier."),
            T('NICO', 'Traffic on the coast road. Blame the sunset.'),
          ],
        },
      ],
      outro: [T('RICO', 'Clean. Six hundred. One payment down.')],
    },
    {
      id: 'm2',
      title: 'LA DEUDA',
      client: 'COBRA AZUL',
      tag: 'JOB 02 / COLLECTION',
      reward: 900,
      timeLimit: 360,
      stages: [
        {
          type: 'goto', x: plaza.x, z: plaza.z, radius: 8,
          label: 'FIND VELA — PLAZA DEL RELOJ',
          dialog: [
            T('RICO', "Old man Vela at the plaza. Three weeks late on his tab."),
            T('NICO', "And if he doesn't have it?"),
            T('RICO', 'Then he remembers that he does.'),
          ],
        },
        {
          type: 'wait', x: plaza.x, z: plaza.z, radius: 10, seconds: 3.5,
          label: 'PRESSURE VELA FOR THE CASH',
          dialog: [
            T('VELA', 'I sold nothing this week, Nico. Nothing!'),
            T('NICO', "Cobra Azul doesn't take weather reports, Vela."),
            T('VELA', 'Take it. Take all of it. Just don\u2019t come back.'),
          ],
        },
        {
          type: 'goto', x: 4.6, z: 112, radius: 9,
          label: 'DROP THE CASH — AVENIDA SOL',
          dialog: [T('RICO', 'Corner of Avenida Sol. Don\u2019t count it in the street.')],
        },
      ],
      outro: [T('RICO', 'Nine hundred. The boss is starting to like you, courier.')],
    },
    {
      id: 'm3',
      title: 'EL COCHE AZUL',
      client: 'COBRA AZUL',
      tag: 'JOB 03 / GRAND THEFT',
      reward: 1500,
      timeLimit: 420,
      stages: [
        {
          type: 'steal', x: 4.6, z: 220, radius: 7, carType: 'sport', yaw: 0, color: 0x2f6fd0,
          label: 'STEAL THE BLUE SPORT — AVENIDA SOL',
          dialog: [
            T('RICO', "A blue sport is parked on Avenida Sol. It belongs to a friend of ours."),
            T('NICO', 'You want me to steal from your own people?'),
            T('RICO', "He's not our people anymore. Keys are inside. Go."),
          ],
        },
        {
          type: 'deliver', x: docks.x, z: docks.z - 10, radius: 13,
          label: 'DELIVER THE CAR TO MUELLE VIEJO',
          dialog: [
            T('RICO', 'Bring it to the docks. Don\u2019t scratch it — the paint is evidence.'),
            T('NICO', 'Everything I drive is evidence, Rico.'),
          ],
        },
      ],
      outro: [T('RICO', 'Fifteen hundred. You keep this up, the debt dies before you do.')],
    },
    {
      id: 'm4',
      title: 'EL SAPO',
      client: 'COBRA AZUL',
      tag: 'JOB 04 / MANHUNT',
      reward: 2200,
      timeLimit: 300,
      stages: [
        {
          type: 'chase', x: 110, z: 330, radius: 5,
          label: 'CHASE DOWN TITO THE INFORMANT',
          dialog: [
            T('RICO', 'Somebody talked. Little rat named Tito, running the market blocks.'),
            T('NICO', 'Alive or dead?'),
            T('RICO', 'Catch him first. Decide after.'),
          ],
        },
        {
          type: 'fight', x: 110, z: 440, radius: 26, count: 2,
          label: "DEAL WITH TITO'S BACKUP",
          dialog: [
            T('TITO', 'You think I run alone, courier?!'),
            T('NICO', 'I think you talk too much.'),
          ],
        },
      ],
      outro: [T('RICO', 'Tito won\u2019t be calling anyone for a while. Twenty-two hundred.')],
    },
    {
      id: 'm5',
      title: 'MUELLE VIEJO',
      client: 'COBRA AZUL',
      tag: 'JOB 05 / PAYDAY',
      reward: 4000,
      timeLimit: 420,
      stages: [
        {
          type: 'goto', x: docks.x, z: docks.z, radius: 11,
          label: 'MEET THE BOSS — MUELLE VIEJO',
          dialog: [
            T('RICO', 'The boss wants to meet. Docks, tonight. Bring the pistol.'),
            T('NICO', 'This smells like a setup.'),
            T('RICO', 'Then shoot first.'),
          ],
        },
        {
          type: 'fight', x: docks.x, z: docks.z, radius: 34, count: 4,
          label: 'SURVIVE THE MUELLE VIEJO AMBUSH',
          dialog: [
            T('COBRA', "Nico Reyes. You've been paying with our money."),
            T('NICO', 'You should have itemised the debt.'),
          ],
        },
        {
          type: 'goto', x: docks.x + 70, z: docks.z - 90, radius: 10,
          label: 'GET OUT OF THE DOCKS',
          dialog: [T('RICO', 'Get to the coast road. I\u2019ll find you.')],
        },
      ],
      outro: [
        T('NICO', 'Debt paid. Docks quiet. For now.'),
        T('RICO', 'Cobra Azul owns you now, Nico. That\u2019s worse.'),
      ],
    },
  ];
}

export class MissionSystem {
  constructor(scene, data, deps) {
    this.scene = scene;
    this.data = data;
    this.deps = deps;
    this.defs = buildMissionDefs(data);

    this.progress = { completed: [], active: null };
    this.def = null;
    this.stageIndex = 0;
    this.stageTime = 0;         // accumulated hold time for 'wait'
    this.elapsed = 0;
    this.state = 'idle';        // 'idle' | 'active'
    this.actors = [];           // runner / thugs / mission car
    this.missionCar = null;
    this.autoStartTimer = -1;

    this.dialogQueue = [];
    this.dialogLine = null;
    this.dialogTimer = 0;

    this.bannerTimer = 0;

    /* ---------------------------------------------------------------- HUD DOM */
    this.el = {
      panel: document.getElementById('missionpanel'),
      title: document.getElementById('mp-title'),
      tag: document.getElementById('mp-tag'),
      reward: document.getElementById('mp-reward'),
      objective: document.getElementById('mp-objective'),
      timer: document.getElementById('mp-timer'),
      bar: document.getElementById('mp-bar'),
      banner: document.getElementById('missionbanner'),
      bKicker: document.getElementById('mb-kicker'),
      bTitle: document.getElementById('mb-title'),
      bSub: document.getElementById('mb-sub'),
      sub: document.getElementById('subtitle'),
      subWho: document.getElementById('subwho'),
      subText: document.getElementById('subtext'),
    };

    /* ---------------------------------------------------------------- beacon */
    this.marker = new THREE.Group();
    this.marker.visible = false;
    const colMat = new THREE.MeshBasicMaterial({
      color: 0xffcf6a, transparent: true, opacity: 0.26, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.4, 60, 18, 1, true), colMat);
    this.column.position.y = 30;
    // a tight, bright core so the beam still reads above the skyline and against lit facades
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c0, transparent: true, opacity: 0.62, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.5, 78, 10, 1, true), coreMat);
    this.core.position.y = 39;
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd98a, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.16, 6, 44), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.35;
    this.ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 6, 36), ringMat.clone());
    this.ring2.rotation.x = -Math.PI / 2 + 0.4;
    this.ring2.position.y = 6.5;
    this.marker.add(this.column, this.core, this.ring, this.ring2);
    scene.add(this.marker);

    this.objective = { x: 0, z: 0, label: 'FREE ROAM' };
    this.markerActive = false;
    this.tmp = new THREE.Vector3();
  }

  /* ================================================================== public */

  get active() { return this.state === 'active'; }

  get objectiveText() {
    if (!this.def) return null;
    const st = this.def.stages[this.stageIndex];
    if (!st) return null;
    return st.label;
  }

  unlocked(id) {
    const i = this.defs.findIndex((m) => m.id === id);
    if (i <= 0) return true;
    return this.progress.completed.includes(this.defs[i - 1].id);
  }

  completed(id) { return this.progress.completed.includes(id); }

  /** Next job the player has earned but not finished, or null. */
  nextMission() {
    for (const m of this.defs) {
      if (!this.progress.completed.includes(m.id) && this.unlocked(m.id)) return m;
    }
    return null;
  }

  /** Start (or restart) a job at stage 0. */
  start(id, stageIndex = 0) {
    const def = this.defs.find((m) => m.id === id);
    if (!def || !this.unlocked(id)) return false;
    this.clearActors(true);
    this.def = def;
    this.progress.active = id;
    this.state = 'active';
    this.elapsed = 0;
    this._timeWarned = false;
    this.dialogQueue.length = 0;
    this.hideSubtitle();
    this.banner('NEW JOB — ' + def.tag, def.title, `CLIENT ${def.client}  ·  $${def.reward}`, 3.6);
    this.startStage(stageIndex);
    if (this.el && this.el.panel) this.el.panel.classList.remove('hidden');
    this.deps.onStart?.(def);
    return true;
  }

  beginNext() {
    const next = this.nextMission();
    if (next && !this.active) this.start(next.id);
    return !!next;
  }

  /** Player died: the job is lost, the world cleans up. */
  onPlayerDeath() {
    if (!this.active) return;
    this.clearActors(true);
    this.state = 'idle';
    this.progress.active = null;
    this.def = null;
    this.hideMarker();
    this.dialogQueue.length = 0;
    this.hideSubtitle();
    if (this.el?.panel) this.el.panel.classList.add('hidden');
  }

  /** Abandon the current job (menu "continue free roam"). */
  abort() {
    if (!this.active) return;
    this.clearActors(true);
    this.state = 'idle';
    this.progress.active = null;
    this.def = null;
    this.hideMarker();
    this.dialogQueue.length = 0;
    this.hideSubtitle();
    if (this.el?.panel) this.el.panel.classList.add('hidden');
    this.deps.toast?.('JOB DROPPED — FREE ROAM');
  }

  serialize() {
    return {
      completed: this.progress.completed.slice(),
      active: this.progress.active,
      stage: this.active ? this.stageIndex : 0,
    };
  }

  restore(save) {
    if (!save) return;
    this.progress.completed = Array.isArray(save.completed) ? save.completed.slice() : [];
    const id = save.active;
    if (id && this.defs.some((m) => m.id === id)) {
      this.start(id, Math.max(0, Math.min(save.stage | 0, this.defs.find((m) => m.id === id).stages.length - 1)));
    }
  }

  /* ================================================================== stages */

  startStage(i) {
    const def = this.def;
    if (!def) return;
    this.stageIndex = i;
    this.stageTime = 0;
    this._needCarWarn = false;
    this.clearActors(false);

    const st = def.stages[i];
    this.setMarker(st.x, st.z);
    this.dialogQueue.length = 0;      // each stage speaks for itself
    this.hideSubtitle();
    if (st.dialog) this.say(st.dialog);
    if (st.type === 'steal' || st.type === 'deliver') this.spawnMissionCar(st);
    if (st.type === 'chase') this.spawnRunner(st);
    if (st.type === 'fight') this.spawnThugs(st);
    this.updatePanel(true);
  }

  completeStage() {
    const def = this.def;
    const last = this.stageIndex >= def.stages.length - 1;
    this.clearActors(false);
    if (last) {
      this.completeMission();
      return;
    }
    this.deps.audio?.impact?.(0.25);
    this.deps.toast?.('OBJECTIVE COMPLETE');
    this.startStage(this.stageIndex + 1);
  }

  completeMission() {
    const def = this.def;
    if (!def) return;
    this.clearActors(true);
    this.state = 'idle';
    this.progress.active = null;
    if (!this.progress.completed.includes(def.id)) this.progress.completed.push(def.id);
    this.deps.addMoney?.(def.reward);
    this.deps.onComplete?.(def);
    this.hideMarker();
    if (this.el?.panel) this.el.panel.classList.add('hidden');
    this.banner('MISSION COMPLETE', def.title, `+$${def.reward.toLocaleString('en-US')}`, 4.2);
    this.dialogQueue.length = 0;
    this.hideSubtitle();
    if (def.outro) this.say(def.outro);
    this.def = null;
    this.stageIndex = 0;
    this.autoStartTimer = 5.5;
    this.deps.audio?.horn?.(0.35, 0.8);
  }

  fail(reason) {
    if (!this.active) return;
    const def = this.def;
    this.clearActors(true);
    this.state = 'idle';
    this.progress.active = null;
    this.hideMarker();
    this.dialogQueue.length = 0;
    this.hideSubtitle();
    if (this.el?.panel) this.el.panel.classList.add('hidden');
    this.def = null;
    this.deps.onFail?.(reason, def);
  }

  /* ================================================================== actors */

  spawnMissionCar(st) {
    const traffic = this.deps.traffic;
    if (!traffic || this.missionCar) return;
    const car = traffic.makeCar(st.carType || 'sport', st.x, st.z, st.yaw || 0, 'parked', { color: st.color ?? 0x2f6fd0 });
    if (!car) return;
    // unique label so the HUD names the stolen car
    car.spec = Object.assign({}, car.spec, { label: 'AZUL SPORT' });
    car.missionCar = true;
    car.damage = 0;
    this.missionCar = car;
  }

  removeCar(car) {
    const i = this.deps.traffic?.cars.indexOf(car) ?? -1;
    if (i >= 0) this.deps.traffic.cars.splice(i, 1);
    this.scene.remove(car.group);
  }

  spawnRunner(st) {
    const body = makeCitizen(RUNNER_LOOK);
    body.group.position.set(st.x, 0.05, st.z);
    this.scene.add(body.group);
    const ped = {
      body, group: body.group, position: body.group.position,
      yaw: 0, phase: 0, speed: 6.4, state: 'thug', timer: 0,
      corner: 0, dir: 1, block: this.data.blocks[0],
      target: new THREE.Vector3(st.x, 0.05, st.z),
      health: 55, panicDir: new THREE.Vector3(), thug: true, runner: true,
    };
    this.deps.peds.peds.push(ped);
    this.actors.push(ped);
    this.runner = ped;
  }

  spawnThugs(st) {
    const n = st.count || 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.6;
      const r = st.type === 'fight' && st.count >= 4 ? 9 + (i % 2) * 5 : 7;
      const x = st.x + Math.cos(a) * r;
      const z = st.z + Math.sin(a) * r;
      const body = makeCitizen(THUG_LOOK);
      body.group.position.set(x, 0.05, z);
      this.scene.add(body.group);
      const ped = {
        body, group: body.group, position: body.group.position,
        yaw: 0, phase: Math.random() * 6, speed: 2.6, state: 'thug', timer: 0,
        corner: 0, dir: 1, block: this.data.blocks[0],
        target: new THREE.Vector3(x, 0.05, z),
        health: 70, panicDir: new THREE.Vector3(), thug: true,
        cooldown: 1.2 + Math.random() * 1.4,
      };
      this.deps.peds.peds.push(ped);
      this.actors.push(ped);
    }
  }

  /** Drop every mission actor. `full` also removes the job car (stage hand-offs keep it). */
  clearActors(full = false) {
    const peds = this.deps.peds;
    for (const a of this.actors) {
      const i = peds.peds.indexOf(a);
      if (i >= 0) peds.peds.splice(i, 1);
      this.scene.remove(a.group);
    }
    this.actors.length = 0;
    this.runner = null;
    if (full && this.missionCar) {
      if (this.deps.driving?.car === this.missionCar) this.deps.driving.exit();
      this.removeCar(this.missionCar);
      this.missionCar = null;
    }
  }

  /* ================================================================== frame */

  update(dt, ctx = {}) {
    this.animateBeacon(dt);
    this.updateDialog(dt);
    this.updateBanner(dt);

    if (this.autoStartTimer > 0) {
      this.autoStartTimer -= dt;
      if (this.autoStartTimer <= 0) {
        this.autoStartTimer = -1;
        const next = this.nextMission();
        if (next) this.start(next.id);
      }
    }

    if (!this.active) {
      this.updatePanel(false);
      return;
    }

    const player = this.deps.player;
    this.elapsed += dt;
    const def = this.def;
    const st = def.stages[this.stageIndex];

    // time limit
    const remaining = def.timeLimit - this.elapsed;
    if (remaining <= 0) {
      this.fail('TIME');
      return;
    }
    if (remaining < 20 && !this._timeWarned) {
      this._timeWarned = true;
      this.deps.toast?.('TIME RUNNING OUT');
      this.deps.audio?.horn?.(0.3, 1.3);
    }

    const px = player.position.x;
    const pz = player.position.z;

    if (st.type === 'goto') {
      if (Math.hypot(px - st.x, pz - st.z) < st.radius) this.completeStage();

    } else if (st.type === 'wait') {
      const inside = Math.hypot(px - st.x, pz - st.z) < st.radius;
      if (inside) {
        this.stageTime += dt;
        this.ring.scale.setScalar(1 + 0.12 * Math.sin(this.stageTime * 8));
        if (this.stageTime >= st.seconds) this.completeStage();
      } else {
        this.stageTime = Math.max(0, this.stageTime - dt * 1.5);
        this.ring.scale.setScalar(1);
      }

    } else if (st.type === 'steal') {
      if (this.missionCar && this.deps.driving?.car === this.missionCar) {
        this.deps.toast?.('CAR STOLEN — GO');
        this.completeStage();
      }

    } else if (st.type === 'deliver') {
      const inCar = this.missionCar && this.deps.driving?.car === this.missionCar;
      if (inCar && Math.hypot(px - st.x, pz - st.z) < st.radius) {
        this.completeStage();
      } else if (!inCar && Math.hypot(px - st.x, pz - st.z) < st.radius) {
        if (!this._needCarWarn) {
          this._needCarWarn = true;
          this.deps.toast?.('GET BACK IN THE AZUL SPORT');
        }
      }

    } else if (st.type === 'chase') {
      const r = this.runner;
      if (r) {
        this.updateRunner(r, dt, player);
        this.setMarker(r.position.x, r.position.z);
        const d = Math.hypot(px - r.position.x, pz - r.position.z);
        if (r.state === 'down' || d < 4.2) {
          this.deps.toast?.(r.state === 'down' ? 'TITO IS DOWN' : 'TITO CAUGHT');
          this.completeStage();
        }
      }

    } else if (st.type === 'fight') {
      this.updateThugs(dt, player);
      const alive = this.actors.filter((a) => !a.missionCar && a.state !== 'down');
      if (alive.length === 0 && this.actors.length > 0) this.completeStage();
    }

    // objective distance text is assembled by main.js from this.objective + objectiveText
    this.updatePanel(true, remaining);
  }

  updateRunner(r, dt, player) {
    if (r.state === 'down') return;
    if (r.state === 'panic') r.state = 'thug';
    const dx = r.position.x - player.position.x;
    const dz = r.position.z - player.position.z;
    const d = Math.hypot(dx, dz);
    const away = Math.atan2(dx, dz);
    r.yaw = away + Math.sin(performance.now() * 0.002) * 0.25;
    const speed = d < 45 ? 6.4 : 2.0;
    let nx = r.position.x + Math.sin(r.yaw) * speed * dt;
    let nz = r.position.z + Math.cos(r.yaw) * speed * dt;
    if (this.blocked(nx, nz)) {
      // slide along the wall
      r.yaw += 1.1;
      nx = r.position.x + Math.sin(r.yaw) * speed * dt;
      nz = r.position.z + Math.cos(r.yaw) * speed * dt;
      if (this.blocked(nx, nz)) return;
    }
    const lim = CITY.bound + 20;
    r.position.x = THREE.MathUtils.clamp(nx, -lim, lim);
    r.position.z = THREE.MathUtils.clamp(nz, -lim, CITY.waterZ - 10);
    r.group.rotation.y = r.yaw;
    r.phase += dt * speed * 2.4;
    const swing = Math.min(1, speed / 5) * 0.9;
    r.body.legs[0].rotation.x = Math.sin(r.phase) * swing;
    r.body.legs[1].rotation.x = -Math.sin(r.phase) * swing;
    r.body.arms[0].rotation.x = -1.3 + Math.sin(r.phase * 1.3) * 0.2;
    r.body.arms[1].rotation.x = -1.1 - Math.sin(r.phase * 1.3) * 0.2;
  }

  updateThugs(dt, player) {
    for (const t of this.actors) {
      if (t.missionCar || t.state === 'down') continue;
      if (t.state === 'panic') t.state = 'thug';
      const dx = player.position.x - t.position.x;
      const dz = player.position.z - t.position.z;
      const d = Math.hypot(dx, dz);
      t.yaw = Math.atan2(dx, dz);

      // hold distance and strafe a little; close in when far
      let speed = 0;
      if (d > 34) speed = 3.4;
      else if (d > 15) speed = 2.4;
      else if (d < 7) speed = -1.6;      // step back
      if (speed !== 0) {
        let nx = t.position.x + Math.sin(t.yaw) * speed * dt;
        let nz = t.position.z + Math.cos(t.yaw) * speed * dt;
        if (!this.blocked(nx, nz)) {
          t.position.x = nx;
          t.position.z = nz;
        }
      }
      t.phase += dt * (Math.abs(speed) * 2.6 + 1.2);
      const swing = speed !== 0 ? 0.55 : 0;
      t.body.legs[0].rotation.x = Math.sin(t.phase) * swing;
      t.body.legs[1].rotation.x = -Math.sin(t.phase) * swing;
      t.body.arms[1].rotation.x = -1.45;
      t.body.arms[0].rotation.x = -0.35;
      t.group.rotation.y = t.yaw;

      t.cooldown -= dt;
      if (d < 30 && t.cooldown <= 0) {
        t.cooldown = 1.5 + Math.random() * 1.5;
        this.deps.combat?.takeFire(t.position, 5);
        if (this.deps.audio) this.deps.audio.gunshot?.(0.35);
      }
    }
  }

  blocked(x, z) {
    const cols = this.data.colliders || [];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (x > c.x0 - 0.6 && x < c.x1 + 0.6 && z > c.z0 - 0.6 && z < c.z1 + 0.6) return true;
    }
    return false;
  }

  /* ================================================================== beacon */

  setMarker(x, z) {
    this.objective.x = x;
    this.objective.z = z;
    this.marker.position.set(x, 0.02, z);
    this.markerActive = true;
    this.marker.visible = true;
  }

  hideMarker() {
    this.markerActive = false;
    this.marker.visible = false;
  }

  animateBeacon(dt) {
    if (!this.markerActive) { this.marker.visible = false; return; }
    const t = performance.now() * 0.001;
    this.ring.rotation.z += dt * 1.3;
    this.ring2.rotation.z -= dt * 1.8;
    this.ring2.position.y = 6.5 + Math.sin(t * 1.6) * 1.6;
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);
    this.column.material.opacity = 0.10 + pulse * 0.12;
    this.column.scale.set(1 + pulse * 0.1, 1, 1 + pulse * 0.1);
    this.core.material.opacity = 0.30 + pulse * 0.22;
    this.ring.material.opacity = 0.55 + pulse * 0.4;
    const d = Math.hypot(this.deps.player.position.x - this.objective.x, this.deps.player.position.z - this.objective.z);
    this.marker.visible = d < 1400;
  }

  /* ================================================================== UI */

  banner(kicker, title, sub, dur = 3.6) {
    const el = this.el.banner;
    if (!el) return;
    if (this.el.bKicker) this.el.bKicker.textContent = kicker;
    if (this.el.bTitle) this.el.bTitle.textContent = title;
    if (this.el.bSub) this.el.bSub.textContent = sub || '';
    el.classList.add('show');
    this.bannerTimer = dur;
  }

  updateBanner(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner?.classList.remove('show');
    }
  }

  say(lines) {
    this.dialogQueue.push(...lines);
  }

  updateDialog(dt) {
    if (this.dialogLine) {
      this.dialogTimer -= dt;
      if (this.dialogTimer <= 0) {
        this.dialogLine = null;
        this.hideSubtitle();
      }
      return;
    }
    if (this.dialogQueue.length === 0) return;
    const line = this.dialogQueue.shift();
    this.dialogLine = line;
    this.dialogTimer = line.hold || 3.8;
    if (this.el.sub && this.el.subWho && this.el.subText) {
      this.el.subWho.textContent = line.who;
      this.el.subWho.style.color = line.who === 'NICO' ? '#ffe0b0'
        : line.who === 'RICO' ? '#ff9d63' : '#8fd0ff';
      this.el.subText.textContent = line.text;
      this.el.sub.classList.add('show');
    }
  }

  hideSubtitle() {
    this.el.sub?.classList.remove('show');
    this.dialogLine = null;
  }

  updatePanel(visible, remaining) {
    const el = this.el;
    if (!el.panel) return;
    if (!visible || !this.def) { el.panel.classList.add('hidden'); return; }
    el.panel.classList.remove('hidden');
    const def = this.def;
    const st = def.stages[this.stageIndex];
    if (el.title && el.title.textContent !== def.title) el.title.textContent = def.title;
    if (el.tag && el.tag.textContent !== def.tag) el.tag.textContent = def.tag;
    if (el.reward) el.reward.textContent = `$${def.reward.toLocaleString('en-US')}`;
    const obj = this.objectiveLabel();
    if (el.objective && el.objective.textContent !== obj) el.objective.textContent = obj;
    const left = Math.max(0, Math.round(remaining ?? (def.timeLimit - this.elapsed)));
    const tt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (el.timer && el.timer.textContent !== tt) {
      el.timer.textContent = tt;
      el.timer.classList.toggle('low', left < 30);
    }
    if (el.bar) {
      const p = st.type === 'wait'
        ? Math.min(1, this.stageTime / st.seconds)
        : 1 - left / def.timeLimit;
      el.bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
    }
    void st;
  }

  objectiveLabel() {
    if (!this.def) return '';
    const st = this.def.stages[this.stageIndex];
    const p = this.deps.player.position;
    const d = Math.round(Math.hypot(p.x - this.objective.x, p.z - this.objective.z));
    let text = st.label;
    if (st.type === 'wait') text += ` — HOLD ${Math.max(0, st.seconds - this.stageTime).toFixed(1)}s`;
    if (st.type === 'fight') {
      const alive = this.actors.filter((a) => !a.missionCar && a.state !== 'down').length;
      text += ` — ${alive} LEFT`;
    }
    return `${text}  ${d}m`;
  }
}
