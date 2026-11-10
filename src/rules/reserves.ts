import { recordDamage } from "./stats";
import type { PieceMove } from "../core/commands";
import { BASE_RADIUS, GameState, Piece, PLAYERS } from "../core/state";
import { DATASHEETS, Datasheet, optionPoints, unitPoints } from "./datasheets";
import { resolveOverlaps } from "../core/placement";
import { onForbiddenTerrain, disc, gap } from "./geometry";
import { recordCasualties } from "./missions";
import { note, unitName } from "./history";
import type { ArmyList } from "./armies";

// Reservas (#56): unidades con Despliegue profundo (Legión) o Túneles (Enjambre) que empiezan
// fuera de la mesa. En la fase de movimiento de su bando, desde la ronda 2, llegan a cualquier
// punto a más de 9" de todos los enemigos (cuenta como su movimiento normal: ese turno ya no
// mueven, pero disparan y pueden cargar). Si al acabar la ronda 3 siguen fuera, se pierden.

export const ARRIVE_GAP = 9;
export const FIRST_ARRIVAL_ROUND = 2;
export const LAST_ARRIVAL_ROUND = 3;

export const canReserve = (ds: Datasheet) => ds.abilities.includes("despliegueProfundo") || ds.abilities.includes("tuneles");

/** Errores de reservas en una lista (la mitad de los puntos como mucho). */
export function reserveErrors(list: ArmyList): string[] {
  const errs: string[] = [];
  let res = 0, total = 0;
  for (const u of list.units) {
    const ds = DATASHEETS[u.datasheet];
    const pts = (unitPoints(ds, u.models) ?? 0) + optionPoints(ds, u.models, u.options);
    total += pts;
    if (!u.reserve) continue;
    if (!canReserve(ds)) errs.push(`${ds.name} no puede empezar en reserva.`);
    res += pts;
  }
  if (res > total / 2) errs.push("Como mucho la mitad de los puntos del ejército puede empezar en reserva.");
  return errs;
}

/** Saca de la mesa las unidades marcadas para reserva (tras desplegar). */
export function sendToReserves(s: GameState, ids: string[]) {
  const set = new Set(ids);
  const out = s.pieces.filter((p) => p.unit && set.has(p.unit));
  s.pieces = s.pieces.filter((p) => !p.unit || !set.has(p.unit));
  s.reserves = [...(s.reserves ?? []), ...out];
  for (const u of s.units) if (set.has(u.id)) u.reserve = true;
}

export const inReserve = (s: GameState, unitId: string) => !!s.units.find((u) => u.id === unitId)?.reserve;
export const reserveUnits = (s: GameState, faction?: "legion" | "swarm") =>
  s.units.filter((u) => u.reserve && (!faction || u.faction === faction));

/** ¿Por qué no puede llegar ahora? (null = puede) */
export function arrivalBlocked(s: GameState, unitId: string): string | null {
  const u = s.units.find((x) => x.id === unitId);
  if (!u?.reserve) return "No está en reserva.";
  if (!s.rulesMode || s.gameOver) return "Solo en modo reglas.";
  if (u.faction !== PLAYERS[s.active]) return "Solo en tu turno.";
  if (s.phase !== "movimiento") return "Llega en la fase de movimiento.";
  if (s.turn < FIRST_ARRIVAL_ROUND) return `Llega desde la ronda ${FIRST_ARRIVAL_ROUND}.`;
  return null;
}

/**
 * Dónde caerían las miniaturas si la unidad llega con centro en (x, z): en filas de 5, cada
 * una a más de 9" de cualquier enemigo, sin solapes ni encima de escenografía, y todas a 5"
 * o menos del punto. null si no caben todas.
 */
export function arrivalPlacement(s: GameState, unitId: string, x: number, z: number): PieceMove[] | null {
  const models = (s.reserves ?? []).filter((p) => p.unit === unitId);
  if (!models.length) return null;
  const u = s.units.find((q) => q.id === unitId)!;
  const enemies = s.pieces.filter((p) => p.faction !== u.faction).map((p) => ({ x: p.x, z: p.z, r: BASE_RADIUS[p.model] + ARRIVE_GAP }));
  const r = BASE_RADIUS[models[0].model];
  const step = 2 * r + 0.4, per = Math.min(5, models.length);
  const ghosts: Piece[] = models.map((p, i) => ({ ...p, x: x + ((i % per) - (per - 1) / 2) * step, z: z + (Math.floor(i / per) - (Math.ceil(models.length / per) - 1) / 2) * step }));
  const rejected: string[] = [];
  const placed = resolveOverlaps([...s.pieces, ...ghosts], ghosts.map((p) => ({ id: p.id, x: p.x, z: p.z })), {
    avoid: () => enemies,
    blocked: (px, pz, rr) => onForbiddenTerrain(s.terrain, px, pz, rr + 0.05) !== null,
    limit: () => ({ x, z, max: 5 }),
    rejected,
  });
  if (rejected.length) return null;
  // Comprobación final (la búsqueda puede devolver el sitio de partida si no hay otro)
  for (const m of placed) {
    const p = ghosts.find((g) => g.id === m.id)!;
    const d = { x: m.x, z: m.z, r: BASE_RADIUS[p.model] };
    if (s.pieces.some((e) => e.faction !== u.faction && gap(d, disc(e)) <= ARRIVE_GAP)) return null;
    if (onForbiddenTerrain(s.terrain, m.x, m.z, d.r)) return null;
    if (Math.hypot(m.x - x, m.z - z) > 5.01) return null;
  }
  return placed;
}

/** La unidad llega (muta `s`). Devuelve false si no se puede. */
export function applyArrival(s: GameState, unitId: string, x: number, z: number): boolean {
  if (arrivalBlocked(s, unitId)) return false;
  const moves = arrivalPlacement(s, unitId, x, z);
  if (!moves) return false;
  const at = new Map(moves.map((m) => [m.id, m]));
  const arriving = (s.reserves ?? []).filter((p) => p.unit === unitId).map((p) => ({ ...p, x: at.get(p.id)!.x, z: at.get(p.id)!.z }));
  s.reserves = (s.reserves ?? []).filter((p) => p.unit !== unitId);
  s.pieces = [...s.pieces, ...arriving];
  const u = s.units.find((q) => q.id === unitId)!;
  u.reserve = false;
  s.turnLog.moves[unitId] = { kind: "normal", arrived: true };
  for (const p of arriving) s.turnLog.origins[p.id] = [p.x, p.z];
  const how = DATASHEETS[u.datasheet].abilities.includes("tuneles") ? "sale de un túnel" : "se teletransporta desde la órbita";
  note(s, "mover", `${unitName(s, unitId)} ${how}`);
  return true;
}

/** Al acabar la ronda 3: lo que siga en reserva se pierde (cuenta como destruido). */
export function loseLateReserves(s: GameState) {
  for (const u of s.units.filter((x) => x.reserve)) {
    const n = (s.reserves ?? []).filter((p) => p.unit === u.id).length;
    s.reserves = (s.reserves ?? []).filter((p) => p.unit !== u.id);
    u.reserve = false;
    const opp = (1 - PLAYERS.indexOf(u.faction)) as 0 | 1;
    note(s, "baja", `${unitName(s, u.id)} no llegó a tiempo desde la reserva: se pierde`, PLAYERS.indexOf(u.faction) as 0 | 1);
    recordCasualties(s, opp, u.id, n);
    recordDamage(s, null, u.id, 0, n);
  }
}
