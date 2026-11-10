import { GameState, PLAYERS } from "../core/state";
import { rollDice } from "../core/rng";
import { DATASHEETS, WEAPONS } from "./datasheets";
import { disc, gap, sight } from "./geometry";
import { note, unitName } from "./history";
import { recordCasualties } from "./missions";
import { isEngaged, unitModels } from "./movement";
import { performAttack } from "./shooting";
import { recordDamage } from "./stats";

// Poderes psíquicos (#78): una vez por turno, en el disparo, un psíquico elige un enemigo
// visible a 18". 2D6: con 7 o más, D3 heridas mortales (sin salvación). Con doble 1 o doble 6,
// el psíquico sufre 1 herida mortal (peligros de la disformidad), salga o no el poder.

export const PSYCHIC_RANGE = 18;
export const PSYCHIC_NEED = 7;

export function isPsyker(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  return !!u && DATASHEETS[u.datasheet].abilities.includes("psiquico");
}

/** El poder de cada psíquico (un arma «de mentira» que se resuelve como heridas mortales). */
export function powerOf(s: GameState, unitId: string) {
  const u = s.units.find((x) => x.id === unitId)!;
  return u.faction === "legion" ? WEAPONS.rayoMental : WEAPONS.gritoPsiquico;
}

export function psychicTargets(s: GameState, unitId: string): string[] {
  const mine = unitModels(s, unitId), u = s.units.find((x) => x.id === unitId);
  if (!u || !mine.length) return [];
  return s.units.filter((e) => e.faction !== u.faction && s.pieces.some((p) => p.unit === e.id)).filter((e) => {
    const theirs = unitModels(s, e.id);
    return mine.some((a) => theirs.some((b) => gap(disc(a), disc(b)) <= PSYCHIC_RANGE + 1e-6 && sight(disc(a), disc(b), s.terrain) !== "oculta"));
  }).map((e) => e.id);
}

/** Por qué no puede usar su poder ahora (o null). */
export function psychicBlocked(s: GameState, unitId: string): string | null {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || !isPsyker(s, unitId)) return "No es psíquico.";
  if (!s.rulesMode || s.phase !== "disparo") return "Solo en la fase de disparo.";
  if (PLAYERS[s.active] !== u.faction) return "No es su turno.";
  if ((s.turnLog.psychic ?? []).some((x) => x.unit === unitId)) return "Ya ha usado su poder este turno.";
  if (isEngaged(s, unitId)) return "Trabado en combate.";
  if (!psychicTargets(s, unitId).length) return `Ningún enemigo visible a ${PSYCHIC_RANGE}" o menos.`;
  return null;
}

/** Usa el poder contra `target`. Muta `s`. */
export function applyPsychic(s: GameState, unitId: string, target: string): boolean {
  if (psychicBlocked(s, unitId) || !psychicTargets(s, unitId).includes(target)) return false;
  const [[a, b], rng] = rollDice(s.rng, 2, 6);
  s.rng = rng;
  const roll: [number, number] = [a, b];
  s.turnLog = { ...s.turnLog, psychic: [...(s.turnLog.psychic ?? []), { unit: unitId, roll, target }] };
  const power = powerOf(s, unitId);
  const ok = a + b >= PSYCHIC_NEED;
  note(s, "disparo", `${unitName(s, unitId)} usa ${power.name} contra ${unitName(s, target)}: 2D6 = ${a}+${b} = ${a + b}${ok ? "" : ` (necesita ${PSYCHIC_NEED}): no sale`}`);
  if (ok) {
    const caster = unitModels(s, unitId)[0], theirs = unitModels(s, target);
    const d = Math.min(...theirs.map((q) => gap(disc(caster), disc(q))));
    performAttack(s, "disparo", unitId, [caster], power, target, { distance: d, mortal: true });
  }
  if (a === b && (a === 1 || a === 6)) perils(s, unitId);
  return true;
}

/** Peligros de la disformidad: 1 herida mortal al psíquico. */
function perils(s: GameState, unitId: string) {
  const p = unitModels(s, unitId)[0];
  if (!p) return;
  const u = s.units.find((x) => x.id === unitId)!;
  const W = DATASHEETS[u.datasheet].profile.W;
  const dead = (p.damage ?? 0) + 1 >= W;
  note(s, "baja", `Peligros de la disformidad: ${unitName(s, unitId)} sufre 1 herida mortal${dead ? " y cae" : ""}`);
  recordDamage(s, null, unitId, 1, dead ? 1 : 0);
  if (dead) {
    s.pieces = s.pieces.filter((q) => q.id !== p.id);
    recordCasualties(s, (1 - PLAYERS.indexOf(u.faction)) as 0 | 1, unitId, 1);
  } else {
    s.pieces = s.pieces.map((q) => (q.id === p.id ? { ...q, damage: (q.damage ?? 0) + 1 } : q));
  }
}
