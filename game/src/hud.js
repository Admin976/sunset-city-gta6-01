// HUD: writes the DOM every frame, but only when a value actually changed — no layout churn.
import { TIME } from './config.js';

export class HUD {
  constructor(doc = document) {
    this.el = {
      health: doc.getElementById('healthbar'),
      money: doc.getElementById('money'),
      moneyFlash: doc.getElementById('moneyflash'),
      clock: doc.getElementById('clock'),
      phase: doc.getElementById('dayphase'),
      district: doc.getElementById('district'),
      wanted: doc.getElementById('wanted'),
      speed: doc.getElementById('speed'),
      speedFill: doc.getElementById('speedfill'),
      hint: doc.getElementById('hint'),
      coords: doc.getElementById('minimapcoords'),
    };
    this.stars = Array.from(this.el.wanted?.children ?? []);
    this.last = {};
    this.districtName = null;
    this.districtTimer = 0;
    this.flashTimer = 0;
    this.hintTimer = 0;
  }

  /** Time-of-day label for the clock widget. */
  static phaseFor(minutes) {
    if (minutes < TIME.dayStart) return 'NIGHT';
    if (minutes < 7 * 60) return 'DAWN';
    if (minutes < 11 * 60) return 'MORNING';
    if (minutes < 15 * 60) return 'AFTERNOON';
    if (minutes < 18 * 60 + 20) return 'GOLDEN HOUR';
    if (minutes < TIME.nightStart) return 'DUSK';
    return 'NIGHT';
  }

  static clockText(minutes) {
    const m = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = Math.floor(m % 60);
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  update(dt, state) {
    // health
    const hp = Math.round(state.health);
    if (hp !== this.last.hp) {
      this.last.hp = hp;
      this.el.health.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    }

    // money
    const money = Math.max(0, Math.round(state.money));
    if (money !== this.last.money) {
      if (this.last.money !== undefined && money > this.last.money) {
        this.el.moneyFlash.textContent = `+$${money - this.last.money}`;
        this.el.moneyFlash.style.opacity = '1';
        this.flashTimer = 1.1;
      }
      this.last.money = money;
      this.el.money.textContent = `$ ${money.toLocaleString('en-US')}`;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.el.moneyFlash.style.opacity = '0';
    }

    // in-game clock
    const clock = HUD.clockText(state.minutes);
    if (clock !== this.last.clock) {
      this.last.clock = clock;
      this.el.clock.textContent = clock;
      this.el.phase.textContent = HUD.phaseFor(state.minutes);
    }

    // district banner: fade out, swap, fade back in
    if (state.district !== this.districtName) {
      if (this.districtName === null) {
        this.districtName = state.district;
        this.el.district.textContent = state.district;
      } else {
        this.districtName = state.district;
        this.districtTimer = 0.55;
        this.el.district.style.opacity = '0';
      }
    }
    if (this.districtTimer > 0) {
      this.districtTimer -= dt;
      if (this.districtTimer <= 0) {
        this.el.district.textContent = this.districtName;
        this.el.district.style.opacity = '1';
      }
    }

    // wanted stars
    if (state.wanted !== this.last.wanted) {
      this.last.wanted = state.wanted;
      for (let i = 0; i < this.stars.length; i++) {
        this.stars[i].classList.toggle('on', i < state.wanted);
      }
    }

    // speedometer
    const kmh = Math.round(Math.hypot(state.velocity.x, state.velocity.z) * 3.6);
    if (kmh !== this.last.kmh) {
      this.last.kmh = kmh;
      this.el.speed.textContent = String(kmh);
      this.el.speedFill.style.width = `${Math.min(100, (kmh / 45) * 100)}%`;
    }

    // the control hint fades after a few seconds of play
    if (this.hintTimer < 9) {
      this.hintTimer += dt;
      if (this.hintTimer >= 9 && this.el.hint) this.el.hint.style.opacity = '0';
    }
  }

  setDistrictNow(name) {
    this.districtName = name;
    this.el.district.textContent = name;
    this.el.district.style.opacity = '1';
  }

  setLoading(text) {
    const el = document.getElementById('loading');
    if (el) el.textContent = text;
  }
}
