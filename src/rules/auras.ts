import { BASE_RADIUS, GameState } from "../core/state";
import { DATASHEETS, UnitAbility } from "./datasheets";

// Auras (#116, #117): reglas que afectan a las unidades propias cercanas a quien las tiene.

export const AURA_RANGE = 6;

/** ¿Tiene la unidad alguna miniatura a 6" o menos (borde a borde) de una miniatura propia con `ability`? */
export function nearAura(s: GameState, unitId: string, ability: UnitAbility): boolean {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return false;
  const sources = s.units.filter((x) => x.faction === u.faction && DATASHEETS[x.datasheet].abilities.includes(ability));
  if (!sources.length) return false;
  const src = s.pieces.filter((p) => p.unit && sources.some((x) => x.id === p.unit));
  if (!src.length) return false;
  const mine = s.pieces.filter((p) => p.unit === unitId);
  return mine.some((m) => src.some((a) => Math.hypot(a.x - m.x, a.z - m.z) - BASE_RADIUS[a.model] - BASE_RADIUS[m.model] <= AURA_RANGE + 1e-6));
}
