import type { GameState } from "../core/state";

// El turno del reglamento: cinco fases por jugador, dos jugadores por ronda, cinco rondas.

export type Phase = "mando" | "movimiento" | "disparo" | "carga" | "combate";

export const PHASES: Phase[] = ["mando", "movimiento", "disparo", "carga", "combate"];
export const MAX_ROUNDS = 5;

export const PHASE_INFO: Record<Phase, { name: string; hint: string }> = {
  mando: { name: "Mando", hint: "Los dos bandos ganan 1 PM. Las unidades por debajo de la mitad chequean moral." },
  movimiento: { name: "Movimiento", hint: "Mueve cada unidad hasta su M, avanza (M + D6) o retírate del combate." },
  disparo: { name: "Disparo", hint: "Cada unidad no trabada elige objetivos visibles al alcance y dispara." },
  carga: { name: "Carga", hint: "Una unidad a 12\" de un enemigo puede cargar: 2D6 para llegar a 1\"." },
  combate: { name: "Combate", hint: "Primero las que cargaron; luego se alternan. Agrupar 3\", golpear, consolidar 3\"." },
};

/** Al empezar la fase de mando, los dos jugadores ganan 1 punto de mando. */
function enterCommand(s: GameState) {
  s.cp = [s.cp[0] + 1, s.cp[1] + 1];
}

/** Pasa a la fase siguiente (muta `s`, que ya es una copia). */
export function advancePhase(s: GameState) {
  if (s.gameOver) return;
  const i = PHASES.indexOf(s.phase);
  if (i < PHASES.length - 1) { s.phase = PHASES[i + 1]; return; }
  // Fin del turno del jugador activo
  if (s.active === 1 && s.turn >= MAX_ROUNDS) { s.gameOver = true; return; }
  endTurn(s);
}

/** Salta al turno del otro jugador, a su fase de mando. En mesa libre no hay límite de rondas. */
export function endTurn(s: GameState) {
  if (s.gameOver) return;
  if (s.active === 1) {
    if (s.rulesMode && s.turn >= MAX_ROUNDS) { s.gameOver = true; return; }
    s.turn += 1;
  }
  s.active = s.active === 0 ? 1 : 0;
  s.phase = "mando";
  enterCommand(s);
}
