import { GameState } from "../core/state";
import type { Weapon } from "./datasheets";

// Condiciones de batalla (#68), elegidas al preparar la partida:
//  - Noche: nada se ve a más de 24": el alcance de toda arma a distancia queda en 24" como mucho.
//  - Tormenta: −1 a impactar al disparar a más de 12" (no en el fuego defensivo, que ya va a 6).

export type Condition = "noche" | "tormenta";
export const NIGHT_SIGHT = 24;
export const STORM_RANGE = 12;

export const CONDITIONS: Record<Condition, { name: string; text: string }> = {
  noche: { name: "Noche", text: `Nada se ve a más de ${NIGHT_SIGHT}": ningún arma dispara más lejos.` },
  tormenta: { name: "Tormenta", text: `−1 a impactar al disparar a más de ${STORM_RANGE}".` },
};

/** Alcance real de un arma a distancia con las condiciones de la partida. */
export function reach(s: Pick<GameState, "conditions">, w: Weapon): number {
  if (w.range === "CC") return 0;
  return s.conditions === "noche" ? Math.min(w.range, NIGHT_SIGHT) : w.range;
}

/** Modificador a impactar por las condiciones. */
export function conditionHitMod(s: Pick<GameState, "conditions">, distance: number | undefined): number {
  return s.conditions === "tormenta" && distance !== undefined && distance > STORM_RANGE + 1e-6 ? -1 : 0;
}
