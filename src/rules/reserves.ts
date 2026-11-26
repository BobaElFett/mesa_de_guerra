import { recordDamage } from "./stats";
import type { PieceMove } from "../core/commands";
import { BASE_RADIUS, BOARD, DEPLOY_DEPTH, GameState, Piece, PLAYERS } from "../core/state";
import { DATASHEETS, Datasheet, optionPoints, unitPoints } from "./datasheets";
import { resolveOverlaps } from "../core/placement";
import { onForbiddenTerrain, disc, gap } from "./geometry";
import { recordCasualties } from "./missions";
import { formation } from "./leaders";
import { note, unitName } from "./history";
import type { ArmyList } from "./armies";

// Reservas estratégicas (11.ª): cualquier unidad puede empezar fuera de la mesa (como mucho la
// mitad de los puntos; un personaje va con la escuadra a la que se une). Desde la ronda 2, en la
// fase de movimiento de su bando, llega con un movimiento de entrada: entera a 6" o menos de
// algún borde de la mesa, a más de 8" de todos los enemigos y, antes de la ronda 3, fuera de la
// zona de despliegue rival. Con Despliegue profundo (o Túneles) en todas sus miniaturas, llega a
// cualquier punto a más de 8" de los enemigos. Ese turno ya no mueve (pero dispara y puede
// cargar). Si al acabar la ronda 3 sigue fuera, se pierde.

export const ARRIVE_GAP = 8;
export const EDGE_BAND = 6;
export const FIRST_ARRIVAL_ROUND = 2;
export const LAST_ARRIVAL_ROUND = 3;
/** Desde esta ronda se puede llegar también a la zona de despliegue rival. */
export const ENEMY_ZONE_ROUND = 3;

/** 11.ª: cualquier unidad puede ir a la reserva estratégica. */
export const canReserve = (_ds: Datasheet) => true;
/** Despliegue profundo (Legión) o Túneles (Enjambre). */
export const deepStrikes = (ds: Datasheet) => ds.abilities.includes("despliegueProfundo") || ds.abilities.includes("tuneles");

/** ¿Empieza en reserva esta entrada? (un personaje unido va con su escuadra) */
export function entryInReserve(list: ArmyList, i: number): boolean {
  const u = list.units[i];
  if (!u) return false;
  return u.leads !== undefined ? !!list.units[u.leads]?.reserve : !!u.reserve;
}

