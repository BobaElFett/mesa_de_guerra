import { CommandBus } from "../core/commands";
import { Faction, GameState, PLAYERS } from "../core/state";
import { pendingChargers } from "../rules/melee";
import { aiLastAction, aiPlayPhase, aiStep, canFight, fightStep } from "./tactics";
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
  onStatus: (text: string | null) => void = () => {};

  constructor(private bus: CommandBus, private busy: () => boolean) {}

  get side(): Faction | null { return runtime.online ? null : settings.aiSide; }

  /** ¿Le toca jugar a la IA ahora (y por tanto el jugador no debería tocar)? */
  isAiTurn(s: GameState = this.bus.state): boolean {
    return !!this.side && s.rulesMode && !s.gameOver && s.phase !== "despliegue" && PLAYERS[s.active] === this.side;
  }

  /** En combate: ¿le toca golpear a la IA según la alternancia? */
  private aiFightTurn(s: GameState): boolean {
    const ai = this.side!, human: Faction = ai === "legion" ? "swarm" : "legion";
    if (!canFight(s, ai)) return false;
    const pending = pendingChargers(s);
    if (pending.length) return pending.some((u) => s.units.find((x) => x.id === u)?.faction === ai);
    const fought = s.turnLog.fought ?? [];
    const last = fought.length ? s.units.find((u) => u.id === fought[fought.length - 1])?.faction : undefined;
    return last !== ai || !canFight(s, human);
  }

  /** Antes de que el jugador pase de fase: que la IA acabe sus combates pendientes. */
  flushFights() {
    const s = this.bus.state;
    if (!this.side || !s.rulesMode || s.phase !== "combate") return;
    for (let g = 0; g < 30 && canFight(this.bus.state, this.side); g++) fightStep(this.bus, this.side, settings.aiLevel);
  }

  update(dt: number) {
    const s = this.bus.state;
    const side = this.side;
    if (!side || !s.rulesMode || s.gameOver || s.phase === "despliegue") { this.onStatus(null); return; }
    const aiTurn = PLAYERS[s.active] === side;
    const name = `IA ${AI_LEVEL_NAME[settings.aiLevel]}`;
    if (this.paused) { this.onStatus(`${name} en pausa`); return; }
    if (this.busy()) { this.wait = Math.max(this.wait, 250); return; }
    if (this.wait > 0) { this.wait -= dt * 1000; return; }

    if (s.phase === "combate") {
      if (this.aiFightTurn(s)) {
        this.onStatus(`${name} combate…`);
        if (fightStep(this.bus, side, settings.aiLevel)) { this.onAction(aiLastAction()); this.wait = STEP_MS; }
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
      aiPlayPhase(this.bus, "facil");
      this.wait = STEP_MS * 1.5;
      return;
    }
    if (aiStep(this.bus, settings.aiLevel)) {
      this.onAction(aiLastAction());
      this.wait = s.phase === "movimiento" ? STEP_MS * 0.8 : STEP_MS;
    } else {
      this.bus.dispatch({ type: "nextPhase" });
      this.wait = STEP_MS * 0.6;
    }
  }
}
