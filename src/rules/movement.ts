import { BASE_RADIUS, GameState, Piece } from "../core/state";
import type { PieceMove } from "../core/commands";
import { DATASHEETS } from "./datasheets";
import { ENGAGEMENT, engaged, gap, disc } from "./geometry";

// Fase de movimiento del reglamento: mover hasta M, avanzar (M + D6) o retirarse.
// Distancia en línea recta desde donde empezó la fase (simplificación: el camino no cuenta).

export type MoveKind = "normal" | "avanzar" | "retirarse";

export interface UnitMove {
  kind: MoveKind;
  /** D6 del avance. */
  advance?: number;
}

/** Registro del turno en curso: qué hizo cada unidad y desde dónde empezó a mover cada miniatura. */
export interface TurnLog {
  moves: Record<string, UnitMove>;
  origins: Record<string, [number, number]>;
}

export const emptyTurnLog = (): TurnLog => ({ moves: {}, origins: {} });

export function unitModels(s: GameState, unitId: string): Piece[] {
  return s.pieces.filter((p) => p.unit === unitId);
}

export function enemyModels(s: GameState, unitId: string): Piece[] {
  const u = s.units.find((x) => x.id === unitId);
  return u ? s.pieces.filter((p) => p.faction !== u.faction) : [];
}

/** ¿Está la unidad trabada (a 1" de alguna enemiga)? */
export function isEngaged(s: GameState, unitId: string): boolean {
  return engaged(unitModels(s, unitId), enemyModels(s, unitId));
}

/** Pulgadas que puede mover cada miniatura de la unidad con ese tipo de movimiento. */
export function allowance(s: GameState, unitId: string, move: UnitMove | undefined): number {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return 0;
  const M = DATASHEETS[u.datasheet].profile.M;
  if (!move) return M;
  return move.kind === "avanzar" ? M + (move.advance ?? 0) : M;
}

/** Desde dónde mide cada miniatura: su origen de la fase o, si no hay, su sitio actual. */
export function originOf(s: GameState, p: Piece): [number, number] {
  return s.turnLog.origins[p.id] ?? [p.x, p.z];
}

/** Lo que más ha movido una miniatura de la unidad (pulgadas). */
export function movedSoFar(s: GameState, unitId: string): number {
  return Math.max(0, ...unitModels(s, unitId).map((p) => {
    const [ox, oz] = originOf(s, p);
    return Math.hypot(p.x - ox, p.z - oz);
  }));
}

/** Acerca el punto a su origen hasta que esté a `max` pulgadas o menos. */
export function clampToAllowance(origin: [number, number], x: number, z: number, max: number): [number, number] {
  const dx = x - origin[0], dz = z - origin[1], d = Math.hypot(dx, dz);
  if (d <= max || d < 1e-9) return [x, z];
  const k = max / d;
  return [origin[0] + dx * k, origin[1] + dz * k];
}

export interface MoveCheck {
  /** Movimientos ya ajustados a lo permitido. */
  moves: PieceMove[];
  /** Miniaturas que no pueden acabar donde se soltaron (a 1" de un enemigo): vuelven a su sitio. */
  rejected: string[];
  /** Motivo para enseñar al jugador, si algo se ajustó o rechazó. */
  message: string | null;
}

/**
 * Ajusta un movimiento de la fase de movimiento:
 *  - cada miniatura, como mucho a su asignación de su origen;
 *  - ninguna acaba a 1" o menos de un enemigo (si pasa, vuelve a donde estaba).
 */
export function checkMove(s: GameState, unitId: string, moves: PieceMove[], move: UnitMove): MoveCheck {
  const max = allowance(s, unitId, move);
  const enemies = enemyModels(s, unitId);
  const byId = new Map(s.pieces.map((p) => [p.id, p]));
  const out: PieceMove[] = [];
  const rejected: string[] = [];
  let clamped = false;
  for (const m of moves) {
    const p = byId.get(m.id);
    if (!p) continue;
    const [cx, cz] = clampToAllowance(originOf(s, p), m.x, m.z, max + 1e-6);
    if (Math.hypot(cx - m.x, cz - m.z) > 0.01) clamped = true;
    const r = BASE_RADIUS[p.model];
    const tooClose = enemies.some((e) => gap({ x: cx, z: cz, r }, disc(e)) <= ENGAGEMENT + 1e-6);
    if (tooClose) { rejected.push(m.id); continue; }
    out.push({ ...m, x: Math.round(cx * 100) / 100, z: Math.round(cz * 100) / 100 });
  }
  let message: string | null = null;
  if (rejected.length) message = `No se puede acabar a 1" de un enemigo (${rejected.length === 1 ? "1 miniatura vuelve" : `${rejected.length} vuelven`} a su sitio).`;
  else if (clamped) message = `Hasta ${fmt(max)} desde donde empezó la fase.`;
  return { moves: out, rejected, message };
}

/** ¿Puede esta unidad disparar este turno según cómo movió? (Asalto permite tras avanzar) */
export function canShootAfter(move: UnitMove | undefined, weaponIsAssault: boolean): boolean {
  if (!move) return true;
  if (move.kind === "retirarse") return false;
  if (move.kind === "avanzar") return weaponIsAssault;
  return true;
}

/** ¿Puede cargar? No tras retirarse; tras avanzar solo con Rapidez. */
export function canChargeAfter(move: UnitMove | undefined, rapid: boolean): boolean {
  if (!move) return true;
  if (move.kind === "retirarse") return false;
  if (move.kind === "avanzar") return rapid;
  return true;
}

const fmt = (v: number) => `${(Math.round(v * 10) / 10).toString().replace(".", ",")}"`;
