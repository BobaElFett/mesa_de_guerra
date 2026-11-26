import { crossesSolid, onForbiddenTerrain } from "./geometry";
import { formation } from "./leaders";
import { BASE_RADIUS, GameState, Piece, TERRAIN } from "../core/state";
import type { PieceMove } from "../core/commands";
import { DATASHEETS } from "./datasheets";
import { ENGAGEMENT, engaged } from "./geometry";
import { resolveOverlaps } from "../core/placement";

// Fase de movimiento del reglamento: mover hasta M, avanzar (M + D6) o retirarse.
// Distancia en línea recta desde donde empezó la fase (simplificación: el camino no cuenta).

export type MoveKind = "normal" | "avanzar" | "retirarse";

export interface UnitMove {
  kind: MoveKind;
  /** D6 del avance. */
  advance?: number;
  /** Acaba de llegar desde la reserva: ya no mueve este turno (#56). */
  arrived?: boolean;
  /** 11.ª: «surca los cielos» (unidad con Vuelo): −2" al máximo, pasa por encima de todo. */
  fly?: boolean;
}

/** Registro del turno en curso: qué hizo cada unidad y desde dónde empezó a mover cada miniatura. */
export interface TurnLog {
  moves: Record<string, UnitMove>;
  origins: Record<string, [number, number]>;
  /** Armas con las que ya ha disparado cada unidad este turno. */
  shot?: Record<string, string[]>;
  /** Cargas declaradas este turno (una por unidad). */
  charges?: Record<string, { target: string; roll: number; need: number; success: boolean }>;
  /** Unidades que ya han combatido en esta fase de combate. */
  fought?: string[];
  /** Estratagemas usadas este turno. */
  strats?: { id: string; unit: string; phase?: string }[];
  /** Psíquicos que ya han usado su poder (#78), con la tirada. */
  psychic?: { unit: string; roll: [number, number]; target: string }[];
  /** Combate (11.ª): jugador al que le toca elegir la siguiente unidad que combate. */
  counter?: string;
  /** Ventanas de reacción ya cerradas este turno. */
  reacted?: string[];
  /** Cortina de humo: unidades en cobertura contra todo esta fase. */
  smoke?: string[];
  fightPick?: number;
  /** Guardia de la hoja (11.ª): unidad → la unidad enemiga contra la que ya la ha usado para defenderse. */
  guarded?: Record<string, string>;
}

export const emptyTurnLog = (): TurnLog => ({ moves: {}, origins: {} });

export function unitModels(s: GameState, unitId: string): Piece[] {
  return s.pieces.filter((p) => p.unit === unitId);
}

export function enemyModels(s: GameState, unitId: string): Piece[] {
  const u = s.units.find((x) => x.id === unitId);
  return u ? s.pieces.filter((p) => p.faction !== u.faction) : [];
}

/** ¿Está la unidad trabada (a 2" de alguna enemiga)? */
export function isEngaged(s: GameState, unitId: string): boolean {
  return engaged(unitModels(s, unitId), enemyModels(s, unitId));
}

/** Pulgadas que puede mover cada miniatura de la unidad con ese tipo de movimiento. */
export function allowance(s: GameState, unitId: string, move: UnitMove | undefined): number {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return 0;
  const M = Math.min(...formation(s, unitId).map((id) => DATASHEETS[s.units.find((x) => x.id === id)!.datasheet].profile.M));
  if (!move) return M;
  if (move.arrived) return 0;
  return Math.max(0, (move.kind === "avanzar" ? M + (move.advance ?? 0) : M) - (move.fly ? FLY_PENALTY : 0));
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
  /** Miniaturas que no pueden acabar donde se soltaron (a 2" de un enemigo): vuelven a su sitio. */
  rejected: string[];
  /** Motivo para enseñar al jugador, si algo se ajustó o rechazó. */
  message: string | null;
}

/**
 * Ajusta un movimiento de la fase de movimiento:
 *  - cada miniatura, como mucho a su asignación de su origen;
 *  - ninguna acaba a 2" o menos de un enemigo (si pasa, vuelve a donde estaba).
 */
/** Vuelo (#104): la unidad puede surcar los cielos (todas sus miniaturas tienen Vuelo). */
export function flies(s: GameState, unitId: string | undefined): boolean {
  const u = unitId ? s.units.find((x) => x.id === unitId) : undefined;
  return !!u && formation(s, u.id).every((id) => DATASHEETS[s.units.find((x) => x.id === id)!.datasheet].abilities.includes("vuelo"));
}

/** 11.ª: surcar los cielos resta 2" al movimiento. */
export const FLY_PENALTY = 2;

/** ¿Este movimiento va por el aire? (lo declaró al elegir cómo mueve) */
export const airborne = (s: GameState, unitId: string) => !!s.turnLog.moves[unitId]?.fly;

const bigType = (s: GameState, unitId?: string) => {
  const u = unitId ? s.units.find((x) => x.id === unitId) : undefined;
  const t = u ? DATASHEETS[u.datasheet].type : undefined;
  return t === "monstruo" || t === "vehiculo";
};

