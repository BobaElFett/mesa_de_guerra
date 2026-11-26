import { note, unitName } from "./history";
import { BASE_RADIUS, Faction, GameState, Piece, PLAYERS } from "../core/state";
import type { Phase } from "./turn";
import { DATASHEETS, pieceWeaponIds, WEAPONS } from "./datasheets";
import { disc, gap, sight, onForbiddenTerrain, ENGAGEMENT } from "./geometry";
import { isEngaged, unitModels, enemyModels } from "./movement";
import { performAttack, seen } from "./shooting";
import { formation, formationModels, isGuarded } from "./leaders";
import { mortalWounds } from "./eleventh";
import { chargeInto } from "./melee";
import { inSynapse } from "./morale";
import { resolveOverlaps } from "../core/placement";
import { rollDice } from "../core/rng";
import { respawn } from "./special";

// Estratagemas (#36; 11.ª desde la fase 32). Las básicas son las de la 11.ª edición; cada una
// dice en qué turno y fase se usa (algunas, en el turno del rival: ventanas de reacción). Cada
// jugador usa cada estratagema como mucho una vez por fase, y cada unidad recibe una sola por fase;
// nunca sobre una unidad desmoralizada (salvo Valor demente). Las de bando (Fuego sostenido, Avance
// táctico, Frenesí, Hambre voraz, Oleada sin fin) son propias y se sustituirán por las de los
// destacamentos de la 11.ª.

export type StratId = "repeticion" | "desafio" | "valor" | "granadas" | "impacto" | "fuegoDefensivo" | "humo"
  | "intervencion" | "contraofensiva"
  | "oleada" | "fuegoSostenido" | "avanceTactico" | "frenesi" | "hambre";

/** Ventanas de reacción en el turno del rival (11.ª). */
export type ReactionKind = "finMovimiento" | "inicioDisparo" | "finCarga";

export interface Stratagem {
  id: StratId; name: string; cost: number; phase: Phase; text: string;
  /** En qué turno: el propio, el del rival o cualquiera. */
  turn: "propio" | "rival" | "ambos";
  /** Se usa en esta ventana de reacción del turno del rival. */
  window?: ReactionKind;
  /** Solo para este bando (#52). */
  faction?: Faction;
  /** Necesita un objetivo enemigo (se elige en la mesa). */
  needsTarget?: boolean;
  /** Una vez por partida. */
  oncePerBattle?: boolean;
  /** Básica de la 11.ª. */
  core?: boolean;
}

