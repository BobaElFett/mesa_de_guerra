import { onForbiddenTerrain } from "./geometry";
import { hasStrat } from "./stratagems";
import { formation, formationModels } from "./leaders";
import { GameState, Piece, PLAYERS } from "../core/state";
import { rollDice } from "../core/rng";
import { resolveOverlaps } from "../core/placement";
import { DATASHEETS, WEAPONS } from "./datasheets";
import { disc, engaged, gap, ENGAGEMENT } from "./geometry";
import { canChargeAfter, unitModels } from "./movement";
import { performAttack, AttackLogEntry } from "./shooting";

// Fases de carga y combate del reglamento.
//  - Carga: a 12" o menos de un enemigo, 2D6; si alcanza para quedar a 1", la unidad entra en contacto.
//  - Combate: primero las que cargaron; agruparse 3", golpear con armas CC, consolidar 3".
// Todo se resuelve dentro del estado con el RNG con semilla.

export const CHARGE_RANGE = 12;
export const PILE_IN = 3;
const CONTACT = 0.05;          // separación al quedar «en contacto» de peana
const SECOND_RANK = 0.5;       // segunda fila: a ½" de una amiga que está trabada

export interface ChargeRecord { target: string; roll: number; need: number; success: boolean }

const nearestGap = (a: Piece[], b: Piece[]) => Math.min(...a.flatMap((p) => b.map((q) => gap(disc(p), disc(q)))));

function foesOf(s: GameState, unitId: string): Piece[] {
  const u = s.units.find((x) => x.id === unitId);
  return u ? s.pieces.filter((p) => p.faction !== u.faction) : [];
}

// --- Carga ----------------------------------------------------------------------

export interface ChargeTarget { unit: string; name: string; distance: number; need: number; blocked?: string }
export interface ChargeOptions { blocked?: string; targets: ChargeTarget[]; done?: ChargeRecord }

export function chargeOptions(s: GameState, unitId: string): ChargeOptions {
  const unit = s.units.find((u) => u.id === unitId);
  if (!unit) return { blocked: "Unidad desconocida.", targets: [] };
  const models = formationModels(s, unitId);
  if (!models.length) return { blocked: "La unidad ha sido destruida.", targets: [] };
  const done = s.turnLog.charges?.[unitId];
  if (done) return { targets: [], done };
  if (unit.faction !== PLAYERS[s.active]) return { blocked: "No es su turno.", targets: [] };
  const ds = DATASHEETS[unit.datasheet];
  const move = s.turnLog.moves[unitId];
  let blocked: string | undefined;
  if (engaged(models, foesOf(s, unitId))) blocked = "Ya está trabada.";
  else if (!canChargeAfter(move, ds.abilities.includes("rapidez")))
    blocked = move?.kind === "retirarse" ? "Se ha retirado este turno." : "Ha avanzado: no puede cargar.";
  const targets: ChargeTarget[] = s.units
    .filter((u) => u.faction !== unit.faction && unitModels(s, u.id).length)
    .map((u) => {
      const d = nearestGap(models, unitModels(s, u.id));
      const t: ChargeTarget = { unit: u.id, name: DATASHEETS[u.datasheet].name, distance: d, need: Math.max(2, Math.ceil(d - ENGAGEMENT - 1e-6)) };
      if (d > CHARGE_RANGE + 1e-6) t.blocked = `A más de ${CHARGE_RANGE}"`;
      return t;
    })
    .sort((a, b) => a.distance - b.distance);
  return { blocked, targets };
}

/** Declara y resuelve una carga (muta `s`). Devuelve el registro, o null si no es válida. */
export function applyCharge(s: GameState, unitId: string, targetId: string): ChargeRecord | null {
  const o = chargeOptions(s, unitId);
  const t = o.targets.find((x) => x.unit === targetId);
  if (o.blocked || o.done || !t || t.blocked) return null;
  let [dice, rng] = rollDice(s.rng, 2, 6);
  s.rng = rng;
  let roll = dice[0] + dice[1];
  s.rolls.push({ player: s.active, turn: s.turn, sides: 6, results: dice });
  let success = roll >= t.distance - ENGAGEMENT;
  if (!success && hasStrat(s, "impetu", unitId)) {          // Ímpetu: se repite la tirada fallada
    [dice, rng] = rollDice(s.rng, 2, 6);
    s.rng = rng;
    roll = dice[0] + dice[1];
    s.rolls.push({ player: s.active, turn: s.turn, sides: 6, results: dice });
    success = roll >= t.distance - ENGAGEMENT;
  }
  const rec: ChargeRecord = { target: targetId, roll, need: t.need, success };
  s.turnLog.charges = { ...(s.turnLog.charges ?? {}) };
  for (const u of formation(s, unitId)) s.turnLog.charges[u] = rec;     // el líder carga con su escuadra
  if (success) advanceInto(s, unitId, targetId, roll, false, true);
  return rec;
}

/**
 * Mueve cada miniatura de la unidad hacia la miniatura enemiga más cercana del objetivo,
 * como mucho `max` pulgadas, parando en contacto de peana. Sin solapes.
 */
