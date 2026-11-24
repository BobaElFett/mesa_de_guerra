import { BASE_RADIUS, GameState, Piece, PLAYERS } from "../core/state";
import { rollDice } from "../core/rng";
import { DATASHEETS, Dice, hasAbility, Weapon } from "./datasheets";
import { rollDiceExpr, SeededDice } from "./attack";
import { note, unitName } from "./history";
import { recordCasualties } from "./missions";
import { inSynapse } from "./morale";
import { formation } from "./leaders";
import { unitModels } from "./movement";
import { recordDamage } from "./stats";

// Reglas de la 11.ª edición que no son parte de la secuencia de ataque (fase 30): heridas mortales
// sueltas, Muerte explosiva, tiradas de peligro, chequeos de moral forzados, Cúpula de fuerza y
// Muerte flotante. Todas mutan el estado y usan su RNG.

const edge = (a: Piece, b: Piece) => Math.hypot(a.x - b.x, a.z - b.z) - BASE_RADIUS[a.model] - BASE_RADIUS[b.model];

function roll(s: GameState, d: Dice): number {
  const dice = new SeededDice(s.rng);
  const v = rollDiceExpr(d, dice);
  s.rng = dice.state;
  return v;
}

/**
 * `n` heridas mortales a la unidad: primero a las miniaturas heridas, sin salvación; el daño que
 * sobra pasa a la siguiente. Devuelve las bajas. `depth` evita cadenas infinitas de explosiones.
 */
export function mortalWounds(s: GameState, unitId: string, n: number, why: string, depth = 0, by: string | null = null): Piece[] {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || n <= 0) return [];
  const W = DATASHEETS[u.datasheet].profile.W;
  const slain: Piece[] = [];
  let left = n;
  while (left > 0) {
    const ms = unitModels(s, unitId).sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0));
    if (!ms.length) break;
    const p = ms[0];
    const take = Math.min(left, W - (p.damage ?? 0));
    p.damage = (p.damage ?? 0) + take;
    left -= take;
    if (p.damage >= W) { s.pieces = s.pieces.filter((q) => q !== p); slain.push(p); }
  }
  recordDamage(s, by && s.units.find((x) => x.id === by)?.faction !== u.faction ? by : null, unitId, n - left, slain.length);
  note(s, "baja", `${unitName(s, unitId)} sufre ${n} herida${n === 1 ? "" : "s"} mortal${n === 1 ? "" : "es"} (${why})${slain.length ? `: ${slain.length} baja${slain.length === 1 ? "" : "s"}` : ""}`);
  if (slain.length) recordCasualties(s, (1 - PLAYERS.indexOf(u.faction)) as 0 | 1, unitId, slain.length);
  for (const p of slain) deadlyDemise(s, unitId, p, depth + 1);
  return slain;
}

/** Muerte explosiva X: al caer la miniatura, con un 6 cada unidad a 6" o menos sufre X heridas mortales. */
export const DEMISE_RANGE = 6;
export function deadlyDemise(s: GameState, unitId: string, dead: Piece, depth = 0) {
  const u = s.units.find((x) => x.id === unitId);
  const dd = u ? DATASHEETS[u.datasheet].deadlyDemise : undefined;
  if (!u || dd === undefined || depth > 4) return;
  const [[d], rng] = rollDice(s.rng, 1, 6);
  s.rng = rng;
  if (d < 6) return;
  const victims = s.units.filter((o) => unitModels(s, o.id).some((p) => edge(p, dead) <= DEMISE_RANGE + 1e-6));
  note(s, "baja", `${DATASHEETS[u.datasheet].name} estalla al caer (6): ${victims.length ? victims.map((v) => unitName(s, v.id)).join(", ") : "nadie cerca"}`);
  for (const v of victims) mortalWounds(s, v.id, roll(s, dd), "Muerte explosiva", depth, unitId);
}

/** Tiradas de peligro (11.ª): una por arma Peligrosa; con 1–2, 1 herida mortal (3 a vehículos y monstruos). */
export function hazardRolls(s: GameState, unitId: string, weapon: Weapon, n: number) {
  if (!hasAbility(weapon, "peligrosa") || n <= 0) return;
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return;
  const big = DATASHEETS[u.datasheet].type === "vehiculo" || DATASHEETS[u.datasheet].type === "monstruo";
  const [dice, rng] = rollDice(s.rng, n, 6);
  s.rng = rng;
  const fails = dice.filter((v) => v <= 2).length;
  if (fails) mortalWounds(s, unitId, fails * (big ? 3 : 1), `${weapon.name}: peligro`);
}