export const STRATAGEMS: Record<StratId, Stratagem> = {
  // --- Básicas de la 11.ª --------------------------------------------------------------
  repeticion: { id: "repeticion", name: "Repetición de mando", cost: 1, phase: "carga", turn: "propio", core: true,
    text: "Si la carga de la unidad falla, se repite la tirada de 2D6 entera." },
  desafio: { id: "desafio", name: "Desafío épico", cost: 1, phase: "combate", turn: "ambos", core: true,
    text: "Al elegir para combatir una unidad con un personaje: sus armas de combate ganan Precisión esta fase." },
  valor: { id: "valor", name: "Valor demente", cost: 1, phase: "mando", turn: "propio", core: true, oncePerBattle: true,
    text: "Una vez por partida: la unidad supera su chequeo de moral (si estaba desmoralizada, se recupera)." },
  granadas: { id: "granadas", name: "Explosivos", cost: 1, phase: "disparo", turn: "propio", core: true, needsTarget: true,
    text: "Una unidad con explosivos que puede disparar y no ha avanzado lanza contra un enemigo no trabado, visible, a 8\" o menos: 6D6, cada 4+ es una herida mortal. Puede disparar igual." },
  impacto: { id: "impacto", name: "Impacto aplastante", cost: 1, phase: "carga", turn: "propio", core: true,
    text: "Tras cargar con un monstruo o vehículo: tira tantos dados como su Resistencia; cada 1 es una herida mortal para él y cada 5+, una para el enemigo trabado (6 como mucho)." },
  fuegoDefensivo: { id: "fuegoDefensivo", name: "Fuego defensivo", cost: 1, phase: "movimiento", turn: "rival", window: "finMovimiento", core: true, needsTarget: true,
    text: "Al acabar el movimiento del rival: una unidad tuya no trabada dispara a un enemigo visible a 24\" o menos, impactando solo con 6 sin modificar (no son críticos)." },
  humo: { id: "humo", name: "Cortina de humo", cost: 1, phase: "disparo", turn: "rival", window: "inicioDisparo", core: true,
    text: "Al empezar el disparo del rival: una unidad tuya con humo (Tanque, Andador, Francotiradores) está en cobertura contra todos los ataques de la fase." },
  intervencion: { id: "intervencion", name: "Intervención heroica", cost: 1, phase: "carga", turn: "rival", window: "finCarga", core: true, needsTarget: true,
    text: "Al acabar la carga del rival: una unidad tuya no trabada a 12\" o menos carga contra una unidad enemiga que haya cargado esta fase (los vehículos, solo si son andadores)." },
  contraofensiva: { id: "contraofensiva", name: "Contraofensiva", cost: 2, phase: "combate", turn: "rival", core: true,
    text: "En el combate del rival, justo después de que combata una unidad enemiga: una unidad tuya que pueda combatir golpea primero y es la siguiente." },
  // --- De bando (propias, provisionales) -------------------------------------------------
  oleada: { id: "oleada", name: "Oleada sin fin", cost: 1, phase: "mando", turn: "propio", faction: "swarm",
    text: "Unas Garras Menores en sinapsis que hayan perdido miniaturas recuperan D3+1, junto a la unidad." },
  fuegoSostenido: { id: "fuegoSostenido", name: "Fuego sostenido", cost: 1, phase: "disparo", turn: "propio", faction: "legion",
    text: "Las armas a distancia de una unidad ganan Sostenida 1 esta fase: cada 6 para impactar da un impacto más." },
  avanceTactico: { id: "avanceTactico", name: "Avance táctico", cost: 1, phase: "movimiento", turn: "propio", faction: "legion",
    text: "Una unidad puede disparar este turno aunque avance, como si todas sus armas fueran de Asalto." },
  frenesi: { id: "frenesi", name: "Frenesí", cost: 1, phase: "combate", turn: "propio", faction: "swarm",
    text: "Cada miniatura de una unidad hace 1 ataque más en combate esta fase." },
  hambre: { id: "hambre", name: "Hambre voraz", cost: 1, phase: "carga", turn: "propio", faction: "swarm",
    text: "+2 a la tirada de carga de una unidad esta fase." },
};

/** Fuego defensivo (11.ª): alcance máximo del disparo rápido. */
export const SNAP_RANGE = 24;
/** Intervención heroica: alcance para cargar. */
export const HEROIC_RANGE = 12;

export const GRENADE_RANGE = 8;

export const STRAT_IDS = Object.keys(STRATAGEMS) as StratId[];

/** Voluntad de la colmena (11.ª): alcance desde el Tirano. */
export const HIVE_WILL_RANGE = 12;

/** ¿Abarata la Voluntad de la colmena esta estratagema? (una vez por ronda, a 12" de un Tirano) */
function hiveWill(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || s.hiveWillRound === s.turn) return false;
  const mine = unitModels(s, unitId);
  return s.units.some((t) => t.faction === u.faction && DATASHEETS[t.datasheet].abilities.includes("voluntadColmena")
    && unitModels(s, t.id).some((q) => mine.some((p) => gap(disc(p), disc(q)) <= HIVE_WILL_RANGE + 1e-6)));
}

/** Lo que cuesta ahora la estratagema en esta unidad. */
export function stratCost(s: GameState, id: StratId, unitId: string): number {
  return Math.max(0, STRATAGEMS[id].cost - (hiveWill(s, unitId) ? 1 : 0));
}

/** El jugador (0/1) que manda la unidad. */
const ownerOf = (s: GameState, unitId: string) => PLAYERS.indexOf(s.units.find((u) => u.id === unitId)!.faction) as 0 | 1;

/** Estratagemas usadas esta fase. */
const thisPhase = (s: GameState) => (s.turnLog.strats ?? []).filter((x) => (x.phase ?? s.phase) === s.phase);

