import { GameState } from "../core/state";
import { resolveOverlaps } from "../core/placement";
import { disc, engaged, gap, onForbiddenTerrain } from "./geometry";
import { note, unitName } from "./history";
import { formationModels } from "./leaders";
import { isEngaged, unitModels } from "./movement";

// Movimiento de oleada (11.ª, 21.02): algunas reglas dejan a una unidad lanzarse contra el enemigo
// más cercano fuera de su movimiento. Solo si no está desmoralizada, no está trabada y no ha movido
// en esta fase. Cada miniatura acaba trabada con ese enemigo si puede (si no, lo más cerca posible)
// y la unidad no puede acabar trabada con ninguna otra unidad enemiga. Después no mueve más en la fase.
//
// Aún ninguna hoja ni estratagema de Mesa de Guerra da un movimiento de oleada: quedan para las
// reglas de destacamento. Esto es el motor, con sus pruebas.

const CONTACT = 0.05;

/** Clave de la fase en el registro de oleadas. */
const key = (s: GameState, unitId: string) => `${s.turn}|${s.active}|${s.phase}|${unitId}`;

/** ¿Por qué no puede hacer ahora un movimiento de oleada? (null = puede) */
export function surgeBlocked(s: GameState, unitId: string): string | null {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || !unitModels(s, unitId).length) return "Unidad destruida.";
  if (u.shocked) return "Desmoralizada.";
  if (isEngaged(s, unitId)) return "Trabada en combate.";
  if ((s.surged ?? []).includes(key(s, unitId))) return "Ya ha hecho una oleada en esta fase.";
  if (s.phase === "movimiento" && s.turnLog.moves[unitId] && !s.turnLog.moves[unitId].arrived) return "Ya ha movido en esta fase.";
  if (!surgeTarget(s, unitId)) return "No hay enemigos.";
  return null;
}

/** La unidad enemiga más cercana: el objetivo de la oleada. */
export function surgeTarget(s: GameState, unitId: string): string | null {
  const u = s.units.find((x) => x.id === unitId);
  const mine = formationModels(s, unitId);
  if (!u || !mine.length) return null;
  let best: { id: string; d: number } | null = null;
  for (const e of s.units.filter((x) => x.faction !== u.faction)) {
    const theirs = unitModels(s, e.id);
    if (!theirs.length) continue;
    const d = Math.min(...mine.flatMap((a) => theirs.map((b) => gap(disc(a), disc(b)))));
    if (!best || d < best.d) best = { id: e.id, d };
  }
  return best?.id ?? null;
}

/** Hace la oleada de hasta `max` pulgadas (muta `s`). Devuelve el objetivo, o null si no pudo. */
export function surgeMove(s: GameState, unitId: string, max: number): string | null {
  if (surgeBlocked(s, unitId)) return null;
  const target = surgeTarget(s, unitId)!;
  const theirs = unitModels(s, target);
  const models = formationModels(s, unitId)
    .map((p) => ({ p, d: Math.min(...theirs.map((q) => gap(disc(p), disc(q)))) }))
    .sort((a, b) => a.d - b.d || (a.p.id < b.p.id ? -1 : 1));
  const moves = models.map(({ p, d }) => {
    const q = theirs.reduce((b, x) => (gap(disc(p), disc(x)) < gap(disc(p), disc(b)) ? x : b), theirs[0]);
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
    const travel = Math.min(max, Math.max(0, d - CONTACT));
    return { id: p.id, x: p.x + (dx / len) * travel, z: p.z + (dz / len) * travel };
  });
  const fixed = resolveOverlaps(s.pieces, moves, { blocked: (x, z, r) => onForbiddenTerrain(s.terrain, x, z, r + 0.05) !== null });
  // Nadie acaba trabado con otra unidad enemiga: esas miniaturas se quedan donde estaban
  const others = s.pieces.filter((e) => e.faction !== models[0]?.p.faction && e.unit && e.unit !== target);
  const at = new Map(fixed.map((m) => [m.id, m]));
  for (const p of s.pieces) {
    const m = at.get(p.id);
    if (!m) continue;
    const moved = { ...p, x: m.x, z: m.z };
    if (others.length && engaged([moved], others)) continue;
    p.x = m.x; p.z = m.z;
  }
  s.surged = [...(s.surged ?? []), key(s, unitId)];
  note(s, "mover", `${unitName(s, unitId)} se lanza en oleada (hasta ${max}") contra ${unitName(s, target)}`);
  return target;
}
