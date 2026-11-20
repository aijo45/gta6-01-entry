// Synthesized sound only: every effect is built with WebAudio oscillators and
// filtered noise. No audio files, no network. Created on the first user gesture.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
  }

  /** Create the context (must run from a user gesture). Safe to call repeatedly. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine hum: a sawtooth through a low-pass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Police siren: a square wave that alternates two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** Engine hum level and pitch from the car's speed (0..1). */
  setEngine(speedRatio, driving) {
    if (!this.ctx) return;
    const target = driving ? 0.05 + speedRatio * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(46 + speedRatio * 110, this.ctx.currentTime, 0.1);
  }

  /** Siren on while police are near; it wails between two tones. */
  setSiren(on, time) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.2);
    if (on) {
      const phase = Math.floor(time * 1.6) % 2;
      this.sirenOsc.frequency.setTargetAtTime(phase === 0 ? 720 : 960, this.ctx.currentTime, 0.05);
    }
  }

  blip(freq, dur, type = 'sine', vol = 0.16) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  noiseBurst(dur, vol = 0.25, lowpass = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.14, 0.3, 2400); }
  punch() { this.noiseBurst(0.1, 0.22, 500); }
  crash() { this.noiseBurst(0.22, 0.3, 800); }
  pickup() { this.blip(880, 0.09); setTimeout(() => this.blip(1320, 0.12), 70); }
  click() { this.blip(660, 0.05, 'square', 0.08); }
  cash() {
    this.blip(1046, 0.09);
    setTimeout(() => this.blip(1318, 0.09), 80);
    setTimeout(() => this.blip(1568, 0.16), 160);
  }
  wanted() { this.blip(220, 0.18, 'square', 0.12); setTimeout(() => this.blip(180, 0.22, 'square', 0.12), 140); }
}
