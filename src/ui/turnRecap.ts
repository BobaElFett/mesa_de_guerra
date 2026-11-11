import { GameState, PLAYERS } from "../core/state";
import { recapHtml, turnRecap } from "../rules/recap";

// Resumen del turno rival (#100): al volver a tu turno, una tarjeta con lo que hizo la IA (o tu
// rival en línea): bajas, PV, cargas, estratagemas… Se cierra con un clic o al pasar de fase.

export class TurnRecapBox {
  private el = document.getElementById("recap")!;
  private start: { s: GameState; player: 0 | 1 } | null = null;
  private lastActive: 0 | 1 | null = null;
  private lastTurn = -1;
  enabled = true;

  constructor() {
    this.el.addEventListener("click", () => this.hide());
  }

  hide() { this.el.hidden = true; }

  /** Llamar tras cada cambio. `mine(p)`: ¿lleva este jugador quien está delante? */
  track(s: GameState, mine: (p: 0 | 1) => boolean, quiet: boolean) {
    if (!s.rulesMode || s.phase === "despliegue" || s.gameOver) { this.start = null; this.lastActive = null; if (!s.gameOver) this.hide(); return; }
    const changed = s.active !== this.lastActive || s.turn !== this.lastTurn;
    if (!changed) { if (!this.el.hidden && s.phase !== "mando") this.hide(); return; }
    // Retroceso (deshacer o repetición): se olvida el resumen
    const back = this.lastTurn > s.turn || (this.lastTurn === s.turn && this.lastActive === 1 && s.active === 0);
    this.lastActive = s.active; this.lastTurn = s.turn;
    if (back) { this.start = null; this.hide(); return; }
    const other = (1 - s.active) as 0 | 1;
    if (!mine(s.active)) { this.start = { s, player: s.active }; this.hide(); return; }
    if (this.start && this.start.player === other && !mine(other) && this.enabled && !quiet) {
      const r = turnRecap(this.start.s, s, other);
      this.el.innerHTML = recapHtml(r) + `<div class="rc-foot dim">Clic para cerrar · el registro completo, con L</div>`;
      this.el.classList.toggle("legion", PLAYERS[other] === "legion");
      this.el.hidden = false;
    }
    this.start = null;
  }
}