/** ¿Por qué no se puede usar? (null = se puede) */
export function stratBlocked(s: GameState, id: StratId, unitId: string): string | null {
  const st = STRATAGEMS[id];
  const u = s.units.find((x) => x.id === unitId);
  if (!s.rulesMode || s.gameOver) return "Solo en modo reglas.";
  if (!u || !s.pieces.some((p) => p.unit === unitId)) return "Unidad destruida.";
  const me = ownerOf(s, unitId);
  const mine = me === s.active;
  if (st.turn === "propio" && !mine) return "Solo en tu turno.";
  if (st.turn === "rival" && mine) return "Solo en el turno del rival.";
  if (st.faction && u.faction !== st.faction) return "No es de tu bando.";
  if (st.window) { if (s.reaction?.kind !== st.window || s.reaction.player !== me) return "Solo en su momento del turno del rival."; }
  else if (s.phase !== st.phase) return `Solo en la fase de ${st.phase}.`;
  const used = thisPhase(s);
  if (used.some((x) => x.id === id && ownerOf(s, x.unit) === me)) return "Ya usada esta fase.";
  if (st.oncePerBattle && (s.oncePerBattle?.[me] ?? []).includes(id)) return "Ya usada en esta partida.";
  if (used.some((x) => formation(s, unitId).includes(x.unit))) return "Esta unidad ya ha recibido una estratagema esta fase.";
  if (s.cp[me] < stratCost(s, id, unitId)) return "No quedan PM.";
  if (id === "valor") return u.shocked ? null : "No está desmoralizada.";
  if (u.shocked) return "Desmoralizada: no recibe estratagemas.";
  const ds = DATASHEETS[u.datasheet];
  const ranged = ds.weapons.concat(ds.leaderWeapons ?? []).some((w) => WEAPONS[w].range !== "CC");
  if (id === "granadas") {
    if (!formation(s, unitId).some((f) => DATASHEETS[s.units.find((x) => x.id === f)!.datasheet].keywords?.includes("explosivos"))) return "No lleva explosivos.";
    if (isEngaged(s, unitId)) return "Trabada en combate.";
    const mv = s.turnLog.moves[unitId];
    if (mv && mv.kind !== "normal") return mv.kind === "avanzar" ? "Ha avanzado." : "Se ha retirado.";
    if (!grenadeTargets(s, unitId).length) return "Ningún enemigo visible a 8\" o menos.";
  }
  if (id === "repeticion" && s.turnLog.charges?.[unitId]) return "Ya ha cargado.";
  if (id === "hambre" && s.turnLog.charges?.[unitId]) return "Ya ha cargado.";
  if (id === "impacto") {
    if (ds.type !== "vehiculo" && ds.type !== "monstruo") return "Solo monstruos y vehículos.";
    if (!s.turnLog.charges?.[unitId]?.success) return "No ha cargado con éxito este turno.";
    if (!isEngaged(s, unitId)) return "No está trabada.";
  }
  if (id === "desafio") {
    if (!formation(s, unitId).some((f) => DATASHEETS[s.units.find((x) => x.id === f)!.datasheet].character)) return "No hay ningún personaje en la unidad.";
    if ((s.turnLog.fought ?? []).includes(unitId)) return "Ya ha combatido.";
  }
  if (id === "contraofensiva") {
    const fought = s.turnLog.fought ?? [];
    const last = fought.length ? s.units.find((x) => x.id === fought[fought.length - 1]) : undefined;
    if (!last || last.faction === u.faction) return "Justo después de que combata una unidad enemiga.";
    if (fought.includes(unitId) || !isEngaged(s, unitId)) return "No puede combatir.";
  }
  if (id === "fuegoDefensivo") {
    if (isEngaged(s, unitId)) return "Trabada en combate.";
    if (!ranged) return "No tiene armas a distancia.";
    if (!snapTargets(s, unitId).length) return `Ningún enemigo visible a ${SNAP_RANGE}" o menos.`;
  }
  if (id === "humo" && !ds.keywords?.includes("humo")) return "No tiene humo.";
  if (id === "intervencion") {
    if (isEngaged(s, unitId)) return "Trabada en combate.";
    if (ds.type === "vehiculo" && !ds.keywords?.includes("andador")) return "Solo vehículos andadores.";
    if (!heroicTargets(s, unitId).length) return `Ningún enemigo que haya cargado a ${HEROIC_RANGE}" o menos.`;
  }
  if ((id === "frenesi") && (s.turnLog.fought ?? []).includes(unitId)) return "Ya ha combatido.";
  if (id === "fuegoSostenido" && !ranged) return "No tiene armas a distancia.";
  if (id === "fuegoSostenido" && (s.turnLog.shot?.[unitId] ?? []).length) return "Ya ha disparado.";
  if (id === "avanceTactico" && !ranged) return "No tiene armas a distancia.";
  if (id === "avanceTactico" && s.turnLog.moves[unitId]?.kind === "retirarse") return "Se ha retirado.";
  if (id === "oleada") {
    if (u.datasheet !== "garras") return "Solo Garras Menores.";
    if (!inSynapse(s, unitId)) return "No está en sinapsis.";
    if (unitModels(s, unitId).length >= u.startingModels) return "No ha perdido miniaturas.";
  }
  return null;
}

