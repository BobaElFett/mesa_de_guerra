import { LAST_ARRIVAL_ROUND, loseLateReserves } from "./reserves";
import { note } from "./history";
import type { GameState } from "../core/state";
import { runMoraleTests } from "./morale";
import { scoreObjectives } from "./missions";
import { drawSecondaries, scoreSecondaries } from "./secondaries";
import { healLedSquads } from "./special";

// El turno del reglamento (antes de la ronda 1, la fase de despliegue): cinco fases por jugador, dos jugadores por ronda, cinco rondas.

export type Phase = "despliegue" | "mando" | "movimiento" | "disparo" | "carga" | "combate";

/** Las fases de cada turno (el despliegue va aparte, una sola vez al principio). */
export const PHASES: Phase[] = ["mando", "movimiento", "disparo", "carga", "combate"];
export const MAX_ROUNDS = 5;

export const PHASE_INFO: Record<Phase, { name: string; hint: string }> = {
  despliegue: { name: "Despliegue", hint: "Coloca tus unidades dentro de tu zona (la franja de tu color). Los dos bandos pueden recolocar; Empezar partida pasa al mando de la ronda 1." },
  mando: { name: "Mando", hint: "Los dos bandos ganan 1 PM. Las unidades por debajo de la mitad chequean moral (2D6 ≥ L); la sinapsis las salva." },
  movimiento: { name: "Movimiento", hint: "Mueve cada unidad hasta su M, avanza (M + D6) o retírate del combate." },
  disparo: { name: "Disparo", hint: "Cada unidad no trabada elige objetivos visibles al alcance y dispara." },
  carga: { name: "Carga", hint: "Una unidad a 12\" de un enemigo puede cargar: 2D6 para llegar a 1\"." },
  combate: { name: "Combate", hint: "Primero las que cargaron; luego se alternan. Agrupar 3\", golpear, consolidar 3\"." },
};

/** Al empezar la fase de mando, los dos jugadores ganan 1 punto de mando y empieza un registro nuevo. */
function enterCommand(s: GameState) {
  s.cp = [s.cp[0] + 1, s.cp[1] + 1];
  s.turnLog = { moves: {}, origins: {} };
  if (s.rulesMode) note(s, "turno", `Ronda ${s.turn}: turno ${s.active === 0 ? "de la Legión Astral" : "del Enjambre"} (PM ${s.cp[s.active]})`);
  if (s.rulesMode) healLedSquads(s);
  if (s.rulesMode) runMoraleTests(s);
  scoreObjectives(s, "inicio");
  drawSecondaries(s);
}

/** Al empezar la fase de movimiento se apunta dónde está cada miniatura del jugador activo. */
function enterMovement(s: GameState) {
  const f = s.active === 0 ? "legion" : "swarm";
  s.turnLog.origins = Object.fromEntries(s.pieces.filter((p) => p.faction === f).map((p) => [p.id, [p.x, p.z]]));
}

/** Pasa a la fase siguiente (muta `s`, que ya es una copia). */
export function advancePhase(s: GameState) {
  if (s.gameOver) return;
  if (s.phase === "despliegue") { startBattle(s); return; }
  const i = PHASES.indexOf(s.phase);
  if (i < PHASES.length - 1) {
    s.phase = PHASES[i + 1];
    if (s.phase === "movimiento") enterMovement(s);
    if (s.phase === "combate") s.turnLog.fought = [];
    return;
  }
  // Fin del turno del jugador activo: puntúa la misión y las órdenes cumplidas
  scoreObjectives(s, "final");
  scoreSecondaries(s);
  if (s.active === 1 && s.turn === LAST_ARRIVAL_ROUND) loseLateReserves(s);
  if (s.active === 1 && s.turn >= MAX_ROUNDS) { s.gameOver = true; return; }
  endTurn(s);
}

/** Fin del despliegue: ronda 1, mando de la Legión (los PM iniciales ya están puestos). */
function startBattle(s: GameState) {
  if (s.rulesMode) note(s, "turno", "Empieza la batalla. Ronda 1: turno de la Legión Astral", 0);
  s.turn = 1;
  s.active = 0;
  s.phase = "mando";
  s.turnLog = { moves: {}, origins: {} };
  drawSecondaries(s);
}

/** Salta al turno del otro jugador, a su fase de mando. En mesa libre no hay límite de rondas. */
export function endTurn(s: GameState) {
  if (s.gameOver) return;
  if (s.phase === "despliegue") { startBattle(s); return; }
  if (s.active === 1) {
    if (s.rulesMode && s.turn >= MAX_ROUNDS) { s.gameOver = true; return; }
    s.turn += 1;
  }
  s.active = s.active === 0 ? 1 : 0;
  s.phase = "mando";
  enterCommand(s);
}
