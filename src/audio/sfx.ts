// Sonidos sintetizados (#53): nada de archivos, todo con WebAudio (ruido filtrado y osciladores),
// al estilo de Señorío. El contexto se crea con el primer gesto del jugador (lo exigen los navegadores).

export type Sfx = "rifle" | "pesado" | "plasma" | "acido" | "golpe" | "garra" | "impacto" | "baja" | "dados" | "carga" | "turno" | "clic" | "pv" | "granada" | "trueno";

const KEY = "mesa-de-guerra.sonido";

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  on = (() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } })();
  volume = 0.55;

  constructor() {
    const start = () => { this.ensure(); window.removeEventListener("pointerdown", start); window.removeEventListener("keydown", start); };
    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", start);
      window.addEventListener("keydown", start);
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.on ? this.volume : 0;
  }

  setOn(v: boolean) {
    this.on = v;
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* nada */ }
    if (this.master) this.master.gain.value = v ? this.volume : 0;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const C = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.ctx = new C();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? this.volume : 0;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
    return this.ctx;
  }

  /** Ráfaga de ruido filtrado con envolvente. */
  private burst(at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = "bandpass", sweepTo?: number) {
    const c = this.ctx!, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise;
    f.type = type; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(at, Math.random() * 0.5, dur + 0.05);
  }

  /** Tono con caída de frecuencia. */
  private tone(at: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = "sine") {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** Reproduce un sonido (`n` repeticiones escalonadas para ráfagas). */
  play(kind: Sfx, n = 1, delay = 0) {
    if (!this.on) return;
    const c = this.ensure();
    if (!c || !this.master) return;
    const t0 = c.currentTime + delay;
    const reps = Math.min(n, 12);
    for (let i = 0; i < reps; i++) {
      const at = t0 + i * (kind === "rifle" ? 0.07 : kind === "acido" ? 0.09 : 0.11) + Math.random() * 0.02;
      switch (kind) {
        case "rifle": this.burst(at, 0.09, 1800, 0.9, 0.5); this.tone(at, 0.08, 220, 70, 0.25, "square"); break;
        case "pesado": this.burst(at, 0.22, 600, 0.7, 0.8, "lowpass"); this.tone(at, 0.25, 120, 40, 0.5); break;
        case "plasma": this.tone(at, 0.25, 1400, 180, 0.25, "sawtooth"); this.burst(at, 0.15, 3000, 2, 0.2); break;
        case "acido": this.burst(at, 0.2, 900, 3, 0.45, "bandpass", 300); break;
        case "golpe": this.burst(at, 0.08, 400, 1, 0.6, "lowpass"); this.tone(at, 0.1, 160, 60, 0.35); break;
        case "garra": this.burst(at, 0.1, 2500, 1.5, 0.35, "highpass", 1200); break;
        case "impacto": this.burst(at, 0.06, 1200, 1, 0.3); break;
        case "baja": this.tone(at, 0.35, 140, 45, 0.35, "triangle"); this.burst(at, 0.3, 250, 0.8, 0.3, "lowpass"); break;
        case "dados": for (let k = 0; k < 5; k++) this.burst(at + k * 0.045 + Math.random() * 0.02, 0.025, 3500 + Math.random() * 2000, 4, 0.18); break;
        case "carga": this.burst(at, 0.5, 300, 0.6, 0.4, "bandpass", 1500); break;
        case "turno": this.tone(at, 0.25, 523, 523, 0.18, "triangle"); this.tone(at + 0.16, 0.35, 784, 784, 0.18, "triangle"); break;
        case "clic": this.tone(at, 0.04, 1200, 900, 0.08, "square"); break;
        case "pv": this.tone(at, 0.2, 659, 659, 0.16, "sine"); this.tone(at + 0.12, 0.3, 988, 988, 0.16, "sine"); break;
        case "trueno": this.burst(at, 0.25, 1800, 0.6, 0.35, "lowpass", 400); this.burst(at + 0.15, 2.4, 260, 0.5, 0.7, "lowpass", 60); this.tone(at + 0.1, 2, 70, 28, 0.35); break;
        case "granada": this.burst(at, 0.45, 500, 0.5, 0.9, "lowpass", 80); this.tone(at, 0.4, 90, 30, 0.6); break;
      }
    }
  }
}

export const sfx = new Audio();

/** Sonido de un arma según su nombre (aproximado, para no tener que etiquetarlas todas). */
export function weaponSound(weaponId: string, melee: boolean, faction: "legion" | "swarm"): Sfx {
  if (melee) return faction === "swarm" ? "garra" : "golpe";
  if (weaponId === "granadas") return "granada";
  if (/plasma|rayoMental|gritoPsiquico/i.test(weaponId)) return "plasma";
  if (/pesad|canon|cañon|Pesado/i.test(weaponId)) return "pesado";
  if (faction === "swarm") return "acido";
  return "rifle";
}