/** Enemigos visibles a 24" a los que la unidad puede hacer fuego defensivo. */
export function snapTargets(s: GameState, unitId: string): string[] {
  const mine = unitModels(s, unitId);
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return [];
  return s.units.filter((e) => e.faction !== u.faction && unitModels(s, e.id).length && !isGuarded(s, e.id)).filter((e) => {
    const theirs = unitModels(s, e.id);
    return mine.some((a) => theirs.some((b) => gap(disc(a), disc(b)) <= SNAP_RANGE + 1e-6 && seen(s, a, b, e.id) !== "oculta"));
  }).map((e) => e.id);
}

/** Unidades enemigas que han cargado esta fase, a 12" o menos (Intervención heroica). */
export function heroicTargets(s: GameState, unitId: string): string[] {
  const mine = unitModels(s, unitId);
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return [];
  return Object.entries(s.turnLog.charges ?? {}).filter(([id, c]) => c.success && s.units.find((x) => x.id === id)?.faction !== u.faction)
    .map(([id]) => id).filter((id, i, a) => a.indexOf(id) === i)
    .filter((id) => unitModels(s, id).some((b) => mine.some((a) => gap(disc(a), disc(b)) <= HEROIC_RANGE + 1e-6)));
}

/** Enemigos a los que puede lanzar granadas (visibles, a 8" o menos de alguna miniatura). */
export function grenadeTargets(s: GameState, unitId: string): string[] {
  const mine = unitModels(s, unitId);
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return [];
  return s.units.filter((e) => e.faction !== u.faction && s.pieces.some((p) => p.unit === e.id)).filter((e) => {
    const theirs = unitModels(s, e.id);
    return !isEngaged(s, e.id) && mine.some((a) => theirs.some((b) => gap(disc(a), disc(b)) <= GRENADE_RANGE && seen(s, a, b, e.id) !== "oculta"));
  }).map((e) => e.id);
}

/** Gasta los PM y deja la estratagema activa para la unidad (muta `s`). */
export function applyStratagem(s: GameState, id: StratId, unitId: string, target?: string): boolean {
  if (stratBlocked(s, id, unitId)) return false;
  if (id === "granadas" && (!target || !grenadeTargets(s, unitId).includes(target))) return false;
  if (id === "fuegoDefensivo" && (!target || !snapTargets(s, unitId).includes(target))) return false;
  if (id === "intervencion" && (!target || !heroicTargets(s, unitId).includes(target))) return false;
  const me = ownerOf(s, unitId);
  const cost = stratCost(s, id, unitId);
  const will = cost < STRATAGEMS[id].cost;
  if (will) s.hiveWillRound = s.turn;
  s.cp = [...s.cp] as [number, number];
  s.cp[me] -= cost;
  s.turnLog.strats = [...(s.turnLog.strats ?? []), { id, unit: unitId, phase: s.phase }];
  if (STRATAGEMS[id].oncePerBattle) {
    const o = s.oncePerBattle ?? [[], []];
    s.oncePerBattle = [o[0], o[1]].map((x, i) => (i === me ? [...x, id] : x)) as [string[], string[]];
  }
  note(s, "estratagema", `Estratagema ${STRATAGEMS[id].name} (${cost} PM${will ? ", Voluntad de la colmena" : ""}) en ${unitName(s, unitId)}${target ? ` contra ${unitName(s, target)}` : ""}`, me);
  if (id === "valor") for (const f of formation(s, unitId)) s.units.find((x) => x.id === f)!.shocked = false;
  if (id === "granadas") throwGrenades(s, unitId, target!);
  if (id === "oleada") endlessWave(s, unitId);
  if (id === "impacto") crushingImpact(s, unitId);
  if (id === "fuegoDefensivo") snapShoot(s, unitId, target!);
  if (id === "intervencion") heroicCharge(s, unitId, target!);
  if (id === "contraofensiva") { s.turnLog.fightPick = me; s.turnLog.counter = unitId; }
  return true;
}

