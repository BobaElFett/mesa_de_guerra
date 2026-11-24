import { meleeWeaponIds, pieceWeaponIds } from "./datasheets";
import { note, unitName } from "./history";
import { onForbiddenTerrain } from "./geometry";
import { hasStrat } from "./stratagems";
import { formation, formationModels } from "./leaders";
import { BASE_RADIUS, cloneState, GameState, Piece, PLAYERS } from "../core/state";
import { rollDice } from "../core/rng";
import { resolveOverlaps } from "../core/placement";
import { DATASHEETS, WEAPONS } from "./datasheets";
import { disc, engaged, gap, ENGAGEMENT } from "./geometry";
import { canChargeAfter, unitModels } from "./movement";
import { performAttack, AttackLogEntry } from "./shooting";
import { applyImpact } from "./special";
import { battleShockTest, doctrine } from "./eleventh";

// Fases de carga y combate del reglamento.
//  - Carga: a 12" o menos de un enemigo, 2D6; si alcanza para quedar trabada (a 2"), la unidad entra en contacto.
//  - Combate (11.ª): se alternan, primero las que golpean primero; agruparse 3", golpear, consolidar 3".
// Todo se resuelve dentro del estado con el RNG con semilla.

export const CHARGE_RANGE = 12;
export const PILE_IN = 3;
const CONTACT = 0.05;          // separación al quedar «en contacto» de peana

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
  else if (!canChargeAfter(move, ds.abilities.includes("rapidez") || doctrine(s, unitId, "asalto"))
    && !(move?.kind === "retirarse" && (ds.abilities.includes("depredadores") || doctrine(s, unitId, "tactica"))))
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
  const bonus = hasStrat(s, "hambre", unitId) ? 2 : 0;                 // Hambre voraz (#123)
  let roll = dice[0] + dice[1] + bonus;
  s.rolls.push({ player: s.active, turn: s.turn, sides: 6, results: dice });
  let success = roll >= t.distance - ENGAGEMENT;
  if (!success && hasStrat(s, "impetu", unitId)) {          // Ímpetu: se repite la tirada fallada
    [dice, rng] = rollDice(s.rng, 2, 6);
    s.rng = rng;
    roll = dice[0] + dice[1] + bonus;
    s.rolls.push({ player: s.active, turn: s.turn, sides: 6, results: dice });
    success = roll >= t.distance - ENGAGEMENT;
  }
  const rec: ChargeRecord = { target: targetId, roll, need: t.need, success };
  note(s, "carga", `${unitName(s, unitId)} carga a ${unitName(s, targetId)}: 2D6 = ${roll} (necesita ${t.need}) — ${success ? "llega" : "no llega"}${hasStrat(s, "impetu", unitId) ? " · con Ímpetu" : ""}`);
  s.turnLog.charges = { ...(s.turnLog.charges ?? {}) };
  for (const u of formation(s, unitId)) s.turnLog.charges[u] = rec;     // el líder carga con su escuadra
  if (success) { advanceInto(s, unitId, targetId, roll, false, true); applyImpact(s, unitId, targetId); }
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
  return s.units.filter((u) => fightsFirst(s, u.id) && canStillFight(s, u.id)).map((u) => u.id);
}

/** Golpea primero (11.ª): ha cargado este turno o tiene la habilidad. */
export function fightsFirst(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  return !!u && (!!s.turnLog.charges?.[unitId]?.success || DATASHEETS[u.datasheet].abilities.includes("contraataque"));
}

/** ¿Puede combatir aún esta fase? (no ha combatido y está trabada) */
function canStillFight(s: GameState, unitId: string): boolean {
  if ((s.turnLog.fought ?? []).includes(unitId)) return false;
  const ms = unitModels(s, unitId);
  return ms.length > 0 && engaged(ms, foesOf(s, unitId));
}

