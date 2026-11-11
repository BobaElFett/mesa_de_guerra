import { Faction, GameState, Piece, PLAYERS } from "../core/state";
import { DATASHEETS } from "../rules/datasheets";
import { allowance } from "../rules/movement";
import { CENTRE_RANGE, inEnemyZone, quarterOf, SecondaryId, SECONDARIES } from "../rules/secondaries";
import { BOARD, DEPLOY_DEPTH } from "../core/state";

// La IA y los objetivos secundarios (#98): ir a por las órdenes de posición que tiene en la
// mano y descartar las que no puede cumplir.

const handOf = (s: GameState, f: Faction): SecondaryId[] => s.secondaries?.hand[PLAYERS.indexOf(f)] ?? [];

/** Miniaturas en mesa de unidades propias firmes, sin las de `exclude`. */
function others(s: GameState, f: Faction, exclude: Set<string>): Piece[] {
  const ok = new Set(s.units.filter((u) => u.faction === f && !u.shocked && !exclude.has(u.id)).map((u) => u.id));
  return s.pieces.filter((p) => p.unit && ok.has(p.unit));
}

/**
 * Lo que vale para las órdenes de posición dejar la formación en `models` (ya movida).
 * Solo cuenta si ninguna otra unidad propia la cumple ya.
 */
export function secondaryPositionScore(s: GameState, f: Faction, group: string[], models: Piece[], obj: number): { score: number; why: string } {
  const hand = handOf(s, f);
  if (!hand.length || !models.length) return { score: 0, why: "" };
  const shaken = group.some((id) => s.units.find((u) => u.id === id)?.shocked);
  if (shaken) return { score: 0, why: "" };
  const p = PLAYERS.indexOf(f) as 0 | 1;
  const rest = others(s, f, new Set(group));
  let score = 0, why = "";
  for (const id of hand) {
    const c = SECONDARIES[id];
    const k = c.vp * obj * 0.7;
    if (id === "centro") {
      if (rest.some((m) => Math.hypot(m.x, m.z) <= CENTRE_RANGE)) continue;
      const d = Math.min(...models.map((m) => Math.hypot(m.x, m.z)));
      if (d <= CENTRE_RANGE - 0.3) { score += k; why = c.name.toLowerCase(); }
      else score += k * 0.15 * Math.max(0, 1 - (d - CENTRE_RANGE) / 24);
    } else if (id === "lineas") {
      if (rest.some((m) => inEnemyZone(p, m.z))) continue;
      const edge = BOARD.d / 2 - DEPLOY_DEPTH;
      const d = Math.min(...models.map((m) => Math.max(0, edge - (p === 0 ? -m.z : m.z))));
      if (d <= 0.3) { score += k; why = c.name.toLowerCase(); }
      else score += k * 0.15 * Math.max(0, 1 - d / 24);
    } else if (id === "frentes") {
      const have = new Set(rest.map((m) => quarterOf(m.x, m.z)).filter((q) => q !== null));
      if (have.size >= 3) continue;
      const mine = new Set(models.map((m) => quarterOf(m.x, m.z)).filter((q) => q !== null && !have.has(q)));
      if (have.size === 2 && mine.size) { score += k; why = c.name.toLowerCase(); }
      else if (mine.size) score += k * 0.3;
    }
  }
  return { score, why };
}

/** ¿Qué orden de la mano descartaría la IA? Una que no pueda cumplir este turno ni el siguiente. */
export function pickDiscard(s: GameState): SecondaryId | null {
  const sec = s.secondaries;
  if (!sec) return null;
  const p = s.active, f = PLAYERS[p];
  const own = s.pieces.filter((m) => m.faction === f && m.unit);
  const foes = s.pieces.filter((m) => m.faction !== f && m.unit);
  const reach = (m: Piece) => { const u = s.units.find((x) => x.id === m.unit)!; return allowance(s, u.id, undefined) + 12 + (DATASHEETS[u.datasheet].abilities.includes("rapidez") ? 6 : 0); };
  const nearFoe = (pred: (unit: string) => boolean) => foes.some((e) => pred(e.unit!) && own.some((m) => Math.hypot(m.x - e.x, m.z - e.z) <= reach(m) + 12));
  const hopeless = (id: SecondaryId): boolean => {
    switch (id) {
      case "decapitar": return !nearFoe((u) => !!DATASHEETS[s.units.find((x) => x.id === u)!.datasheet].character);
      case "coloso": return !nearFoe((u) => !!DATASHEETS[s.units.find((x) => x.id === u)!.datasheet].big);
      case "masacre": return foes.length < 6 && s.turn >= 4;
      case "lineas": {
        const edge = BOARD.d / 2 - DEPLOY_DEPTH;
        return !own.some((m) => edge - (p === 0 ? -m.z : m.z) <= reach(m) - 6);
      }
      case "choque": return own.filter((m) => foes.some((e) => Math.hypot(m.x - e.x, m.z - e.z) <= 14)).length < 2;
      default: return false;
    }
  };
  return sec.hand[p].find(hopeless) ?? null;
}
