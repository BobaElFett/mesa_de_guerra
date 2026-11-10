import { note, unitName } from "./history";
import { GameState, PLAYERS } from "../core/state";
import { rollDice } from "../core/rng";
import { DATASHEETS } from "./datasheets";
import { disc, gap } from "./geometry";
import { unitModels } from "./movement";

// Moral y sinapsis del reglamento.
//  - En la fase de mando, las unidades del jugador activo por debajo de la mitad chequean moral:
//    2D6 ≥ L. Si fallan quedan desmoralizadas hasta su siguiente fase de mando (CO 0, sin PM).
//  - Sinapsis: las unidades del Enjambre a 12" de una unidad Sináptica superan el chequeo solas.

export const SYNAPSE_RANGE = 12;

export interface MoraleEntry {
  turn: number;
  player: number;
  unit: string;
  /** Tirada de 2D6, o null si superó por sinapsis. */
  dice: [number, number] | null;
  need: number;
  passed: boolean;
}

/** ¿Está la unidad por debajo de la mitad? (de miniaturas; o de heridas si es de una sola) */
export function belowHalf(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return false;
  const models = unitModels(s, unitId);
  if (!models.length) return false;
  if (u.startingModels === 1) {
    const W = DATASHEETS[u.datasheet].profile.W;
    return W - (models[0].damage ?? 0) < W / 2;
  }
  return models.length < u.startingModels / 2;
}

/** ¿Está esta unidad del Enjambre a 12" de una unidad Sináptica viva (que no sea ella misma)? */
export function inSynapse(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || u.faction !== "swarm") return false;
  const mine = unitModels(s, unitId);
  return s.units.some((o) => o.id !== unitId && o.faction === "swarm"
    && DATASHEETS[o.datasheet].abilities.includes("sinaptico")
    && unitModels(s, o.id).some((q) => mine.some((p) => gap(disc(p), disc(q)) <= SYNAPSE_RANGE + 1e-6)));
}

/** Aterrador (#62): ¿hay un enemigo con Aterrador a 6" o menos? Entonces −1 al Liderazgo. */
export const TERROR_RANGE = 6;
function nearTerror(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId)!;
  const mine = unitModels(s, unitId);
  return s.units.some((o) => o.faction !== u.faction && DATASHEETS[o.datasheet].abilities.includes("aterrador")
    && unitModels(s, o.id).some((q) => mine.some((p) => gap(disc(p), disc(q)) <= TERROR_RANGE + 1e-6)));
}

/** ¿Es Sináptica la propia unidad? (también supera sus chequeos) */
function isSynaptic(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  return !!u && DATASHEETS[u.datasheet].abilities.includes("sinaptico");
}

/**
 * Al empezar la fase de mando del jugador activo: se recuperan sus desmoralizadas y chequean
 * las que estén por debajo de la mitad. Muta `s` y devuelve los chequeos hechos.
 */
export function runMoraleTests(s: GameState): MoraleEntry[] {
  const faction = PLAYERS[s.active];
  const out: MoraleEntry[] = [];
  for (const u of s.units) {
    if (u.faction !== faction) continue;
    u.shocked = false;
    if (u.reserve || !belowHalf(s, u.id)) continue;   // en reserva no chequea
    const need = DATASHEETS[u.datasheet].profile.Ld + (nearTerror(s, u.id) ? 1 : 0);
    if (isSynaptic(s, u.id) || inSynapse(s, u.id)) {
      out.push({ turn: s.turn, player: s.active, unit: u.id, dice: null, need, passed: true });
      continue;
    }
    const [d, rng] = rollDice(s.rng, 2, 6);
    s.rng = rng;
    const passed = d[0] + d[1] >= need;
    if (!passed) u.shocked = true;
    out.push({ turn: s.turn, player: s.active, unit: u.id, dice: [d[0], d[1]], need, passed });
  }
  s.moraleLog = [...(s.moraleLog ?? []), ...out];
  for (const m of out) note(s, "moral", `${unitName(s, m.unit)} ${m.dice === null ? "supera la moral por sinapsis" : `chequea moral: ${m.dice[0] + m.dice[1]} (necesita ${m.need}) — ${m.passed ? "aguanta" : "desmoralizada"}`}`, m.player as 0 | 1);
  return out;
}

/** CO efectivo: 0 si está desmoralizada. */
export function objectiveControl(s: GameState, unitId: string): number {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || u.shocked) return 0;
  return DATASHEETS[u.datasheet].profile.OC * unitModels(s, unitId).length;
}
