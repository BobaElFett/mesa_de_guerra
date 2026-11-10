import type { Command, CommandBus } from "../core/commands";
import { PHASE_INFO } from "../rules/turn";

// Repetición de la partida (#61): vuelve al despliegue y rehace las órdenes una a una, al ritmo
// de cada una (los disparos esperan a su animación). La partida no cambia: al salir, el cursor
// vuelve al final.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Pausa tras cada orden, en segundos a velocidad 1×. */
function pause(c: Command): number {
  switch (c.type) {
    case "moveMany": case "arrive": return 0.7;
    case "shoot": case "fight": case "stratagem": return 0.5;
    case "charge": case "reactCharge": return 0.9;
    case "nextPhase": case "endTurn": return 0.6;
    case "roll": case "reroll": return 0.8;
    default: return 0.08;
  }
}

export class Replay {
  active = false;
  private playing = false;
  private speed = 1;
  private wait = 0;
  private start = 0;
  private end = 0;
  /** ¿Hay animaciones en curso (disparos)? Entonces se espera. */
  busy: () => boolean = () => false;
  /** Acaba las animaciones en curso (a 4× no se esperan). */
  skipFx: () => void = () => {};
  /** Para llevar la cámara a lo que pasa. */
  onCommand: (c: Command) => void = () => {};
  onExit: () => void = () => {};

  constructor(private bus: CommandBus) {
    $("replay").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      switch (b.dataset.r) {
        case "play": this.playing = !this.playing; if (this.playing && this.bus.length >= this.end) this.seek(this.start); this.paint(); break;
        case "start": this.seek(this.start); break;
        case "step": this.playing = false; this.step(); break;
        case "exit": this.exit(); break;
      }
    });
    $<HTMLSelectElement>("replay-speed").addEventListener("change", (e) => { this.speed = Number((e.target as HTMLSelectElement).value); });
    $<HTMLInputElement>("replay-pos").addEventListener("input", (e) => {
      this.playing = false;
      this.seek(this.start + Number((e.target as HTMLInputElement).value));
    });
  }

  /** ¿Se puede ver la repetición? Hace falta una partida con ejércitos y sin red. */
  available(): boolean {
    return !this.bus.remote && this.bus.commands.some((c) => c.type === "setArmies");
  }

  begin() {
    if (!this.available() || this.active) return;
    const cmds = this.bus.commands;
    let i = cmds.length - 1;
    while (i >= 0 && cmds[i].type !== "setArmies") i--;
    // Empieza justo tras preparar la partida (ejércitos y modo reglas)
    this.start = i + 1;
    while (this.start < cmds.length && cmds[this.start].type === "setRulesMode") this.start++;
    this.end = this.bus.length;
    this.active = true;
    this.playing = true;
    this.wait = 0.8;
    document.body.classList.add("replaying");
    $("replay").hidden = false;
    $<HTMLInputElement>("replay-pos").max = String(this.end - this.start);
    this.seek(this.start);
  }

  exit() {
    if (!this.active) return;
    this.playing = false;
    this.bus.seek(this.end);          // aún activa: el resumen final no vuelve a saltar
    this.active = false;
    $("replay").hidden = true;
    document.body.classList.remove("replaying");
    this.onExit();
  }

  togglePlay() { if (this.active) { this.playing = !this.playing; this.paint(); } }

  update(dt: number) {
    if (!this.active || !this.playing) return;
    if (this.busy()) { if (this.speed >= 4) this.skipFx(); else return; }
    this.wait -= dt;
    if (this.wait > 0) return;
    if (!this.step()) { this.playing = false; this.paint(); }
  }

  private step(): boolean {
    if (this.bus.length >= this.end) return false;
    const c = this.bus.stepForward();
    if (!c) return false;
    this.wait = pause(c) / this.speed;
    this.onCommand(c);
    this.paint();
    return true;
  }

  private seek(n: number) {
    this.bus.seek(Math.min(n, this.end));
    this.wait = 0.4;
    this.paint();
  }

  paint() {
    if (!this.active) return;
    const s = this.bus.state;
    const done = this.bus.length - this.start, all = this.end - this.start;
    $("replay-info").textContent = `Ronda ${s.turn} · ${PHASE_INFO[s.phase].name}`;
    $<HTMLInputElement>("replay-pos").value = String(done);
    $("replay-count").textContent = `${done}/${all}`;
    $("replay-play").textContent = this.playing ? "Pausa" : this.bus.length >= this.end ? "Otra vez" : "Seguir";
  }
}
