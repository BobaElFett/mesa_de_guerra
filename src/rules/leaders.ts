import type { GameState, Piece } from "../core/state";
import { DATASHEETS } from "./datasheets";

// Líderes unidos a escuadras (#32): un personaje que lidera una escuadra se mueve, carga y
// se selecciona con ella; no se le puede disparar mientras quede alguien de la escuadra, y
// con Al mando la formación repite los 1 al impactar. Si una de las dos cae, la otra sigue sola.

const alive = (s: GameState, id: string) => s.pieces.some((p) => p.unit === id);

/** La otra unidad de la formación (líder ↔ escuadra), si las dos siguen en la mesa. */
export function partnerOf(s: GameState, unitId: string): string | null {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || !alive(s, unitId)) return null;
  if (u.attachedTo) return alive(s, u.attachedTo) ? u.attachedTo : null;
  const leader = s.units.find((x) => x.attachedTo === unitId && alive(s, x.id));
  return leader ? leader.id : null;
}

/** Unidades de la formación: primero la escuadra, luego el líder (o solo la unidad). */
export function formation(s: GameState, unitId: string): string[] {
  const other = partnerOf(s, unitId);
  if (!other) return [unitId];
  const u = s.units.find((x) => x.id === unitId)!;
  return u.attachedTo ? [other, unitId] : [unitId, other];
}

export function formationModels(s: GameState, unitId: string): Piece[] {
  const ids = new Set(formation(s, unitId));
  return s.pieces.filter((p) => p.unit && ids.has(p.unit));
}

/** ¿Es un líder unido a una escuadra que todavía tiene miniaturas? (no se le puede disparar) */
export function isGuarded(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  return !!u?.attachedTo && partnerOf(s, unitId) !== null;
}

/** ¿Hay un líder con Al mando en la formación de esta unidad? (repite los 1 al impactar) */
export function underCommand(s: GameState, unitId: string): boolean {
  return formation(s, unitId).some((id) => {
    const u = s.units.find((x) => x.id === id)!;
    return DATASHEETS[u.datasheet].abilities.includes("alMando") && (id !== unitId || partnerOf(s, id) !== null);
  });
}
