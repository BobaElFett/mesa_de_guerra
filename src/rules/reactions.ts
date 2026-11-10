import { pieceWeaponIds } from "./datasheets";
import { note, unitName } from "./history";
import { GameState, PLAYERS } from "../core/state";
import { DATASHEETS, WEAPONS } from "./datasheets";
import { disc, gap } from "./geometry";
import { isEngaged, unitModels } from "./movement";
import { performAttack } from "./shooting";
import { applyCharge } from "./melee";

// Fuego defensivo (#50): cuando una unidad declara una carga, el defensor puede gastar 1 PM
// para que la unidad cargada dispare a la que carga, impactando solo con 6 (Torrente impacta
// igual). Una vez por turno. La carga queda en espera hasta que el defensor decide.

export const OVERWATCH_COST = 1;

export interface PendingCharge { unit: string; target: string; defender: 0 | 1 }

/** Armas a distancia de la unidad que alcanzan a la que carga, con cuántas miniaturas. */
export function overwatchWeapons(s: GameState, targetId: string, chargerId: string) {
  const t = s.units.find((u) => u.id === targetId);
  if (!t) return [];
  const ds = DATASHEETS[t.datasheet];
  const chargers = unitModels(s, chargerId);
  const byW = new Map<string, string[]>();
  for (const p of unitModels(s, targetId)) {
    const ids = pieceWeaponIds(ds, p);
    for (const wid of ids) {
      const w = WEAPONS[wid];
      if (w.range === "CC") continue;
      const d = Math.min(...chargers.map((q) => gap(disc(p), disc(q))));
      if (d > w.range) continue;
      byW.set(wid, [...(byW.get(wid) ?? []), p.id]);
    }
  }
  return [...byW].map(([wid, ids]) => ({ weapon: WEAPONS[wid], shooters: ids }));
}

/** ¿Puede el defensor responder a esta carga con fuego defensivo? (motivo si no) */
export function overwatchBlocked(s: GameState, chargerId: string, targetId: string): string | null {
  const t = s.units.find((u) => u.id === targetId);
  if (!s.rulesMode || !t) return "—";
  const def = PLAYERS.indexOf(t.faction) as 0 | 1;
  if (def === s.active) return "Es su turno.";
  if (s.cp[def] < OVERWATCH_COST) return "Sin PM.";
  if ((s.turnLog.strats ?? []).some((x) => x.id === "fuegoDefensivo")) return "Ya se ha usado este turno.";
  if (t.shocked) return "Desmoralizada.";
  if (isEngaged(s, targetId)) return "Trabada en combate.";
  if (!overwatchWeapons(s, targetId, chargerId).length) return "Sin armas a distancia que lleguen.";
  return null;
}

/** La orden de carga: si el defensor puede responder, la deja en espera; si no, se resuelve. */
export function declareCharge(s: GameState, unit: string, target: string) {
  if (s.pendingCharge) return;
  if (!overwatchBlocked(s, unit, target)) {
    const t = s.units.find((u) => u.id === target)!;
    s.pendingCharge = { unit, target, defender: PLAYERS.indexOf(t.faction) as 0 | 1 };
    return;
  }
  applyCharge(s, unit, target);
}

/** El defensor decide; luego se tira la carga. */
export function resolveReaction(s: GameState, fire: boolean) {
  const pc = s.pendingCharge;
  if (!pc) return;
  s.pendingCharge = null;
  if (fire && !overwatchBlocked(s, pc.unit, pc.target)) {
    s.cp = [...s.cp] as [number, number];
    s.cp[pc.defender] -= OVERWATCH_COST;
    s.turnLog.strats = [...(s.turnLog.strats ?? []), { id: "fuegoDefensivo", unit: pc.target }];
    note(s, "estratagema", `Fuego defensivo (1 PM) de ${unitName(s, pc.target)} contra la carga`, pc.defender);
    for (const { weapon, shooters } of overwatchWeapons(s, pc.target, pc.unit)) {
      if (!s.pieces.some((p) => p.unit === pc.unit)) break;
      const models = s.pieces.filter((p) => shooters.includes(p.id));
      if (!models.length) continue;
      const d = Math.min(...models.flatMap((a) => unitModels(s, pc.unit).map((b) => gap(disc(a), disc(b)))));
      performAttack(s, "disparo", pc.target, models, weapon, pc.unit, { distance: d, overwatch: true });
    }
  }
  if (s.pieces.some((p) => p.unit === pc.unit)) applyCharge(s, pc.unit, pc.target);
}
