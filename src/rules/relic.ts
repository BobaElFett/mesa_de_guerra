import { BASE_RADIUS, GameState, PLAYERS } from "../core/state";
import { gap, onForbiddenTerrain } from "./geometry";
import { note, unitName } from "./history";
import type { Objective } from "./missions";

// Misión Reliquia (#64): la reliquia es un objetivo que se puede llevar.
//  - La recoge una unidad del jugador activo que acaba con una miniatura a 1" o menos de ella
//    (borde con borde), si no hay una miniatura enemiga igual de cerca. Las bestias y vehículos
//    grandes (peana de más de 1,4" de radio) no pueden llevarla.
//  - Va con la primera miniatura de la unidad; si la unidad muere, cae donde estaba.
//  - Quien la lleva la controla (para puntuar y para la IA), aunque esté desmoralizado.

export const PICK_RANGE = 1;
export const RELIC_R = 0.79;
const MAX_CARRIER_R = 1.4;

export function relicOf(s: GameState): Objective | undefined {
  return (s.objectives ?? []).find((o) => o.relic);
}

export function canCarry(s: GameState, unitId: string): boolean {
  const p = s.pieces.find((q) => q.unit === unitId);
  const u = s.units.find((x) => x.id === unitId);
  return !!p && !!u && !u.reserve && BASE_RADIUS[p.model] <= MAX_CARRIER_R;
}

/** Tras cada orden: la reliquia sigue a quien la lleva, cae si muere y se recoge si toca. Muta `s`. */
export function syncRelic(s: GameState) {
  const o = relicOf(s);
  if (!o) return;
  if (o.carrier) {
    const p = s.pieces.find((q) => q.unit === o.carrier);
    if (p) { o.x = p.x; o.z = p.z; return; }
    if (s.rulesMode) note(s, "pv", `La reliquia cae al suelo: ${unitName(s, o.carrier)} ya no puede llevarla`);
    o.carrier = null;
    return;
  }
  // En el suelo tiene que poder alcanzarse: fuera de la escenografía sólida (con sitio para una peana)
  if (onForbiddenTerrain(s.terrain, o.x, o.z, RELIC_R + 1.6)) {
    const spot = freeSpot(s, o.x, o.z);
    o.x = spot.x; o.z = spot.z;
  }
  if (!s.rulesMode || s.phase === "despliegue" || s.gameOver) return;
  const marker = { x: o.x, z: o.z, r: RELIC_R };
  const near = (f: string) => s.pieces
    .filter((p) => p.unit && p.faction === f && gap({ x: p.x, z: p.z, r: BASE_RADIUS[p.model] }, marker) <= PICK_RANGE + 1e-6)
    .sort((a, b) => gap({ x: a.x, z: a.z, r: BASE_RADIUS[a.model] }, marker) - gap({ x: b.x, z: b.z, r: BASE_RADIUS[b.model] }, marker));
  const me = PLAYERS[s.active], foe = me === "legion" ? "swarm" : "legion";
  if (near(foe).length) return;
  const p = near(me).find((q) => canCarry(s, q.unit!));
  if (!p) return;
  o.carrier = p.unit!;
  o.x = p.x; o.z = p.z;
  note(s, "pv", `${unitName(s, p.unit!)} recoge la reliquia`, s.active);
}

/**
 * El punto libre más cercano a lo largo de la línea central (mismo z): en un mapa simétrico
 * respecto al centro, queda a la misma distancia de los dos bandos.
 */
function freeSpot(s: GameState, x: number, z: number): { x: number; z: number } {
  for (let r = 0.5; r < 22; r += 0.25) {
    for (const nx of [x + r, x - r]) {
      if (!onForbiddenTerrain(s.terrain, nx, z, RELIC_R + 1.6)) return { x: nx, z };
    }
  }
  return { x, z };
}
