// Procedural audio: everything is synthesised with WebAudio oscillators, filters and noise —
// no audio files. An engine drone that follows the car, a pistol crack, horns, footsteps, and a
// soft four-chord pad loop for the sunset mood. start() must be called from a user gesture.

const CHORDS = [
  [220.0, 277.18, 329.63],   // A minor
  [174.61, 220.0, 261.63],   // F major
  [196.0, 246.94, 293.66],   // G major
  [164.81, 207.65, 246.94],  // E minor
];

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.master = null;
    this.engine = null;
    this.noiseBuffer = null;
    this.stepTimer = 0;
    this.musicTimer = 0;
    this.chordIndex = 0;
    this.musicGain = null;
    this.hornCooldown = 0;
  }

  start() {
    if (this.started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // shared noise buffer for gunshots / footsteps / siren texture
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.5;
    }
    this.noiseBuffer = buf;

    this._buildEngine();
    this._buildMusic();
    this.started = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  _buildEngine() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 3;

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 52;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 78;
    const gainB = ctx.createGain();
    gainB.gain.value = 0.35;

    oscA.connect(filter);
    oscB.connect(gainB).connect(filter);
    filter.connect(gain).connect(this.master);
    oscA.start();
    oscB.start();

    this.engine = { oscA, oscB, gain, filter };
  }

  _buildMusic() {
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.16;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    bus.connect(filter).connect(this.master);
    this.musicGain = bus;

    // a slow tremolo on the pad keeps it from sounding like a test tone
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    this._playChord(0);
  }

  _playChord(index) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const now = ctx.currentTime;
    const notes = CHORDS[index % CHORDS.length];
    for (const freq of notes) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.09, now + 2.4);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 9.4);
        osc.connect(g).connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 9.6);
      }
    }
    this.chordIndex = (index + 1) % CHORDS.length;
  }

  /* ------------------------------------------------------------ one-shots */

  _noise(duration = 0.25, gain = 0.5, freq = 1800, type = 'lowpass') {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  gunshot(volume = 1) {
    if (!this.started) return;
    const ctx = this.ctx;
    this._noise(0.22, 0.55 * volume, 2600);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const g = ctx.createGain();
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.16);
    g.gain.setValueAtTime(0.42 * volume, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  horn(volume = 0.5, pitch = 1) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.16 * volume, now + 0.02);
    g.gain.setValueAtTime(0.16 * volume, now + 0.26);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    for (const f of [392, 466]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f * pitch;
      osc.connect(g);
      osc.start(now);
      osc.stop(now + 0.45);
    }
    g.connect(this.master);
  }

  footstep(volume = 0.4) {
    if (!this.started) return;
    this._noise(0.06, 0.13 * volume, 900, 'bandpass');
  }

  impact(volume = 0.6) {
    if (!this.started) return;
    this._noise(0.3, 0.4 * volume, 400);
  }

  siren(volume = 0.35) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.linearRampToValueAtTime(980, now + 0.42);
    osc.frequency.linearRampToValueAtTime(680, now + 0.84);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.10 * volume, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.86);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.9);
  }

  /* ------------------------------------------------------------ per frame */

  update(dt, s = {}) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // engine follows the driven car, purrs quietly when idle
    const speed = Math.max(0, s.speed || 0);
    const driving = !!s.driving;
    const targetGain = driving ? 0.16 + Math.min(0.12, speed * 0.004) : 0.0;
    const targetFreq = 48 + speed * 3.1 + (s.throttle ? 12 : 0);
    this.engine.gain.gain.setTargetAtTime(targetGain, now, 0.12);
    this.engine.oscA.frequency.setTargetAtTime(targetFreq, now, 0.08);
    this.engine.oscB.frequency.setTargetAtTime(targetFreq * 1.51, now, 0.08);
    this.engine.filter.frequency.setTargetAtTime(320 + speed * 26, now, 0.1);

    // pad chord changes
    this.musicTimer += dt;
    if (this.musicTimer > 8) {
      this.musicTimer = 0;
      this._playChord(this.chordIndex);
    }
    if (this.musicGain) {
      const target = driving ? 0.1 : 0.16;
      this.musicGain.gain.setTargetAtTime(target, now, 1.2);
    }

    if (this.hornCooldown > 0) this.hornCooldown -= dt;
  }
}
