/** Ambiente procedural con Web Audio: oleaje, espuma y pájaros. Sin archivos de audio. Arranca con el primer gesto del usuario. */
export class Ambience {
  private ac: AudioContext | null = null;
  private master!: GainNode;
  private birdBus!: GainNode;
  private wave!: GainNode;
  private foam!: GainNode;
  muted = false;
  private night = 0;
  private volume = 0.75;
  private timers: number[] = [];

  /** Debe llamarse dentro de un gesto del usuario (clic, tecla). */
  start() {
    if (this.ac) { void this.ac.resume(); return; }
    try {
      const ac = new AudioContext();
      this.ac = ac;
      this.master = ac.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(ac.destination);
      this.birdBus = ac.createGain(); this.birdBus.connect(this.master);
      const len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const noise = (type: BiquadFilterType, f: number, q: number, g: number) => {
        const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
        const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        const gn = ac.createGain(); gn.gain.value = g; s.connect(fl).connect(gn).connect(this.master); s.start(); return gn;
      };
      this.wave = noise('lowpass', 480, 0.5, 0.1);
      this.foam = noise('bandpass', 2600, 0.6, 0.02);
      noise('bandpass', 380, 0.8, 0.04);
      this.scheduleWave();
      this.scheduleBird();
    } catch { this.ac = null; }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ac) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ac.currentTime, 0.1);
  }

  /** 0–8 */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(8, v)) / 8 * 1.1;
    if (this.ac && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.ac.currentTime, 0.1);
  }

  /** 0 de día → 1 de noche: de noche hay menos pájaros. */
  setNight(n: number) { this.night = n; }

  private scheduleWave() {
    const ac = this.ac; if (!ac) return;
    const t = ac.currentTime, up = 1.8 + Math.random() * 0.8, down = 3.5 + Math.random() * 1.5, peak = 0.5 + Math.random() * 0.35;
    for (const [g, hi, lo] of [[this.wave, peak * 0.9, 0.1], [this.foam, peak * 0.22, 0.01]] as [GainNode, number, number][]) {
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(hi, t + up); g.gain.linearRampToValueAtTime(lo, t + up + down);
    }
    this.timers.push(window.setTimeout(() => this.scheduleWave(), (up + down - 0.4) * 1000));
  }

  private scheduleBird() {
    const ac = this.ac; if (!ac) return;
    if (ac.state === 'running' && Math.random() > this.night * 0.9) (Math.random() < 0.65 ? this.chirp() : this.gull());
    this.timers.push(window.setTimeout(() => this.scheduleBird(), 2500 + Math.random() * 5000));
  }

  private pan(): AudioNode {
    const ac = this.ac!;
    if (!ac.createStereoPanner) return this.birdBus;
    const p = ac.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; p.connect(this.birdBus); return p;
  }

  private chirp() {
    const ac = this.ac!, out = this.pan(), t0 = ac.currentTime + 0.05, n = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1200;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.11, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.05); o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.1);
    }
  }

  private gull() {
    const ac = this.ac!, out = this.pan(), t0 = ac.currentTime + 0.05, n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.42, o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.34);
      lfo.frequency.value = 13; lg.gain.value = 55; lfo.connect(lg).connect(o.frequency);
      lp.type = 'lowpass'; lp.frequency.value = 2400;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 0.38); lfo.start(t); lfo.stop(t + 0.38);
    }
  }
}