/** Impacto aplastante: tantos dados como la Resistencia; 1 = herida mortal propia, 5+ = al enemigo (6 como mucho). */
function crushingImpact(s: GameState, unitId: string) {
  const ds = DATASHEETS[s.units.find((u) => u.id === unitId)!.datasheet];
  const mine = unitModels(s, unitId);
  const foe = s.units.find((e) => e.faction !== s.units.find((u) => u.id === unitId)!.faction
    && unitModels(s, e.id).some((b) => mine.some((a) => gap(disc(a), disc(b)) <= ENGAGEMENT + 1e-6)));
  if (!foe) return;
  const [dice, rng] = rollDice(s.rng, ds.profile.T, 6);
  s.rng = rng;
  s.rolls.push({ player: s.active, turn: s.turn, sides: 6, results: dice });
  const self = dice.filter((d) => d === 1).length, hit = Math.min(6, dice.filter((d) => d >= 5).length);
  note(s, "carga", `Impacto aplastante: ${dice.join(" ")} — ${hit} al enemigo, ${self} para sí`);
  if (hit) mortalWounds(s, foe.id, hit, "Impacto aplastante", 0, unitId);
  if (self) mortalWounds(s, unitId, self, "Impacto aplastante");
}

/** Fuego defensivo: disparo rápido con todas las armas a distancia que lleguen (solo impactan los 6). */
function snapShoot(s: GameState, unitId: string, target: string) {
  const u = s.units.find((x) => x.id === unitId)!;
  const ds = DATASHEETS[u.datasheet];
  const theirs = () => unitModels(s, target);
  const byW = new Map<string, Piece[]>();
  for (const p of unitModels(s, unitId)) for (const wid of pieceWeaponIds(ds, p)) {
    const w = WEAPONS[wid];
    if (w.range === "CC") continue;
    const ok = theirs().some((b) => gap(disc(p), disc(b)) <= Math.min(SNAP_RANGE, w.range as number) + 1e-6 && seen(s, p, b, target) !== "oculta");
    if (ok) byW.set(wid, [...(byW.get(wid) ?? []), p]);
  }
  for (const [wid, models] of byW) {
    if (!theirs().length) break;
    const d = Math.min(...models.flatMap((a) => theirs().map((b) => gap(disc(a), disc(b)))));
    performAttack(s, "disparo", unitId, models, WEAPONS[wid], target, { distance: d, overwatch: true });
  }
}

/** Intervención heroica: 2D6; si alcanza para quedar trabada (a 2"), entra en contacto y golpea primero. */
function heroicCharge(s: GameState, unitId: string, target: string) {
  const mine = formationModels(s, unitId), theirs = unitModels(s, target);
  const d = Math.min(...mine.flatMap((a) => theirs.map((b) => gap(disc(a), disc(b)))));
  const [dice, rng] = rollDice(s.rng, 2, 6);
  s.rng = rng;
  s.rolls.push({ player: ownerOf(s, unitId), turn: s.turn, sides: 6, results: dice });
  const roll = dice[0] + dice[1];
  const need = Math.max(2, Math.ceil(d - ENGAGEMENT - 1e-6));
  const success = roll >= d - ENGAGEMENT;
  note(s, "carga", `${unitName(s, unitId)} interviene contra ${unitName(s, target)}: 2D6 = ${roll} (necesita ${need}) — ${success ? "llega" : "no llega"}`);
  s.turnLog.charges = { ...(s.turnLog.charges ?? {}) };
  for (const f of formation(s, unitId)) s.turnLog.charges[f] = { target, roll, need, success };
  if (success) chargeInto(s, unitId, target, roll);
}

export function hasStrat(s: GameState, id: StratId, unitId: string): boolean {
  return (s.turnLog.strats ?? []).some((x) => x.id === id && x.unit === unitId);
}

/** Granadas: una miniatura (la más cercana) lanza 6D6 a 4+; cada éxito, una herida mortal. */
function throwGrenades(s: GameState, unitId: string, target: string) {
  const theirs = unitModels(s, target);
  const thrower = unitModels(s, unitId).map((p) => ({ p, d: Math.min(...theirs.map((q) => gap(disc(p), disc(q)))) })).sort((a, b) => a.d - b.d)[0];
  if (!thrower) return;
  performAttack(s, "disparo", unitId, [thrower.p], WEAPONS.granadas, target, { distance: thrower.d, mortal: true });
}

/** Oleada sin fin: vuelven D3+1 Garras (sin pasar de las iniciales), pegadas a la unidad. */
function endlessWave(s: GameState, unitId: string) {
  const u = s.units.find((x) => x.id === unitId)!;
  const models = unitModels(s, unitId);
  const [d, rng] = rollDice(s.rng, 1, 3);
  s.rng = rng;
  s.rolls.push({ player: s.active, turn: s.turn, sides: 3, results: d });
  const roll = d[0] + 1;
  const n = Math.min(roll, u.startingModels - models.length);
  respawn(s, unitId, n, models[0]);
}