/** Errores de reservas en una lista (la mitad de los puntos como mucho). */
export function reserveErrors(list: ArmyList): string[] {
  const errs: string[] = [];
  let res = 0, total = 0;
  list.units.forEach((u, i) => {
    const ds = DATASHEETS[u.datasheet];
    if (!ds) return;
    const pts = (unitPoints(ds, u.models) ?? 0) + optionPoints(ds, u.models, u.options);
    total += pts;
    if (entryInReserve(list, i)) res += pts;
  });
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

/** La escuadra y los personajes unidos a ella que siguen en reserva (llegan juntos). */
export function reserveGroup(s: GameState, unitId: string): string[] {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return [unitId];
  const root = u.attachedTo && inReserve(s, u.attachedTo) ? u.attachedTo : unitId;
  return [root, ...s.units.filter((x) => x.attachedTo === root && x.id !== root && x.reserve).map((x) => x.id)];
}

/** Unidades en reserva (una por grupo: la escuadra, no sus personajes). */
export const reserveUnits = (s: GameState, faction?: "legion" | "swarm") =>
  s.units.filter((u) => u.reserve && (!faction || u.faction === faction) && reserveGroup(s, u.id)[0] === u.id);

/** ¿Llega el grupo con Despliegue profundo? (todas sus unidades lo tienen) */
export const groupDeepStrikes = (s: GameState, unitId: string) =>
  reserveGroup(s, unitId).every((id) => deepStrikes(DATASHEETS[s.units.find((u) => u.id === id)!.datasheet]));

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

/** Borde más cercano a un punto: dirección hacia dentro de la mesa y distancia a él. */
function nearestEdge(x: number, z: number): { axis: "x" | "z"; sign: 1 | -1; d: number } {
  const W = BOARD.w / 2, D = BOARD.d / 2;
  const opts = [
    { axis: "x" as const, sign: 1 as const, d: x + W }, { axis: "x" as const, sign: -1 as const, d: W - x },
    { axis: "z" as const, sign: 1 as const, d: z + D }, { axis: "z" as const, sign: -1 as const, d: D - z },
  ];
  return opts.sort((a, b) => a.d - b.d)[0];
}

/** ¿Está la peana entera a 6" o menos de algún borde? */
export function nearEdge(x: number, z: number, r: number): boolean {
  return nearestEdge(x, z).d + r <= EDGE_BAND + 1e-6;
}

/** ¿Toca la peana la zona de despliegue del rival? */
export function inEnemyZone(faction: "legion" | "swarm", z: number, r: number): boolean {
  const D = BOARD.d / 2;
  return faction === "legion" ? z - r < -D + DEPLOY_DEPTH : z + r > D - DEPLOY_DEPTH;
}

/** ¿Por qué no vale este sitio para una miniatura que llega? (null = vale) */
export function arrivalSpotError(s: GameState, unitId: string, x: number, z: number, r: number, deep = groupDeepStrikes(s, unitId)): string | null {
  const u = s.units.find((q) => q.id === unitId)!;
  const d = { x, z, r };
  if (s.pieces.some((e) => e.faction !== u.faction && gap(d, disc(e)) <= ARRIVE_GAP)) return `A más de ${ARRIVE_GAP}" de los enemigos.`;
  if (onForbiddenTerrain(s.terrain, x, z, r)) return "No encima de la escenografía.";
  if (Math.abs(x) > BOARD.w / 2 - r + 1e-6 || Math.abs(z) > BOARD.d / 2 - r + 1e-6) return "Dentro de la mesa.";
  if (deep) return null;
  if (!nearEdge(x, z, r)) return `Entera a ${EDGE_BAND}" o menos de un borde de la mesa.`;
  if (s.turn < ENEMY_ZONE_ROUND && inEnemyZone(u.faction, z, r)) return `Hasta la ronda ${ENEMY_ZONE_ROUND}, fuera de la zona de despliegue rival.`;
  return null;
}

/**
 * Dónde caerían las miniaturas si el grupo llega con centro en (x, z): en filas de 5 (o, si
 * entra por un borde, en filas pegadas a él, las que quepan en la franja de 6"), sin solapes
 * ni encima de escenografía, cerca del punto y cumpliendo las condiciones de llegada.
 * null si no caben todas.
 */
export function arrivalPlacement(s: GameState, unitId: string, x: number, z: number): PieceMove[] | null {
  const group = new Set(reserveGroup(s, unitId));
  const models = (s.reserves ?? []).filter((p) => p.unit && group.has(p.unit));
  if (!models.length) return null;
  const u = s.units.find((q) => q.id === unitId)!;
  const enemies = s.pieces.filter((p) => p.faction !== u.faction).map((p) => ({ x: p.x, z: p.z, r: BASE_RADIUS[p.model] + ARRIVE_GAP }));
  const r = Math.max(...models.map((p) => BASE_RADIUS[p.model]));
  const step = 2 * r + 0.4, n = models.length;
  let ghosts: Piece[];
  let reach = 5;
  if (groupDeepStrikes(s, unitId)) {
    const per = Math.min(5, n);
    ghosts = models.map((p, i) => ({ ...p, x: x + ((i % per) - (per - 1) / 2) * step, z: z + (Math.floor(i / per) - (Math.ceil(n / per) - 1) / 2) * step }));
  } else {
    // Filas paralelas al borde más cercano, desde él hacia dentro
    const e = nearestEdge(x, z);
    const rows = Math.max(1, Math.floor((EDGE_BAND - 2 * r - 0.2) / step) + 1);
    const per = Math.ceil(n / rows);
    const W = BOARD.w / 2, D = BOARD.d / 2;
    const base = e.axis === "x" ? (e.sign === 1 ? -W : W) : (e.sign === 1 ? -D : D);
    ghosts = models.map((p, i) => {
      const along = ((i % per) - (per - 1) / 2) * step, depth = base + e.sign * (r + 0.1 + Math.floor(i / per) * step);
      return e.axis === "x" ? { ...p, x: depth, z: z + along } : { ...p, x: x + along, z: depth };
    });
    reach = Math.max(5, (per * step) / 2 + EDGE_BAND);
  }
  const rejected: string[] = [];
  const placed = resolveOverlaps([...s.pieces, ...ghosts], ghosts.map((p) => ({ id: p.id, x: p.x, z: p.z })), {
    avoid: () => enemies,
    blocked: (px, pz, rr) => onForbiddenTerrain(s.terrain, px, pz, rr + 0.05) !== null,
    limit: () => ({ x, z, max: reach }),
    rejected,
  });
  if (rejected.length) return null;
  // Comprobación final (la búsqueda puede devolver el sitio de partida si no hay otro)
  for (const m of placed) {
    const p = ghosts.find((g) => g.id === m.id)!;
    if (arrivalSpotError(s, unitId, m.x, m.z, BASE_RADIUS[p.model])) return null;
    if (Math.hypot(m.x - x, m.z - z) > reach + 0.01) return null;
  }
  return placed;
}

/** La unidad llega (muta `s`). Devuelve false si no se puede. */
export function applyArrival(s: GameState, unitId: string, x: number, z: number): boolean {
  if (arrivalBlocked(s, unitId)) return false;
  const moves = arrivalPlacement(s, unitId, x, z);
  if (!moves) return false;
  const at = new Map(moves.map((m) => [m.id, m]));
  const deep = groupDeepStrikes(s, unitId);
  const group = reserveGroup(s, unitId), inGroup = (p: Piece) => !!p.unit && group.includes(p.unit);
  const arriving = (s.reserves ?? []).filter(inGroup).map((p) => ({ ...p, x: at.get(p.id)!.x, z: at.get(p.id)!.z }));
  s.reserves = (s.reserves ?? []).filter((p) => !inGroup(p));
  s.pieces = [...s.pieces, ...arriving];
  for (const id of group) {
    s.units.find((q) => q.id === id)!.reserve = false;
    s.turnLog.moves[id] = { kind: "normal", arrived: true };
  }
  for (const p of arriving) s.turnLog.origins[p.id] = [p.x, p.z];
  const u = s.units.find((q) => q.id === group[0])!;
  const how = !deep ? "entra por el borde de la mesa" : DATASHEETS[u.datasheet].abilities.includes("tuneles") ? "sale de un túnel" : "se teletransporta desde la órbita";
  note(s, "mover", `${unitName(s, group[0])} ${how}`);
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

// --- Recolocar tras llegar ----------------------------------------------------------
// La llegada pone la unidad de golpe (en filas). Hasta que acabe esa fase de movimiento, el jugador
// puede arrastrar sus miniaturas a otro sitio: cada una tiene que seguir cumpliendo las condiciones
// de llegada (más de 8" de los enemigos y, si no es Despliegue profundo, a 6" de un borde y fuera
// de la zona rival hasta la ronda 3). No cuenta como movimiento: es colocarla con más detalle.

/** ¿Puede recolocar ahora las miniaturas de esta unidad recién llegada? */
export function adjustingArrival(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  return !!u && s.rulesMode && !s.gameOver && s.phase === "movimiento" && u.faction === PLAYERS[s.active]
    && formation(s, unitId).every((id) => !!s.turnLog.moves[id]?.arrived);
}

/** Recolocación de una unidad recién llegada: lo que no cumple las condiciones vuelve a su sitio. */
export function checkArrivalAdjust(s: GameState, unitId: string, moves: PieceMove[]): { moves: PieceMove[]; rejected: string[]; message: string | null } {
  const ids = formation(s, unitId);
  const deep = ids.every((id) => deepStrikes(DATASHEETS[s.units.find((u) => u.id === id)!.datasheet]));
  const u = s.units.find((q) => q.id === unitId)!;
  const enemies = s.pieces.filter((p) => p.faction !== u.faction).map((p) => ({ x: p.x, z: p.z, r: BASE_RADIUS[p.model] + ARRIVE_GAP }));
  const rejected: string[] = [];
  const placed = resolveOverlaps(s.pieces, moves, {
    avoid: () => enemies,
    blocked: (px, pz, rr) => onForbiddenTerrain(s.terrain, px, pz, rr + 0.05) !== null,
    rejected,
  });
  let why: string | null = null;
  const out = placed.filter((m) => {
    if (rejected.includes(m.id)) return false;
    const p = s.pieces.find((q) => q.id === m.id);
    if (!p) return false;
    const err = arrivalSpotError(s, unitId, m.x, m.z, BASE_RADIUS[p.model], deep);
    if (err) { why = err; rejected.push(m.id); return false; }
    return true;
  });
  const n = rejected.length;
  const message = n ? `${why ?? "No cabe ahí."} ${n === 1 ? "1 miniatura vuelve" : `${n} vuelven`} a su sitio.` : null;
  return { moves: out, rejected, message };
}
