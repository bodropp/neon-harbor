// Neon Harbor — all sound is synthesized with WebAudio oscillators and noise.
// No audio files, no network. Everything is guarded so a missing audio context
// never breaks the game.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = false;
    this.musicTimer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenStep = 0;
    this.musicStep = 0;
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    } catch { /* ignore */ }
  }

  noise(dur, vol = 0.25, freq = 1200) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start(t0);
    } catch { /* ignore */ }
  }

  shoot() { this.noise(0.12, 0.35, 2600); this.tone(180, 0.08, 'square', 0.12, 60); }
  punch() { this.tone(110, 0.12, 'sine', 0.3, 45); this.noise(0.06, 0.15, 500); }
  crash() { this.noise(0.25, 0.4, 700); this.tone(70, 0.2, 'sine', 0.3, 35); }
  pickup() { this.tone(660, 0.1, 'sine', 0.18); this.tone(990, 0.16, 'sine', 0.18, null, 0.09); }
  click() { this.tone(440, 0.05, 'square', 0.08); }
  mission() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, null, i * 0.1));
  }
  bust() { this.tone(220, 0.5, 'sawtooth', 0.2, 110); this.tone(110, 0.7, 'sawtooth', 0.18, 55, 0.2); }
  reload() { this.tone(300, 0.05, 'square', 0.1); this.tone(380, 0.05, 'square', 0.1, null, 0.12); }

  /** Engine hum that follows the car's speed (0..1). Call every frame. */
  setEngine(speed01, driving) {
    if (!this.ctx || this.muted) { this.stopEngine(); return; }
    try {
      if (!driving || speed01 < 0.02) { this.stopEngine(); return; }
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.04;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 900;
        this.engineOsc.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master);
        this.engineOsc.start();
      }
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
      this.engineGain.gain.setTargetAtTime(0.03 + speed01 * 0.05, t, 0.1);
    } catch { /* ignore */ }
  }

  stopEngine() {
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch { /* already stopped */ }
      this.engineOsc = null; this.engineGain = null;
    }
  }

  /** Two-tone police siren. Call every frame with wanted > 0. */
  setSiren(on) {
    if (!this.ctx || this.muted) { this.stopSiren(); return; }
    try {
      if (!on) { this.stopSiren(); return; }
      if (!this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0.035;
        this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
        this.sirenOsc.start();
      }
      const t = this.ctx.currentTime;
      this.sirenStep += 1;
      if (this.sirenStep % 24 === 0) {
        const f = this.sirenOsc.frequency.value > 800 ? 660 : 920;
        this.sirenOsc.frequency.setTargetAtTime(f, t, 0.05);
      }
    } catch { /* ignore */ }
  }

  stopSiren() {
    if (this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null; this.sirenGain = null;
    }
  }

  /** A lazy sunset groove: bass line + soft hats, scheduled a bar ahead. */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const bass = [55, 0, 55, 65.4, 0, 49, 0, 58.3];
    const step = () => {
      if (!this.musicOn || !this.ctx || this.muted) return;
      const note = bass[this.musicStep % bass.length];
      if (note > 0) this.tone(note, 0.42, 'triangle', 0.11);
      if (this.musicStep % 2 === 0) this.noise(0.03, 0.03, 6000);
      this.musicStep += 1;
    };
    this.musicTimer = setInterval(step, 300);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