/** Distancia de un punto a un segmento. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/**
 * Miniatura enemiga que la peana de `p` atravesaría yendo en línea recta a (x, z), o null (11.ª):
 * no se pasa a través de enemigos; los monstruos y vehículos (al mover o avanzar) sí, salvo a
 * través de otros monstruos y vehículos; la huida desesperada y el vuelo, a través de todo.
 */
export function crossesEnemy(s: GameState, p: Piece, x: number, z: number, move: UnitMove | undefined): Piece | null {
  return blockersOnPath(s, p, x, z, move)[0] ?? null;
}

/** Enemigos que se interponen en el camino recto de `p` a (x, z), con dónde se toparía (0–1). */
function blockersOnPath(s: GameState, p: Piece, x: number, z: number, move: UnitMove | undefined): (Piece & { at?: number })[] {
  if (move?.fly) return [];
  const u = s.units.find((q) => q.id === p.unit);
  if (!u) return [];
  if (move?.kind === "retirarse" && u.shocked) return [];                // huida desesperada
  const big = bigType(s, p.unit) && move?.kind !== "retirarse";
  const r = BASE_RADIUS[p.model];
  const out: (Piece & { at: number })[] = [];
  const vx = x - p.x, vz = z - p.z, vv = vx * vx + vz * vz;
  for (const e of s.pieces) {
    if (e.faction === p.faction || !e.unit) continue;
    if (big && !bigType(s, e.unit)) continue;
    const R = r + BASE_RADIUS[e.model] - 0.05;
    // Las peanas se pisarían en algún punto del camino (sin contar donde ya estaba)
    if (Math.hypot(e.x - p.x, e.z - p.z) < R) continue;
    if (segDist(e.x, e.z, p.x, p.z, x, z) >= R) continue;
    const wx = e.x - p.x, wz = e.z - p.z, b = vx * wx + vz * wz, c = wx * wx + wz * wz - R * R;
    const at = vv < 1e-9 ? 0 : Math.max(0, (b - Math.sqrt(Math.max(0, b * b - vv * c))) / vv);
    out.push({ ...e, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

export function checkMove(s: GameState, unitId: string, moves: PieceMove[], move: UnitMove): MoveCheck {
  move = move ?? { kind: "normal" };                // la sugerencia comprueba sin haberlo declarado
  const max = allowance(s, unitId, move);
  const enemies = enemyModels(s, unitId).map((e) => ({ x: e.x, z: e.z, r: BASE_RADIUS[e.model] + ENGAGEMENT }));
  const byId = new Map(s.pieces.map((p) => [p.id, p]));
  let clamped = false;
  const wanted: PieceMove[] = [];
  const through: string[] = [];
  let wall: string | null = null, stopped = 0;
  for (const m of moves) {
    const p = byId.get(m.id);
    if (!p) continue;
    const [cx, cz] = clampToAllowance(originOf(s, p), m.x, m.z, max);
    if (Math.hypot(cx - m.x, cz - m.z) > 0.01) clamped = true;
    // No se atraviesan contenedores ni búnker (#49): el camino desde donde está ahora
    const t = move.fly ? null : crossesSolid(s.terrain, p.x, p.z, cx, cz, BASE_RADIUS[p.model]);
    if (t) { through.push(m.id); wall = TERRAIN[t.kind].name; continue; }
    // Ni a través de miniaturas enemigas (11.ª): se para donde toparía con la primera
    const hit = blockersOnPath(s, p, cx, cz, move)[0];
    if (hit) {
      const k = Math.max(0, (hit.at ?? 0) - 0.02);
      wanted.push({ ...m, x: p.x + (cx - p.x) * k, z: p.z + (cz - p.z) * k });
      stopped++;
      continue;
    }
    wanted.push({ ...m, x: cx, z: cz });
  }
  // Un solo paso de colocación con todas las condiciones: sin solapes, fuera del trabamiento
  // enemigo y dentro de la asignación. Lo que no cabe se queda donde estaba.
  const rejected: string[] = [];
  const placed = resolveOverlaps(s.pieces, wanted, {
    limit: (id) => { const p = byId.get(id)!; const [x, z] = originOf(s, p); return { x, z, max }; },
    avoid: () => enemies,
    blocked: (x, z, r) => onForbiddenTerrain(s.terrain, x, z, r + 0.05) !== null,
    rejected,
  });
  const out = placed.filter((m) => !rejected.includes(m.id));
  rejected.push(...through);
  let message: string | null = null;
  const back = `${through.length === 1 ? "1 miniatura vuelve" : `${through.length} vuelven`} a su sitio.`;
  const air = flies(s, unitId) ? " o vuela" : "";
  if (through.length && wall) message = `No se puede atravesar ${wall === "Búnker" ? "el búnker" : `los ${wall.toLowerCase()}`}: rodéalo (arrastra en dos tramos)${air}. ${back}`;
  else if (stopped) message = `No se puede pasar a través de miniaturas enemigas${bigType(s, unitId) ? " (los monstruos y vehículos solo a través de infantería)" : ""}: se para delante. Rodéalas${air}.`;
  else if (rejected.length) message = `No se puede acabar a 2" de un enemigo ni encima de otra miniatura (${rejected.length === 1 ? "1 miniatura vuelve" : `${rejected.length} vuelven`} a su sitio).`;
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