/**
 * A quién le toca elegir la siguiente unidad que combate (11.ª): empieza el jugador activo y se
 * alternan, primero con las unidades que golpean primero y luego con el resto. Si al que le toca
 * no le queda ninguna, elige el otro.
 */
export function fightPicker(s: GameState): 0 | 1 | null {
  const p = (s.turnLog.fightPick ?? s.active) as 0 | 1, o = (1 - p) as 0 | 1;
  const of = (pl: 0 | 1, ff: boolean) => s.units.some((u) => u.faction === PLAYERS[pl] && canStillFight(s, u.id) && (!ff || fightsFirst(s, u.id)));
  if (of(p, true)) return p;
  if (of(o, true)) return o;
  if (of(p, false)) return p;
  if (of(o, false)) return o;
  return null;
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
    const pick = fightPicker(s);
    const first = pendingChargers(s);
    if (pick !== null && PLAYERS[pick] !== unit.faction) blocked = "Le toca elegir al rival: se alternan.";
    else if (first.length && !first.includes(unitId)) blocked = "Primero combaten las unidades que golpean primero (han cargado o tienen Golpea primero).";
  }
  return { blocked, targets, fought };
}

/** Trabada, o lo bastante cerca como para entrar al agruparse (3" + 2"). */
function withinReach(a: Piece[], b: Piece[]): boolean {
  return nearestGap(a, b) <= ENGAGEMENT + 1e-6;
}

/** Consolidación (11.ª): distancia máxima y alcance para buscar enemigos u objetivos. */
export const CONSOLIDATE = 3;

/**
 * Consolidación (11.ª), 3": si sigue trabada, hacia el enemigo más cercano; si no, hacia un enemigo
 * a 3" (que queda trabado y podrá combatir); si no, hacia un objetivo a 3". Muta `s`.
 */
export function consolidate(s: GameState, unitId: string) {
  const mine = unitModels(s, unitId);
  if (!mine.length) return;
  const foes = s.units.filter((u) => u.faction !== s.units.find((x) => x.id === unitId)!.faction && unitModels(s, u.id).length)
    .map((u) => ({ id: u.id, d: nearestGap(mine, unitModels(s, u.id)) })).sort((a, b) => a.d - b.d);
  const near = foes[0];
  if (near && near.d <= CONSOLIDATE + 1e-6) { advanceInto(s, unitId, near.id, CONSOLIDATE, true); return; }
  // Hacia un objetivo: cada miniatura se acerca al marcador hasta quedar a su alcance
  const obj = (s.objectives ?? []).filter((o) => !o.relic)
    .map((o) => ({ o, d: Math.min(...mine.map((p) => Math.hypot(p.x - o.x, p.z - o.z))) }))
    .filter((x) => x.d <= CONSOLIDATE + 3 + 1) .sort((a, b) => a.d - b.d)[0];
  if (!obj) return;
  const moves = mine.map((p) => {
    const dx = obj.o.x - p.x, dz = obj.o.z - p.z, len = Math.hypot(dx, dz) || 1;
    const travel = Math.min(CONSOLIDATE, Math.max(0, len - 2.5));
    return { id: p.id, x: p.x + (dx / len) * travel, z: p.z + (dz / len) * travel };
  });
  const enemies = s.pieces.filter((p) => p.faction !== mine[0].faction).map((e) => ({ x: e.x, z: e.z, r: BASE_RADIUS[e.model] + ENGAGEMENT }));
  const fixed = resolveOverlaps(s.pieces, moves, { avoid: () => enemies, blocked: (x, z, r) => onForbiddenTerrain(s.terrain, x, z, r + 0.05) !== null });
  const byId = new Map(fixed.map((m) => [m.id, m]));
  for (const p of s.pieces) { const m = byId.get(p.id); if (m) { p.x = m.x; p.z = m.z; } }
}

/**
 * Los golpes que daría la unidad combatiendo contra `targetId` (#127): sobre una copia del
 * estado, tras agruparse, quién golpea y con qué arma. Para la vista previa del panel de ataque.
 */
