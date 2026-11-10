import { GameState } from "../core/state";
import { DATASHEETS, unitPoints } from "./datasheets";

// Estadísticas de la batalla (#65): por unidad, el daño que hace y recibe, las miniaturas que
// mata y pierde y los puntos que destruye. Se apuntan al resolver cada ataque.

export interface UnitStats { dmg: number; kills: number; pts: number; taken: number; lost: number }

const blank = (): UnitStats => ({ dmg: 0, kills: 0, pts: 0, taken: 0, lost: 0 });

/** Puntos que vale una miniatura de la unidad (según su tamaño inicial). */
export function modelPoints(s: GameState, unitId: string): number {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return 0;
  return (unitPoints(DATASHEETS[u.datasheet], u.startingModels) ?? 0) / u.startingModels;
}

/** Apunta un ataque de `by` (null: sin atacante, p. ej. reservas perdidas) contra `target`. */
export function recordDamage(s: GameState, by: string | null, target: string, dmg: number, slain: number) {
  if (dmg <= 0 && slain <= 0) return;
  const st = { ...(s.stats ?? {}) };
  const pts = modelPoints(s, target) * slain;
  if (by) {
    const a = { ...(st[by] ?? blank()) };
    a.dmg += dmg; a.kills += slain; a.pts += pts;
    st[by] = a;
  }
  const t = { ...(st[target] ?? blank()) };
  t.taken += dmg; t.lost += slain;
  st[target] = t;
  s.stats = st;
}

export function statsOf(s: GameState, unitId: string): UnitStats {
  return s.stats?.[unitId] ?? blank();
}

/** La unidad de la partida: la que más puntos ha destruido (desempata el daño). */
export function unitOfTheMatch(s: GameState): string | null {
  let best: string | null = null, key = 0;
  for (const [id, st] of Object.entries(s.stats ?? {})) {
    const k = st.pts * 1000 + st.dmg;
    if (k > key) { key = k; best = id; }
  }
  return best;
}