function advanceInto(s: GameState, unitId: string, targetId: string, max: number, onlyFree = false, whole = false) {
  const targets = unitModels(s, targetId);
  if (!targets.length) return;
  const models = (whole ? formationModels(s, unitId) : unitModels(s, unitId))
    .map((p) => ({ p, d: Math.min(...targets.map((q) => gap(disc(p), disc(q)))) }))
    .sort((a, b) => a.d - b.d || (a.p.id < b.p.id ? -1 : 1));
  const moves = [];
  for (const { p, d } of models) {
    if (onlyFree && d <= CONTACT + 0.01) continue;        // ya en contacto: no se mueve
    const q = targets.reduce((best, x) => (gap(disc(p), disc(x)) < gap(disc(p), disc(best)) ? x : best), targets[0]);
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
    const travel = Math.min(max, Math.max(0, d - CONTACT));
    moves.push({ id: p.id, x: p.x + (dx / len) * travel, z: p.z + (dz / len) * travel });
  }
  if (!moves.length) return;
  const fixed = resolveOverlaps(s.pieces, moves, { blocked: (x, z, r) => onForbiddenTerrain(s.terrain, x, z, r + 0.05) !== null });
  const byId = new Map(fixed.map((m) => [m.id, m]));
  for (const p of s.pieces) {
    const m = byId.get(p.id);
    if (m) { p.x = m.x; p.z = m.z; }
  }
}

// --- Combate --------------------------------------------------------------------

export interface FightOptions {
  blocked?: string;
  /** Unidades enemigas trabadas con esta. */
  targets: { unit: string; name: string }[];
  fought: boolean;
}

/** Unidades que deben combatir antes: las que cargaron con éxito este turno y aún no han combatido. */
export function pendingChargers(s: GameState): string[] {
  const fought = new Set(s.turnLog.fought ?? []);
  return Object.entries(s.turnLog.charges ?? {})
    .filter(([u, c]) => c.success && !fought.has(u) && unitModels(s, u).length && engaged(unitModels(s, u), foesOf(s, u)))
    .map(([u]) => u);
}

export function fightOptions(s: GameState, unitId: string): FightOptions {
  const unit = s.units.find((u) => u.id === unitId);
  if (!unit) return { blocked: "Unidad desconocida.", targets: [], fought: false };
  const models = unitModels(s, unitId);
  const fought = (s.turnLog.fought ?? []).includes(unitId);
  if (!models.length) return { blocked: "La unidad ha sido destruida.", targets: [], fought };
  const targets = s.units
    .filter((u) => u.faction !== unit.faction && unitModels(s, u.id).length && withinReach(models, unitModels(s, u.id)))
    .map((u) => ({ unit: u.id, name: DATASHEETS[u.datasheet].name }));
  let blocked: string | undefined;
  if (fought) blocked = "Ya ha combatido esta fase.";
  else if (!targets.length) blocked = "No está trabada.";
  else {
    const first = pendingChargers(s);
    if (first.length && !first.includes(unitId)) blocked = "Primero combaten las unidades que han cargado.";
  }
  return { blocked, targets, fought };
}

/** Trabada, o lo bastante cerca como para entrar al agruparse (3" + 1"). */
function withinReach(a: Piece[], b: Piece[]): boolean {
  return nearestGap(a, b) <= ENGAGEMENT + 1e-6;
}

/**
 * Combate de una unidad contra otra: agruparse, golpear con cada grupo de armas CC, consolidar.
 * Muta `s` y devuelve los ataques resueltos (uno por arma), o null si no es válido.
 */
export function applyFight(s: GameState, unitId: string, targetId: string): AttackLogEntry[] | null {
  const o = fightOptions(s, unitId);
  if (o.blocked || !o.targets.some((t) => t.unit === targetId)) return null;
  const unit = s.units.find((u) => u.id === unitId)!;
  const ds = DATASHEETS[unit.datasheet];

  advanceInto(s, unitId, targetId, PILE_IN, true);                       // agruparse

  // Golpean las trabadas con el objetivo y la segunda fila (a ½" de una amiga trabada)
  const foes = unitModels(s, targetId);
  const mine = unitModels(s, unitId);
  const front = mine.filter((p) => foes.some((q) => gap(disc(p), disc(q)) <= ENGAGEMENT + 1e-6));
  const second = mine.filter((p) => !front.includes(p) && front.some((f) => gap(disc(p), disc(f)) <= SECOND_RANK + 1e-6));
  const fighters = [...front, ...second];

  // Agrupa por arma CC (el líder puede llevar otra)
  const groups = new Map<string, Piece[]>();
  for (const p of fighters) {
    const ids = p.leader && ds.leaderWeapons ? ds.leaderWeapons : ds.weapons;
    const w = ids.map((id) => WEAPONS[id]).find((x) => x.range === "CC");
    if (!w) continue;
    if (!groups.has(w.id)) groups.set(w.id, []);
    groups.get(w.id)!.push(p);
  }
  const entries: AttackLogEntry[] = [];
  for (const [wid, group] of groups) {
    if (!unitModels(s, targetId).length) break;                         // el objetivo ya cayó
    const alive = group.filter((p) => s.pieces.includes(p));
    if (!alive.length) continue;
    entries.push(performAttack(s, "combate", unitId, alive, WEAPONS[wid], targetId));
  }

  if (unitModels(s, targetId).length) advanceInto(s, unitId, targetId, PILE_IN, true);   // consolidar
  s.turnLog.fought = [...(s.turnLog.fought ?? []), unitId];
  return entries;
}
