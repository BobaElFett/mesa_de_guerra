import { unitCost as costOf } from "../rules/datasheets";
import { conditionHitMod } from "../rules/conditions";
import { pieceWeaponIds } from "../rules/datasheets";
import { BASE_RADIUS, GameState, Piece } from "../core/state";
import { abilityX, DATASHEETS, Dice, hasAbility, unitPoints, Weapon, WEAPONS } from "../rules/datasheets";
import { saveTarget, woundTarget } from "../rules/attack";
import { disc, gap } from "../rules/geometry";
import { OBJECTIVE_RADIUS, OBJECTIVE_RANGE, objectiveStatus } from "../rules/missions";
import { underCommand } from "../rules/leaders";

// Cuentas de la IA (#37): valor esperado de un ataque, valor de una unidad y amenazas.
// Todo es determinista y no toca el estado.

export const avgDice = (d: Dice): number => (typeof d === "number" ? d : d === "D3" ? 2 : 3.5);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp1 = (v: number) => clamp(v, -1, 1);

/** Probabilidad de sacar `need`+ en 1D6 (el 1 siempre falla, el 6 siempre pasa). */
export const pD6 = (need: number) => (7 - clamp(need, 2, 6)) / 6;

/** Probabilidad de sacar `need` o más con 2D6. */
export function p2D6(need: number): number {
  if (need <= 2) return 1;
  if (need > 12) return 0;
  let ok = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= need) ok++;
  return ok / 36;
}

export interface AttackContext {
  distance?: number;
  stationary?: boolean;
  cover?: boolean;
  hitMod?: number;
  woundMod?: number;
  rerollHitOnes?: boolean;
  /** Fuego defensivo: solo impactan los 6. */
  onlySixes?: boolean;
  /** Heridas mortales: sin tirada para herir ni salvación. */
  mortal?: boolean;
}

/**
 * Daño esperado (heridas que se quitan) de `attackers` miniaturas con `weapon` contra la unidad
 * `targetId`, sin pasarse de las heridas que le quedan. También devuelve las bajas esperadas.
 */
export function expectedAttack(s: GameState, weapon: Weapon, attackers: number, targetId: string, ctx: AttackContext = {}): { damage: number; kills: number } {
  const u = s.units.find((x) => x.id === targetId);
  const models = s.pieces.filter((p) => p.unit === targetId);
  if (!u || !models.length || attackers <= 0) return { damage: 0, kills: 0 };
  const ds = DATASHEETS[u.datasheet], P = ds.profile;
  const range = typeof weapon.range === "number" ? weapon.range : 0;
  let perModel = avgDice(weapon.attacks);
  if (hasAbility(weapon, "rafaga") && ctx.distance !== undefined && range > 0 && ctx.distance <= range / 2) perModel += abilityX(weapon, "rafaga");
  if (hasAbility(weapon, "explosiva")) perModel += Math.floor(models.length / 5);
  const attacks = perModel * attackers;

  let hits: number, crits: number;
  if (hasAbility(weapon, "torrente") || weapon.skill === null) { hits = attacks; crits = 0; }
  else {
    const storm = !ctx.onlySixes && !ctx.mortal && range > 0 ? conditionHitMod(s, ctx.distance) : 0;
    const mod = clamp1((ctx.hitMod ?? 0) + storm + (hasAbility(weapon, "pesada") && ctx.stationary ? 1 : 0));
    let p = ctx.onlySixes ? 1 / 6 : pD6(weapon.skill - mod);
    if (ctx.rerollHitOnes && !ctx.onlySixes) p += p / 6;
    hits = attacks * p;
    crits = attacks * (1 / 6) * (ctx.rerollHitOnes ? 7 / 6 : 1);
    if (hasAbility(weapon, "sostenida")) hits += crits * abilityX(weapon, "sostenida");
  }
  const lethal = hasAbility(weapon, "letal") ? crits : 0;
  const pw = pD6(woundTarget(weapon.strength, P.T) - clamp1(ctx.woundMod ?? 0));
  const wounds = ctx.mortal ? hits : lethal + (hits - lethal) * pw;
  const sv = ctx.mortal ? null : saveTarget(P, weapon.ap, !!ctx.cover);
  const pFail = sv === null ? 1 : (clamp(sv, 2, 7) - 1) / 6;
  const devastating = hasAbility(weapon, "devastadora") ? (hits - lethal) * (1 / 6) : 0;
  const unsaved = devastating + (wounds - devastating) * pFail;
  let dmg = avgDice(weapon.damage);
  if (ds.abilities.includes("blindado")) dmg = Math.max(1, dmg - 1);
  const perWound = Math.min(dmg, P.W);
  const left = models.reduce((n, p) => n + P.W - (p.damage ?? 0), 0);
  const damage = Math.min(left, unsaved * perWound);
  // Bajas: con H 1 cada herida es una baja; si no, el daño se reparte miniatura a miniatura
  const kills = P.W === 1 ? Math.min(models.length, unsaved) : Math.min(models.length, damage / P.W);
  return { damage, kills };
}

