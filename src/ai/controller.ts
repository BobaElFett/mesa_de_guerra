import { aiDeploy } from "./deploy";
import { CommandBus } from "../core/commands";
import { Faction, GameState, PLAYERS } from "../core/state";
import { pendingChargers } from "../rules/melee";
import { aiLastAction, aiLastActor, aiPlayPhase, aiStep, aiWantsOverwatch, canFight, fightStep } from "./tactics";
import { AI_LEVEL_NAME, runtime, settings } from "./settings";

// Jugar contra la IA (#38): cuando le toca al bando de la IA, juega sus fases paso a paso,
// esperando a que acaben las animaciones de los dados. En combate, además, golpea con sus
// unidades cuando le toca en la alternancia (también en el turno del jugador).

const STEP_MS = 650;

export class AiController {
  get paused() { return runtime.aiPaused; }
  set paused(v: boolean) { runtime.aiPaused = v; }
  private wait = 0;
  onAction: (text: string) => void = () => {};
  /** La IA acaba de actuar con esta unidad (para llevar la cámara). */
  onFocus: (unit: string) => void = () => {};
  onStatus: (text: string | null) => void = () => {};

  constructor(private bus: CommandBus, private busy: () => boolean) {}

  get side(): Faction | null {
    if (runtime.online) return null;
    // Modo espectador (#67): la IA lleva siempre al bando activo
    return runtime.spectate ? PLAYERS[this.bus.state.active] : settings.aiSide;
  }

  /** ¿Le toca jugar a la IA ahora (y por tanto el jugador no debería tocar)? */
  isAiTurn(s: GameState = this.bus.state): boolean {
    return !!this.side && s.rulesMode && !s.gameOver && s.phase !== "despliegue" && PLAYERS[s.active] === this.side;
  }

  /** En combate: ¿le toca golpear a la IA según la alternancia? */
  private aiFightTurn(s: GameState): boolean {
    const ai = this.side!, human: Faction = ai === "legion" ? "swarm" : "legion";
    if (runtime.spectate) return canFight(s, "legion") || canFight(s, "swarm");
    if (!canFight(s, ai)) return false;
    const pending = pendingChargers(s);
    if (pending.length) return pending.some((u) => s.units.find((x) => x.id === u)?.faction === ai);
    const fought = s.turnLog.fought ?? [];
    const last = fought.length ? s.units.find((u) => u.id === fought[fought.length - 1])?.faction : undefined;
    return last !== ai || !canFight(s, human);
  }

  /** Espectador: quién golpea ahora (cargas pendientes primero; luego se alternan). */
  private fighter(s: GameState): Faction {
    const pending = pendingChargers(s);
    if (pending.length) return s.units.find((x) => x.id === pending[0])!.faction;
    const fought = s.turnLog.fought ?? [];
    const last = fought.length ? s.units.find((u) => u.id === fought[fought.length - 1])?.faction : undefined;
    const next: Faction = last === "legion" ? "swarm" : last === "swarm" ? "legion" : PLAYERS[s.active];
    return canFight(s, next) ? next : next === "legion" ? "swarm" : "legion";
  }

  /** Antes de que el jugador pase de fase: que la IA acabe sus combates pendientes. */
  flushFights() {
    const s = this.bus.state;
    if (!this.side || !s.rulesMode || s.phase !== "combate") return;
    for (let g = 0; g < 30 && canFight(this.bus.state, this.side); g++) fightStep(this.bus, this.side, settings.aiLevel);
  }

  /** Ya ha colocado su ejército en este despliegue. */
  private deployed = false;

  update(dt: number) {
    const s = this.bus.state;
    const side = this.side;
    // Despliegue (#51): la IA recoloca su ejército una vez; luego empieza el jugador
    if (side && s.rulesMode && s.phase === "despliegue" && !s.gameOver) {
      if (!this.deployed && !this.paused) {
        this.deployed = true;
        for (const f of runtime.spectate ? (["legion", "swarm"] as Faction[]) : [side]) {
          const mv = aiDeploy(this.bus.state, f);
          if (mv.length) { this.bus.dispatch({ type: "moveMany", moves: mv }); this.onAction("ha colocado su ejército"); }
        }
        if (runtime.spectate) { this.bus.dispatch({ type: "nextPhase" }); this.wait = STEP_MS; }
      }
      this.onStatus(null);
      return;
    }
    if (s.phase !== "despliegue") this.deployed = false;
    if (!side || !s.rulesMode || s.gameOver) { this.onStatus(null); return; }
    const aiTurn = PLAYERS[s.active] === side;
    const name = `IA ${AI_LEVEL_NAME[settings.aiLevel]}`;
    if (this.paused) { this.onStatus(`${name} en pausa`); return; }
    if (this.busy()) { this.wait = Math.max(this.wait, 250); return; }
    if (this.wait > 0) { this.wait -= dt * 1000; return; }

    // Carga en espera de fuego defensivo: decide la IA si defiende ella; si no, espera al jugador
    const pc = s.pendingCharge;
    if (pc) {
      if (runtime.spectate || PLAYERS[pc.defender] === side) {
        const fire = aiWantsOverwatch(s, settings.aiLevel);
        this.bus.dispatch({ type: "reactCharge", fire });
        if (fire) this.onAction("Fuego defensivo contra la carga");
        this.wait = STEP_MS;
      } else this.onStatus("Te cargan: ¿fuego defensivo?");
      return;
    }

    if (s.phase === "combate") {
      if (this.aiFightTurn(s)) {
        this.onStatus(`${name} combate…`);
        if (fightStep(this.bus, runtime.spectate ? this.fighter(s) : side, settings.aiLevel)) { { this.onAction(aiLastAction()); const u = aiLastActor(); if (u) this.onFocus(u); } this.wait = STEP_MS; }
        return;
      }
      if (!aiTurn) { this.onStatus(null); return; }
      const human: Faction = side === "legion" ? "swarm" : "legion";
      if (canFight(s, human)) { this.onStatus("Te toca combatir con tus unidades trabadas"); return; }
      this.bus.dispatch({ type: "nextPhase" });
      this.wait = STEP_MS;
      return;
    }
    if (!aiTurn) { this.onStatus(null); return; }
    this.onStatus(`${name} juega…`);
    if (settings.aiLevel === "facil") {
      aiPlayPhase(this.bus, "facil", "facil", { humanDefends: true });
      this.wait = STEP_MS * 1.5;
      return;
    }
    if (aiStep(this.bus, settings.aiLevel)) {
      { this.onAction(aiLastAction()); const u = aiLastActor(); if (u) this.onFocus(u); }
      this.wait = s.phase === "movimiento" ? STEP_MS * 0.8 : STEP_MS;
    } else {
      this.bus.dispatch({ type: "nextPhase" });
      this.wait = STEP_MS * 0.6;
    }
  }
}