export function fightSteps(s0: GameState, unitId: string, targetId: string) {
  const s = cloneState(s0);
  const o = fightOptions(s, unitId);
  if (o.blocked || !o.targets.some((t) => t.unit === targetId)) return { state: s, steps: [] };
  advanceInto(s, unitId, targetId, PILE_IN, true);
  const groups = fightGroups(s, unitId, targetId);
  return { state: s, steps: [...groups].map(([wid, attackers]) => ({ kind: "combate" as const, unit: unitId, attackers, weapon: WEAPONS[wid], target: targetId })) };
}

/** Miniaturas que golpean (las trabadas con el objetivo), agrupadas por su arma de combate. */
function fightGroups(s: GameState, unitId: string, targetId: string): Map<string, Piece[]> {
  const ds = DATASHEETS[s.units.find((u) => u.id === unitId)!.datasheet];
  const foes = unitModels(s, targetId);
  const mine = unitModels(s, unitId);
  // 11.ª: golpea cada miniatura trabada (a 2") con el objetivo
  const front = mine.filter((p) => foes.some((q) => gap(disc(p), disc(q)) <= ENGAGEMENT + 1e-6));
  const groups = new Map<string, Piece[]>();
  for (const p of front) for (const wid of meleeWeaponIds(ds, p)) {
    if (!groups.has(wid)) groups.set(wid, []);
    groups.get(wid)!.push(p);
  }
  return groups;
}

/**
 * Combate de una unidad contra otra: agruparse, golpear con cada grupo de armas CC, consolidar.
 * Muta `s` y devuelve los ataques resueltos (uno por arma), o null si no es válido.
 */
export function applyFight(s: GameState, unitId: string, targetId: string): AttackLogEntry[] | null {
  const o = fightOptions(s, unitId);
  if (o.blocked || !o.targets.some((t) => t.unit === targetId)) return null;
  advanceInto(s, unitId, targetId, PILE_IN, true);                       // agruparse

  // Golpean las trabadas con el objetivo, agrupadas por arma de combate
  const groups = fightGroups(s, unitId, targetId);
  const entries: AttackLogEntry[] = [];
  for (const [wid, group] of groups) {
    if (!unitModels(s, targetId).length) break;                         // el objetivo ya cayó
    const alive = group.filter((p) => s.pieces.includes(p));
    if (!alive.length) continue;
    const hit = performAttack(s, "combate", unitId, alive, WEAPONS[wid], targetId);
    entries.push(hit);
    if (!unitModels(s, unitId).length) break;                           // una explosión acabó con ella
  }
  // Hora gloriosa: una vez por partida, se gasta la primera vez que combate
  const me = s.units.find((u) => u.id === unitId)!;
  if (DATASHEETS[me.datasheet].abilities.includes("horaGloriosa") && !(me.spent ?? []).includes("horaGloriosa")) {
    me.spent = [...(me.spent ?? []), "horaGloriosa"];
    note(s, "combate", `${unitName(s, unitId)} vive su hora gloriosa`);
  }
  // Espectáculo horrendo: si destruye la unidad, los enemigos a 6" chequean moral
  if (!unitModels(s, targetId).length && DATASHEETS[me.datasheet].abilities.includes("espectaculo")) {
    const mine = unitModels(s, unitId);
    for (const e of s.units.filter((u) => u.faction !== me.faction && unitModels(s, u.id).some((p) => mine.some((q) => gap(disc(p), disc(q)) <= 6 + 1e-6))))
      battleShockTest(s, e.id, 0, "Espectáculo horrendo");
  }

  consolidate(s, unitId);
  s.turnLog.fought = [...(s.turnLog.fought ?? []), unitId];
  s.turnLog.fightPick = (1 - PLAYERS.indexOf(me.faction)) as 0 | 1;   // ahora elige el otro
  return entries;
}
