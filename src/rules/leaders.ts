import type { GameState, Piece } from "../core/state";
import { nearAura } from "./auras";
import { DATASHEETS } from "./datasheets";

// Personajes unidos a escuadras (#32; 11.ª desde la fase 30): una escuadra puede llevar un líder y
// un personaje de apoyo. Se mueven, cargan y se seleccionan juntos; no se puede disparar a los
// personajes mientras quede alguien de la escuadra. Si la escuadra cae, cada personaje sigue solo.

const alive = (s: GameState, id: string) => s.pieces.some((p) => p.unit === id);

/** Unidades de la formación: primero la escuadra, luego el líder y el apoyo (o solo la unidad). */
export function formation(s: GameState, unitId: string): string[] {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || !alive(s, unitId)) return [unitId];
  const root = u.attachedTo && alive(s, u.attachedTo) ? u.attachedTo : unitId;
  const support = (id: string) => (DATASHEETS[s.units.find((x) => x.id === id)!.datasheet].support ? 1 : 0);
  const chars = s.units.filter((x) => x.attachedTo === root && x.id !== root && alive(s, x.id)).map((x) => x.id)
    .sort((a, b) => support(a) - support(b));
  return [root, ...chars];
}

/** Otra unidad de la formación: la escuadra si es un personaje; si es la escuadra, su líder. */
export function partnerOf(s: GameState, unitId: string): string | null {
  const f = formation(s, unitId);
  if (f.length < 2) return null;
  return f[0] === unitId ? f[1] : f[0];
}

export function formationModels(s: GameState, unitId: string): Piece[] {
  const ids = new Set(formation(s, unitId));
  return s.pieces.filter((p) => p.unit && ids.has(p.unit));
}

/** ¿Es un personaje unido a una escuadra que todavía tiene miniaturas? (no se le puede disparar) */
export function isGuarded(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  return !!u?.attachedTo && alive(s, unitId) && alive(s, u.attachedTo);
}

/** ¿Lidera la unidad (o la acompaña) un personaje con esta habilidad? */
export function ledBy(s: GameState, unitId: string, ability: string): boolean {
  return formation(s, unitId).some((id) => (DATASHEETS[s.units.find((x) => x.id === id)!.datasheet].abilities as string[]).includes(ability))
    && formation(s, unitId).length > 1;
}

/**
 * ¿Repite los 1 al impactar? Sabiduría de los antiguos (11.ª): infantería propia a 6" o menos de
 * un Andador de Combate.
 */
export function underCommand(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  return !!u && DATASHEETS[u.datasheet].type === "infanteria" && nearAura(s, unitId, "sabiduria");
}