/** Puntos de la unidad (por su tamaño inicial). */
export function unitCost(s: GameState, unitId: string): number {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return 0;
  return costOf(u);
}

/** Heridas que le quedan a la unidad. */
export function woundsLeft(s: GameState, unitId: string): number {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return 0;
  const W = DATASHEETS[u.datasheet].profile.W;
  return s.pieces.filter((p) => p.unit === unitId).reduce((n, p) => n + W - (p.damage ?? 0), 0);
}

/** Valor en puntos de cada herida de la unidad. */
export function pointsPerWound(s: GameState, unitId: string): number {
  const u = s.units.find((x) => x.id === unitId)!;
  return unitCost(s, unitId) / (u.startingModels * DATASHEETS[u.datasheet].profile.W);
}

/** ¿Cuánto CO aporta la unidad a objetivos que está disputando? (para priorizar objetivos) */
export function objectivePresence(s: GameState, unitId: string): number {
  const models = s.pieces.filter((p) => p.unit === unitId);
  let n = 0;
  for (const o of s.objectives ?? []) {
    if (models.some((p) => gap(disc(p), { x: o.x, z: o.z, r: OBJECTIVE_RADIUS }) <= OBJECTIVE_RANGE)) n += o.vp;
  }
  return n;
}

/**
 * Valor (en puntos) de un ataque esperado: heridas × puntos por herida, más un extra si
 * acaba con la unidad o si la unidad está en un objetivo.
 */
export function attackValue(s: GameState, targetId: string, exp: { damage: number }, killBonus = 0): number {
  if (exp.damage <= 0) return 0;
  const left = woundsLeft(s, targetId);
  let v = exp.damage * pointsPerWound(s, targetId);
  if (left > 0 && exp.damage >= left * 0.9) v += unitCost(s, targetId) * 0.15 + killBonus;
  const onObj = objectivePresence(s, targetId);
  if (onObj > 0) v *= 1 + Math.min(0.6, onObj / 12);
  // Las unidades con mucho daño propio son más peligrosas
  return v * (1 + threatOf(s, targetId) / 400);
}

/** Daño en cuerpo a cuerpo esperado de la unidad contra `targetId` (todas sus miniaturas). */
export function meleeExpected(s: GameState, unitId: string, targetId: string, frac = 0.85, hitMod = 0): { damage: number; kills: number } {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return { damage: 0, kills: 0 };
  const ds = DATASHEETS[u.datasheet];
  const models = s.pieces.filter((p) => p.unit === unitId);
  const byWeapon = new Map<string, number>();
  for (const p of models) {
    const ids = pieceWeaponIds(ds, p);
    const w = ids.map((id) => WEAPONS[id]).find((x) => x.range === "CC");
    if (w) byWeapon.set(w.id, (byWeapon.get(w.id) ?? 0) + 1);
  }
  let damage = 0, kills = 0;
  const reroll = underCommand(s, unitId);
  for (const [wid, n] of byWeapon) {
    const e = expectedAttack(s, WEAPONS[wid], Math.max(1, Math.round(n * frac)), targetId, { hitMod, rerollHitOnes: reroll });
    damage += e.damage; kills += e.kills;
  }
  return { damage: Math.min(damage, woundsLeft(s, targetId)), kills };
}

/** Lo mejor que puede disparar la unidad (puntos por fase) contra cualquier enemigo, a cualquier distancia. */
export function threatOf(s: GameState, unitId: string): number {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return 0;
  const ds = DATASHEETS[u.datasheet];
  const n = s.pieces.filter((p) => p.unit === unitId).length;
  if (!n) return 0;
  // Fuerza bruta frente a un perfil medio: suma de ataques × fuerza × daño (escala aproximada)
  let t = 0;
  for (const id of ds.weapons) {
    const w = WEAPONS[id];
    t += avgDice(w.attacks) * n * (w.strength / 4) * avgDice(w.damage) * (1 - w.ap * 0.15) * (w.skill ? pD6(w.skill) : 1);
  }
  return t * 4;
}

/** Centro de un conjunto de miniaturas. */
export function centroid(models: Piece[]): { x: number; z: number } {
  const n = Math.max(1, models.length);
  return { x: models.reduce((a, p) => a + p.x, 0) / n, z: models.reduce((a, p) => a + p.z, 0) / n };
}

/** Menor distancia borde a borde entre dos grupos, con el primero desplazado (dx, dz). */
export function groupGap(a: Piece[], b: Piece[], dx = 0, dz = 0): number {
  let best = Infinity;
  for (const p of a) {
    const ra = BASE_RADIUS[p.model];
    for (const q of b) {
      const d = Math.hypot(p.x + dx - q.x, p.z + dz - q.z) - ra - BASE_RADIUS[q.model];
      if (d < best) best = d;
    }
  }
  return best;
}

/** CO de cada bando en un objetivo, sin contar las miniaturas de `exclude` (unidades). */
export function ocWithout(s: GameState, oIndex: number, exclude: Set<string>): [number, number] {
  const o = s.objectives![oIndex];
  const pieces = s.pieces.filter((p) => !p.unit || !exclude.has(p.unit));
  return objectiveStatus({ ...s, pieces }, o).oc;
}