/**
 * Chequeo de moral forzado (Grito de muerte, Espectáculo horrendo, Cúpula de fuerza): 2D6 (3D6 en
 * sinapsis) + `mod` contra el Liderazgo. Si falla, queda desmoralizada. Devuelve si lo supera.
 */
export function battleShockTest(s: GameState, unitId: string, mod: number, why: string): boolean {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || !unitModels(s, unitId).length) return true;
  const n = inSynapse(s, unitId) ? 3 : 2;
  const [dice, rng] = rollDice(s.rng, n, 6);
  s.rng = rng;
  const total = dice.reduce((a, b) => a + b, 0) + mod;
  const need = DATASHEETS[u.datasheet].profile.Ld;
  const ok = total >= need;
  if (!ok) u.shocked = true;
  note(s, "moral", `${unitName(s, unitId)} chequea moral (${why}): ${n}D6${mod ? ` ${mod > 0 ? "+" : "−"}${Math.abs(mod)}` : ""} = ${total} (necesita ${need}) — ${ok ? "aguanta" : "desmoralizada"}`);
  return ok;
}

/** Índice del turno en curso (ronda·2 + jugador), para efectos «hasta tu siguiente turno». */
export const turnIndex = (s: GameState) => s.turn * 2 + s.active;

/** Cúpula de fuerza: al empezar el movimiento, cada psíquico tira 1D6 (1: su formación, desmoralizada). */
export function forceDomes(s: GameState) {
  for (const u of s.units) {
    if (u.faction !== PLAYERS[s.active] || !DATASHEETS[u.datasheet].abilities.includes("cupula") || u.shocked) continue;
    if (!unitModels(s, u.id).length) continue;
    const [[d], rng] = rollDice(s.rng, 1, 6);
    s.rng = rng;
    const group = formation(s, u.id);
    if (d === 1) {
      for (const id of group) s.units.find((x) => x.id === id)!.shocked = true;
      note(s, "moral", `${unitName(s, u.id)}: la Cúpula de fuerza falla (1) y su formación queda desmoralizada`, s.active);
    } else {
      for (const id of group) s.units.find((x) => x.id === id)!.domeUntil = turnIndex(s) + 2;
      note(s, "turno", `${unitName(s, u.id)} levanta la Cúpula de fuerza (${d}): invulnerable 4+ hasta su siguiente turno`, s.active);
    }
  }
}

/** Muerte flotante: radio al que revientan las minas. */
export const MINE_RANGE = 3;
/** Cada mina a 3" o menos de un enemigo revienta contra él. Muta `s`. */
export function floatingDeath(s: GameState) {
  for (let guard = 0; guard < 40; guard++) {
    const mine = s.pieces.find((p) => {
      const u = p.unit ? s.units.find((x) => x.id === p.unit) : undefined;
      return !!u && DATASHEETS[u.datasheet].abilities.includes("minaFlotante") && s.pieces.some((q) => q.faction !== p.faction && q.unit && edge(p, q) <= MINE_RANGE + 1e-6);
    });
    if (!mine) return;
    const victim = s.pieces.filter((q) => q.faction !== mine.faction && q.unit).sort((a, b) => edge(mine, a) - edge(mine, b))[0];
    s.pieces = s.pieces.filter((q) => q !== mine);
    recordCasualties(s, (1 - PLAYERS.indexOf(mine.faction)) as 0 | 1, mine.unit!, 1);
    const [[d], rng] = rollDice(s.rng, 1, 6);
    s.rng = rng;
    const n = d === 1 ? 0 : d === 6 ? roll(s, "D3") : 1;
    note(s, "baja", `Una mina revienta junto a ${unitName(s, victim.unit!)} (${d})${n ? "" : ": sin efecto"}`);
    recordDamage(s, null, mine.unit!, 1, 1);
    if (n) mortalWounds(s, victim.unit!, n, "Muerte flotante", 0, mine.unit!);
  }
}

// --- Reglas de ejército y destacamentos (11.ª) ------------------------------------------------

