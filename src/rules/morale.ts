import { formation, ledBy } from "./leaders";
import { note, unitName } from "./history";
import { GameState, PLAYERS } from "../core/state";
import { rollDice } from "../core/rng";
import { DATASHEETS } from "./datasheets";
import { disc, gap } from "./geometry";
import { unitModels } from "./movement";

// Moral y sinapsis (11.ª).
//  - Paso de moral de la fase de mando: el jugador activo chequea (2D6 ≥ L) con cada unidad que
//    esté a la mitad de su fuerza o menos, o desmoralizada. Si falla queda (o sigue) desmoralizada
//    (CO 0, sin estratagemas); si la supera, deja de estarlo. Una escuadra con sus personajes
//    chequea una sola vez (el mejor L).
//  - Sinapsis (11.ª): las unidades del Enjambre a 6" de una miniatura sináptica chequean con 3D6
//    (y suman +1 a la Fuerza en combate, ver shooting.ts).

export const SYNAPSE_RANGE = 6;

export interface MoraleEntry {
  turn: number;
  player: number;
  unit: string;
  /** Dados tirados (2D6, o 3D6 en sinapsis); null en partidas antiguas que superaban por sinapsis. */
  dice: number[] | null;
  need: number;
  passed: boolean;
}

/**
 * ¿Está a la mitad de su fuerza o menos? (11.ª: de miniaturas; o de heridas si es de una sola).
 * Una escuadra con personajes unidos cuenta todas sus miniaturas juntas.
 */
export function belowHalf(s: GameState, unitId: string): boolean {
  const ids = formation(s, unitId);
  const units = ids.map((id) => s.units.find((x) => x.id === id)!).filter(Boolean);
  const models = ids.flatMap((id) => unitModels(s, id));
  if (!models.length) return false;
  const start = units.reduce((n, u) => n + u.startingModels, 0);
  if (start === 1) {
    const W = DATASHEETS[units[0].datasheet].profile.W;
    return W - (models[0].damage ?? 0) <= W / 2;
  }
  return models.length <= start / 2;
}

/** ¿Tiene la unidad alguna miniatura a 6" (sinapsis) de alguna de las unidades que cumplen `ok`? */
function within(s: GameState, unitId: string, ok: (id: string) => boolean): boolean {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || u.faction !== "swarm") return false;
  const mine = unitModels(s, unitId);
  return s.units.some((o) => o.faction === "swarm" && ok(o.id)
    && unitModels(s, o.id).some((q) => mine.some((p) => gap(disc(p), disc(q)) <= SYNAPSE_RANGE + 1e-6)));
}

const hasAb = (s: GameState, id: string, a: string) =>
  (DATASHEETS[s.units.find((x) => x.id === id)!.datasheet].abilities as string[]).includes(a);

/** ¿Es sináptica la unidad? (Sináptico, o Neurocitos en sinapsis de una unidad sináptica de verdad) */
export function synapticUnit(s: GameState, unitId: string): boolean {
  if (hasAb(s, unitId, "sinaptico")) return true;
  return hasAb(s, unitId, "neurocitos") && within(s, unitId, (id) => hasAb(s, id, "sinaptico"));
}

/** ¿Está esta unidad del Enjambre a 6" de una miniatura sináptica (también ella misma)? */
export function inSynapse(s: GameState, unitId: string): boolean {
  return within(s, unitId, (id) => synapticUnit(s, id));
}

/** Aterrador (#62): ¿hay un enemigo con Aterrador a 6" o menos? Entonces −1 al Liderazgo. */
export const TERROR_RANGE = 6;
function nearTerror(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId)!;
  const mine = unitModels(s, unitId);
  return s.units.some((o) => o.faction !== u.faction && (DATASHEETS[o.datasheet].abilities as string[]).includes("aterrador")
    && unitModels(s, o.id).some((q) => mine.some((p) => gap(disc(p), disc(q)) <= TERROR_RANGE + 1e-6)));
}


/**
 * Paso de moral de la fase de mando del jugador activo: chequean sus unidades a la mitad o menos
 * y las desmoralizadas (que se recuperan si lo superan). Muta `s` y devuelve los chequeos hechos.
 */
export function runMoraleTests(s: GameState): MoraleEntry[] {
  const faction = PLAYERS[s.active];
  const out: MoraleEntry[] = [];
  for (const u of s.units) {
    if (u.faction !== faction || u.reserve || !unitModels(s, u.id).length) continue;   // en reserva no chequea
    const group = formation(s, u.id);
    if (group[0] !== u.id) continue;                    // la formación chequea una vez, con su escuadra
    const members = group.map((id) => s.units.find((x) => x.id === id)!);
    const shocked = members.some((m) => m.shocked);
    if (!shocked && !belowHalf(s, u.id)) continue;
    const need = Math.min(...members.map((m) => DATASHEETS[m.datasheet].profile.Ld)) + (nearTerror(s, u.id) ? 1 : 0);
    // Sinapsis (11.ª): 3D6
    const [d, rng] = rollDice(s.rng, inSynapse(s, u.id) ? 3 : 2, 6);
    s.rng = rng;
    const passed = d.reduce((a, b) => a + b, 0) >= need;
    for (const m of members) m.shocked = !passed;
    out.push({ turn: s.turn, player: s.active, unit: u.id, dice: d, need, passed });
  }
  s.moraleLog = [...(s.moraleLog ?? []), ...out];
  for (const m of out) note(s, "moral", `${unitName(s, m.unit)} ${m.dice === null ? "supera la moral por sinapsis" : `chequea moral con ${m.dice.length}D6: ${m.dice.reduce((a, b) => a + b, 0)} (necesita ${m.need}) — ${m.passed ? "aguanta" : "desmoralizada"}`}`, m.player as 0 | 1);
  return out;
}

/** CO efectivo: 0 si está desmoralizada. */
export function objectiveControl(s: GameState, unitId: string): number {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || u.shocked) return 0;
  return (DATASHEETS[u.datasheet].profile.OC + (ledBy(s, unitId, "estandarte") ? 1 : 0)) * unitModels(s, unitId).length;
}
