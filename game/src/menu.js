// Menus and the save file: the pause card (Resume / Controls / Missions / Restart), the game-over
// card (Retry / Free roam), and localStorage persistence of position, cash, jobs and wanted level.

export const SAVE_KEY = 'sunsetcity.save.v1';

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || typeof s.money !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, ...data }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}

export function hasSave() {
  return !!readSave();
}

export class PauseMenu {
  constructor(doc, handlers) {
    this.doc = doc;
    this.h = handlers;
    this.open = false;
    this.el = {
      root: doc.getElementById('pause'),
      resume: doc.getElementById('btnresume'),
      controls: doc.getElementById('btncontrols'),
      missionsBtn: doc.getElementById('btnmissions'),
      restart: doc.getElementById('btnrestart'),
      controlsBox: doc.getElementById('pausecontrols'),
      missionsBox: doc.getElementById('pausemissions'),
      list: doc.getElementById('pmlist'),
      stats: doc.getElementById('pauseStats'),
    };

    this.el.resume?.addEventListener('click', () => this.h.onResume?.());
    this.el.controls?.addEventListener('click', () => this.toggleSection('controls'));
    this.el.missionsBtn?.addEventListener('click', () => {
      this.renderMissions();
      this.toggleSection('missions');
    });
    this.el.restart?.addEventListener('click', () => this.h.onRestart?.());
  }

  toggleSection(which) {
    const other = which === 'controls' ? this.el.missionsBox : this.el.controlsBox;
    const box = which === 'controls' ? this.el.controlsBox : this.el.missionsBox;
    const show = box && !box.classList.contains('show');
    other?.classList.remove('show');
    box?.classList.toggle('show', !!show);
  }

  show(stats) {
    this.open = true;
    this.el.root?.classList.add('show');
    this.el.controlsBox?.classList.remove('show');
    this.el.missionsBox?.classList.remove('show');
    if (this.el.stats) this.el.stats.textContent = stats || '';
  }

  hide() {
    this.open = false;
    this.el.root?.classList.remove('show');
  }

  renderMissions() {
    const list = this.el.list;
    const missions = this.h.missions;
    if (!list || !missions) return;
    list.innerHTML = '';
    for (let i = 0; i < missions.defs.length; i++) {
      const def = missions.defs[i];
      const done = missions.completed(def.id);
      const active = missions.progress.active === def.id;
      const unlocked = missions.unlocked(def.id);
      const row = this.doc.createElement('button');
      row.className = 'pmrow' + (done ? ' done' : '') + (active ? ' active' : '') + (!unlocked ? ' locked' : '');
      row.disabled = !unlocked;
      const state = done ? 'DONE' : active ? 'ACTIVE' : unlocked ? 'START' : 'LOCKED';
      row.innerHTML = `<span class="pmnum">${String(i + 1).padStart(2, '0')}</span>`
        + `<span class="pmname">${def.title}<i>${def.tag} · $${def.reward}</i></span>`
        + `<span class="pmstate">${state}</span>`;
      if (unlocked && !active) row.addEventListener('click', () => this.h.onStartMission?.(def.id));
      list.appendChild(row);
    }
  }
}

export class GameOverScreen {
  constructor(doc, handlers) {
    this.doc = doc;
    this.h = handlers;
    this.open = false;
    this.el = {
      root: doc.getElementById('gameover'),
      kicker: doc.getElementById('gokicker'),
      title: doc.getElementById('gotitle'),
      sub: doc.getElementById('gosub'),
      retry: doc.getElementById('goretry'),
      roam: doc.getElementById('goroam'),
    };
    this.el.retry?.addEventListener('click', () => this.h.onRetry?.());
    this.el.roam?.addEventListener('click', () => this.h.onRoam?.());
  }

  show({ kicker = 'SUNSET CITY', title = 'WASTED', sub = '', retryLabel = 'RETRY', roamLabel = 'FREE ROAM', roam = true }) {
    this.open = true;
    if (this.el.kicker) this.el.kicker.textContent = kicker;
    if (this.el.title) this.el.title.textContent = title;
    if (this.el.sub) this.el.sub.textContent = sub;
    if (this.el.retry) this.el.retry.textContent = retryLabel;
    if (this.el.roam) {
      this.el.roam.textContent = roamLabel;
      this.el.roam.style.display = roam ? '' : 'none';
    }
    this.el.root?.classList.add('show');
  }

  hide() {
    this.open = false;
    this.el.root?.classList.remove('show');
  }
}