/** Doctrinas de combate de la Legión (Fuerza de tarea Gladius: una de ellas, dos veces). */
export const DOCTRINES = {
  devastador: { name: "Doctrina devastadora", text: "Las unidades de la Legión pueden disparar todas sus armas aunque hayan avanzado." },
  tactica: { name: "Doctrina táctica", text: "Las unidades de la Legión pueden disparar y cargar aunque se hayan retirado." },
  asalto: { name: "Doctrina de asalto", text: "Las unidades de la Legión pueden cargar aunque hayan avanzado." },
} as const;
export type DoctrineId = keyof typeof DOCTRINES;
/** Orden en que la Legión activa sus doctrinas, ronda a ronda (la devastadora, dos veces). */
export const DOCTRINE_ORDER: (DoctrineId | null)[] = ["devastador", "asalto", "tactica", "devastador", null];

/** Al empezar el mando de la Legión, activa la doctrina de la ronda (hasta su siguiente mando). */
export function selectDoctrine(s: GameState) {
  if (PLAYERS[s.active] !== "legion") return;
  const d = DOCTRINE_ORDER[s.turn - 1] ?? null;
  s.doctrine = d;
  if (d) note(s, "turno", `${DOCTRINES[d].name}: ${DOCTRINES[d].text}`, s.active);
}

/** ¿Tiene esta unidad de la Legión activa la doctrina? */
export function doctrine(s: GameState, unitId: string, d: DoctrineId): boolean {
  const u = s.units.find((x) => x.id === unitId);
  return !!u && u.faction === "legion" && s.doctrine === d;
}

/** Hiperadaptación del Enjambre (Flota de invasión: instintos de enjambre): Sostenida 1 contra infantería. */
export function swarmingInstincts(s: GameState, attackerId: string, targetId: string): boolean {
  const a = s.units.find((x) => x.id === attackerId), t = s.units.find((x) => x.id === targetId);
  return !!a && !!t && a.faction === "swarm" && (DATASHEETS[t.datasheet].type === "infanteria" || DATASHEETS[t.datasheet].type === "enjambre");
}

/**
 * Sombra en la disformidad (Enjambre, una vez por partida): al empezar su mando de la ronda 2, si
 * le queda una unidad sináptica, cada unidad de la Legión chequea moral (−1 a 6" de una sináptica).
 */
export const SHADOW_ROUND = 2;
export function shadowInTheWarp(s: GameState) {
  if (s.shadowUsed || PLAYERS[s.active] !== "swarm" || s.turn < SHADOW_ROUND) return;
  const syn = s.units.filter((u) => u.faction === "swarm" && unitModels(s, u.id).length && DATASHEETS[u.datasheet].abilities.includes("sinaptico"));
  if (!syn.length) return;
  s.shadowUsed = true;
  note(s, "moral", "El Enjambre desata la Sombra en la disformidad: toda la Legión chequea moral", s.active);
  // Una tirada por formación (la escuadra con sus personajes chequea junta)
  for (const u of s.units.filter((x) => x.faction === "legion" && unitModels(s, x.id).length && formation(s, x.id)[0] === x.id)) {
    const group = formation(s, u.id);
    const near = syn.some((o) => unitModels(s, o.id).some((q) => group.some((id) => unitModels(s, id).some((p) => edge(p, q) <= 6 + 1e-6))));
    const ok = battleShockTest(s, u.id, near ? -1 : 0, "Sombra en la disformidad");
    if (!ok) for (const id of group) s.units.find((x) => x.id === id)!.shocked = true;
  }
}

/**
 * Huida desesperada (11.ª): una formación desmoralizada que se retira hace una tirada de peligro
 * por miniatura (1–2: 1 herida mortal; 3 si es vehículo o monstruo). Devuelve las bajas.
 */
export function desperateEscape(s: GameState, unitId: string): number {
  const group = formation(s, unitId);
  if (!group.some((id) => s.units.find((u) => u.id === id)?.shocked)) return 0;
  let dead = 0;
  note(s, "mover", `${unitName(s, unitId)} huye a la desesperada (desmoralizada): una tirada de peligro por miniatura`);
  for (const id of group) {
    const n = unitModels(s, id).length;
    if (!n) continue;
    const big = DATASHEETS[s.units.find((u) => u.id === id)!.datasheet].type === "vehiculo" || DATASHEETS[s.units.find((u) => u.id === id)!.datasheet].type === "monstruo";
    const [dice, rng] = rollDice(s.rng, n, 6);
    s.rng = rng;
    const fails = dice.filter((v) => v <= 2).length;
    if (fails) dead += mortalWounds(s, id, fails * (big ? 3 : 1), "huida desesperada").length;
  }
  return dead;
}
