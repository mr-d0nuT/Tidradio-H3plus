// Web Audio API Synthesizer for Realistic Radio Tactical Audio & Feedback

class RadioAudioEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private volume: number = 0.6;

  // DTMF standard frequencies
  private dtmfFreqs: { [key: string]: [number, number] } = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], 'A': [697, 1633],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477], 'B': [770, 1633],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], 'C': [852, 1633],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477], 'D': [941, 1633]
  };

  constructor() {}

  private initCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public getVolume(): number {
    return this.volume;
  }

  // Keypad Beep (Standard tone)
  public playKeyBeep(freq = 1050, duration = 0.045) {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const gainVal = 0.12 * this.volume;
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }

  // Rotary Encoder Dial Click (High tech tactile tick)
  public playRotaryTick(up = true) {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(up ? 1400 : 900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(up ? 2200 : 500, ctx.currentTime + 0.015);

      const gainVal = 0.08 * this.volume;
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.02);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.02);
    } catch {}
  }

  // DTMF Dual Tone Multi-Frequency Tone
  public playDtmf(key: string, duration = 0.09) {
    if (!this.soundEnabled || this.volume <= 0) return;
    const freqs = this.dtmfFreqs[key.toUpperCase()];
    if (!freqs) {
      this.playKeyBeep(1000, duration);
      return;
    }

    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const now = ctx.currentTime;
      const [f1, f2] = freqs;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(f1, now);
      osc2.frequency.setValueAtTime(f2, now);

      const gainVal = 0.09 * this.volume;
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
    } catch {}
  }

  // Roger Beep (Two-tone radio acknowledgment: 1200 Hz -> 900 Hz)
  public playRogerBeep() {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.setValueAtTime(900, now + 0.08);

      const gainVal = 0.14 * this.volume;
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.setValueAtTime(gainVal, now + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch {}
  }

  // PTT Start Click / Chirp
  public playPttStart() {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(850, now + 0.05);

      const gainVal = 0.08 * this.volume;
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {}
  }

  // Tactical Squelch Noise Burst (Realistic analog FM static burst on reception)
  public playSquelchTail(duration = 0.12) {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      // Bandpass filter to make it sound like real RF white noise
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 1.2;

      const gain = ctx.createGain();
      const gainVal = 0.1 * this.volume;
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      whiteNoise.start();
    } catch {}
  }

  // Connect Success Chime (3 ascending notes)
  public playConnectSuccess() {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const notes = [587.33, 739.99, 880.00]; // D5, F#5, A5
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + idx * 0.07;
        const dur = 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.12 * this.volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + dur);
      });
    } catch {}
  }

  // Error / Deny Tone (Double low buzz)
  public playErrorTone() {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);

      const gainVal = 0.14 * this.volume;
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.setValueAtTime(0.01, now + 0.06);
      gain.gain.setValueAtTime(gainVal, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch {}
  }
}

export const radioAudio = new RadioAudioEngine();
