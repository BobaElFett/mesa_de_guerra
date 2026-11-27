import { GameState, PLAYERS } from "../core/state";
import { nextRandom } from "../core/rng";
import { note, unitName } from "./history";
import { addVp, controller, KillEntry, Objective, objectiveInRange } from "./missions";
import { MAX_ROUNDS } from "./turn";

// Disposición de fuerzas y misiones primarias de la 11.ª (mazo de misiones 2026-27).
//
// Cada jugador elige en secreto una disposición de fuerzas. En su carta busca la disposición del
// rival: la misión que hay debajo es SU misión primaria (con la misma disposición, la misma
// misión). La primaria da hasta 45 PV, como mucho 15 por ronda (los de final de partida no cuentan
// para el tope por ronda).
//
// Los momentos de puntuar:
//  - «al acabar tu fase de mando» desde la ronda 2 (en la ronda 5, al acabar tu turno);
//  - «al acabar tu turno», cualquier ronda (o desde la ronda que diga);
//  - «al acabar la batalla».
// Objetivo de casa: el de tu zona de despliegue. Territorio rival: la mitad de la mesa con su zona.
//
// Por ahora hay dos disposiciones: Tomar y mantener y Purgar al enemigo. Las otras tres (Sabotaje,
// Reconocimiento y Objetivos prioritarios) usan acciones y marcadores de operación: llegarán después.

export type ForceDisposition = "tomar" | "disrupcion" | "purga" | "reconocimiento" | "activos";
/** Orden de los símbolos en cada carta. */
export const FD_ORDER: ForceDisposition[] = ["tomar", "disrupcion", "purga", "reconocimiento", "activos"];

export const FD_INFO: Record<ForceDisposition, { name: string; text: string; ready: boolean }> = {
  tomar: { name: "Tomar y mantener", text: "Controlar el terreno y aguantarlo.", ready: true },
  disrupcion: { name: "Sabotaje", text: "Trampas, señuelos y retrasar al enemigo (pronto).", ready: false },
  purga: { name: "Purgar al enemigo", text: "Destruir unidades enemigas sin perder pie en los objetivos.", ready: true },
  reconocimiento: { name: "Reconocimiento", text: "Explorar, vigilar y reunir información (pronto).", ready: false },
  activos: { name: "Objetivos prioritarios", text: "Asegurar, enlazar y sabotear puntos clave (pronto).", ready: false },
};
export const READY_DISPOSITIONS = FD_ORDER.filter((f) => FD_INFO[f].ready);

export type PrimaryId = "dominio" | "inamovible" | "adquisicion" | "purgarAsegurar" | "ineludible"
  | "imparable" | "picadora" | "castigo" | "consagrar" | "ira";

/** Cada carta: la misión bajo cada símbolo de la disposición rival (en el orden de FD_ORDER). */
export const FD_CARDS: Record<ForceDisposition, (PrimaryId | null)[]> = {
  tomar: ["dominio", "inamovible", "adquisicion", "purgarAsegurar", "ineludible"],
  purga: ["imparable", "picadora", "castigo", "consagrar", "ira"],
  disrupcion: [null, null, null, null, null],
  reconocimiento: [null, null, null, null, null],
  activos: [null, null, null, null, null],
};

/** La misión primaria de quien elige `mine` contra quien elige `theirs`. */
export const primaryFor = (mine: ForceDisposition, theirs: ForceDisposition): PrimaryId | null => FD_CARDS[mine][FD_ORDER.indexOf(theirs)];

export const PRIMARY_CAP = 45;
export const PRIMARY_ROUND_CAP = 15;

type P = 0 | 1;
interface Score { vp: number; why: string }

export interface Primary {
  id: PrimaryId;
  name: string;
  /** Resumen en nuestras palabras. */
  text: string;
  /** Al acabar tu fase de mando, rondas 2–4 (en la 5, al acabar tu turno). */
  command?: (s: GameState, p: P) => Score[];
  /** Al acabar tu turno. */
  turn?: (s: GameState, p: P) => Score[];
  /** Al acabar cualquier turno (también el del rival). */
  anyTurn?: (s: GameState, p: P) => Score[];
  /** Al acabar la batalla. */
  battle?: (s: GameState, p: P) => Score[];
}

// --- Ayudas -----------------------------------------------------------------------------

const objs = (s: GameState) => (s.objectives ?? []).filter((o) => !o.relic);
const held = (s: GameState, p: P) => objs(s).filter((o) => controller(s, o) === p);
const isHome = (o: Objective, p: P) => o.role === "home" && o.home === p;
const nonHome = (s: GameState, p: P) => held(s, p).filter((o) => !isHome(o, p));
const central = (s: GameState, p: P) => held(s, p).filter((o) => o.role === "central");
/** ¿Está en territorio del rival de `p`? (la Legión despliega en z > 0) */
const inTheirTerritory = (o: Objective, p: P) => (PLAYERS[p] === "legion" ? o.z < 0 : o.z > 0);
const holdsTheirHome = (s: GameState, p: P) => held(s, p).some((o) => o.role === "home" && o.home !== p);
const moreThanThem = (s: GameState, p: P) => held(s, p).length > held(s, (1 - p) as P).length;
/** Objetivos (sin contar el de casa) que controla ahora y no controlaba al empezar el turno. */
function gained(s: GameState, p: P): Objective[] {
  const start = s.turnStart?.ctrl ?? {};
  return nonHome(s, p).filter((o) => (start[o.id] ?? null) !== p);
}
const killsIn = (s: GameState, turn: number, during: P) => (s.kills ?? []).filter((k) => k.turn === turn && k.during === during);
const victimOf = (s: GameState, k: KillEntry) => s.units.find((u) => u.id === k.unit);
/** Unidades enemigas de `p` destruidas en el turno en curso. */
const enemyKillsNow = (s: GameState, p: P) => killsIn(s, s.turn, s.active).filter((k) => victimOf(s, k)?.faction !== PLAYERS[p]);
/** Unidades de `p` destruidas en el turno anterior (el del rival). */
function ownKillsPrev(s: GameState, p: P): KillEntry[] {
  const prev = s.active === 0 ? { turn: s.turn - 1, during: 1 as P } : { turn: s.turn, during: 0 as P };
  return killsIn(s, prev.turn, prev.during).filter((k) => victimOf(s, k)?.faction === PLAYERS[p]);
}
const startedOnObjective = (s: GameState, unitId: string) => (s.turnStart?.onObjective ?? []).includes(unitId);
const list = (os: Objective[]) => os.map((o) => o.name).join(", ");
const per = (vp: number, os: Objective[], why: string): Score[] => (os.length ? [{ vp: vp * os.length, why: `${why}: ${list(os)}` }] : []);
const ifThen = (cond: boolean, vp: number, why: string): Score[] => (cond ? [{ vp, why }] : []);

// --- Las diez primarias de Tomar y mantener y Purgar al enemigo -----------------------------

export const PRIMARIES: Record<PrimaryId, Primary> = {
  dominio: {
    id: "dominio", name: "Dominio del campo",
    text: "Rondas 1 y 2, al acabar tu turno: 2 PV si controlas más objetivos que el rival. Desde la ronda 2, al acabar tu mando: 3 PV por objetivo que controles y, si controlas tu objetivo de casa, 2 PV más por cada uno de los demás.",
    turn: (s, p) => ifThen(s.turn <= 2 && moreThanThem(s, p), 2, "Más objetivos que el rival"),
    command: (s, p) => {
      const h = held(s, p), home = h.some((o) => isHome(o, p));
      return [...per(3, h, "Objetivos"), ...(home ? per(2, h.filter((o) => !isHome(o, p)), "Con la casa asegurada") : [])];
    },
  },
  inamovible: {
    id: "inamovible", name: "Objeto inamovible",
    text: "Al acabar tu turno: 3 PV si controlas un objetivo central. Rondas 2–4, al acabar tu mando (en la 5, al acabar tu turno): 5 PV por objetivo que controles, sin contar el de casa.",
    turn: (s, p) => ifThen(central(s, p).length > 0, 3, "Objetivo central"),
    command: (s, p) => per(5, nonHome(s, p), "Objetivos"),
  },
  adquisicion: {
    id: "adquisicion", name: "Adquisición decidida",
    text: "Al acabar tu turno: 2 PV por cada objetivo (sin contar el de casa) que hayas tomado en este turno. Desde la ronda 2, al acabar tu mando: 3 PV por objetivo que controles y 3 más por cada uno en territorio rival.",
    turn: (s, p) => per(2, gained(s, p), "Tomados este turno"),
    command: (s, p) => { const h = held(s, p); return [...per(3, h, "Objetivos"), ...per(3, h.filter((o) => inTheirTerritory(o, p)), "En territorio rival")]; },
  },
  purgarAsegurar: {
    id: "purgarAsegurar", name: "Purgar y asegurar",
    text: "Al acabar tu turno: 3 PV si una unidad tuya a alcance de un objetivo ha destruido una unidad enemiga, y 3 PV si ha caído una unidad enemiga que empezó el turno a alcance de un objetivo. Desde la ronda 2: 4 PV por objetivo (sin contar el de casa) al acabar tu mando, y 3 PV al acabar tu turno si has tomado alguno.",
    turn: (s, p) => {
      const ks = enemyKillsNow(s, p);
      return [
        ...ifThen(ks.some((k) => k.killerOnObjective), 3, "Destruida desde un objetivo"),
        ...ifThen(ks.some((k) => startedOnObjective(s, k.unit)), 3, "Destruida una unidad que guardaba un objetivo"),
        ...ifThen(s.turn >= 2 && gained(s, p).length > 0, 3, "Objetivo tomado"),
      ];
    },
    command: (s, p) => per(4, nonHome(s, p), "Objetivos"),
  },
  ineludible: {
    id: "ineludible", name: "Dominio ineludible",
    text: "Al acabar tu turno: 4 PV si controlas 3 objetivos o más. Desde la ronda 2, al acabar tu mando: 5 PV si controlas 2 o más y 4 PV si controlas más que el rival. Al acabar la batalla: 5 PV si controlas su objetivo de casa.",
    turn: (s, p) => ifThen(held(s, p).length >= 3, 4, "Tres objetivos o más"),
    command: (s, p) => [...ifThen(held(s, p).length >= 2, 5, "Dos objetivos o más"), ...ifThen(moreThanThem(s, p), 4, "Más objetivos que el rival")],
    battle: (s, p) => ifThen(holdsTheirHome(s, p), 5, "Su objetivo de casa"),
  },
  imparable: {
    id: "imparable", name: "Fuerza imparable",
    text: "Al acabar tu turno: 3 PV si ha caído alguna unidad enemiga y, desde la ronda 2, 3 PV si has tomado algún objetivo. Desde la ronda 2, al acabar tu mando: 4 PV por objetivo (sin contar el de casa). Al acabar la batalla: 5 PV si controlas un objetivo central.",
    turn: (s, p) => [...ifThen(enemyKillsNow(s, p).length > 0, 3, "Unidad enemiga destruida"), ...ifThen(s.turn >= 2 && gained(s, p).length > 0, 3, "Objetivo tomado")],
    command: (s, p) => per(4, nonHome(s, p), "Objetivos"),
    battle: (s, p) => ifThen(central(s, p).length > 0, 5, "Objetivo central"),
  },
  picadora: {
    id: "picadora", name: "Picadora de carne",
    text: "Al acabar tu turno: 3 PV si ha caído alguna unidad enemiga y, desde la ronda 2, 5 PV si han caído más unidades enemigas que tuyas en el turno anterior. Desde la ronda 2, al acabar tu mando: 4 PV si controlas algún objetivo que no sea el de casa. Al acabar la batalla: 5 PV si controlas su objetivo de casa.",
    turn: (s, p) => [...ifThen(enemyKillsNow(s, p).length > 0, 3, "Unidad enemiga destruida"),
      ...ifThen(s.turn >= 2 && enemyKillsNow(s, p).length > ownKillsPrev(s, p).length, 5, "Más bajas de las que sufriste")],
    command: (s, p) => ifThen(nonHome(s, p).length > 0, 4, "Objetivo fuera de casa"),
    battle: (s, p) => ifThen(holdsTheirHome(s, p), 5, "Su objetivo de casa"),
  },
  castigo: {
    id: "castigo", name: "Castigo",
    text: "Al empezar tu turno se condenan hasta 3 unidades enemigas que estén en objetivos o que destruyeran una tuya en el turno anterior (si no hay, una cualquiera). Al acabar cualquier turno: 5 PV si ha caído alguna condenada. Desde la ronda 2, al acabar tu mando: 4 PV si controlas algún objetivo que no sea el de casa y 5 PV si controlas más que el rival. Al acabar la batalla: 8 PV si controlas su objetivo de casa.",
    anyTurn: (s, p) => {
      const cond = s.primaryState?.condemned?.[p] ?? [];
      return ifThen(killsIn(s, s.turn, s.active).some((k) => cond.includes(k.unit)), 5, "Cae una unidad condenada");
    },
    command: (s, p) => [...ifThen(nonHome(s, p).length > 0, 4, "Objetivo fuera de casa"), ...ifThen(moreThanThem(s, p), 5, "Más objetivos que el rival")],
    battle: (s, p) => ifThen(holdsTheirHome(s, p), 8, "Su objetivo de casa"),
  },
  consagrar: {
    id: "consagrar", name: "Consagrar",
    text: "Cada unidad tuya que destruya una unidad queda lista para consagrar: al acabar tu turno, si está a alcance de un objetivo sin consagrar (no el de casa), lo consagra. Al acabar tu turno: 3 PV con 1 o 2 consagrados, 6 con 3 o más. Desde la ronda 2, al acabar tu mando: 4 PV si controlas algún objetivo que no sea el de casa y 4 si controlas más que el rival. Al acabar la batalla: 5 PV si su objetivo de casa está consagrado.",
    turn: (s, p) => {
      const n = (s.primaryState?.consecrated?.[p] ?? []).length;
      return n >= 3 ? [{ vp: 6, why: `${n} objetivos consagrados` }] : n >= 1 ? [{ vp: 3, why: `${n} objetivo${n === 1 ? "" : "s"} consagrado${n === 1 ? "" : "s"}` }] : [];
    },
    command: (s, p) => [...ifThen(nonHome(s, p).length > 0, 4, "Objetivo fuera de casa"), ...ifThen(moreThanThem(s, p), 4, "Más objetivos que el rival")],
    battle: (s, p) => ifThen(objs(s).some((o) => o.role === "home" && o.home !== p && (s.primaryState?.consecrated?.[p] ?? []).includes(o.id)), 5, "Su objetivo de casa consagrado"),
  },
  ira: {
    id: "ira", name: "Ira del destructor",
    text: "Al acabar tu turno: 3 PV si ha caído alguna unidad enemiga y, desde la ronda 2, 4 PV si han caído más unidades enemigas que tuyas en el turno anterior. Desde la ronda 2, al acabar tu mando: 4 PV si controlas algún objetivo que no sea el de casa y 6 PV si controlas más que el rival.",
    turn: (s, p) => [...ifThen(enemyKillsNow(s, p).length > 0, 3, "Unidad enemiga destruida"),
      ...ifThen(s.turn >= 2 && enemyKillsNow(s, p).length > ownKillsPrev(s, p).length, 4, "Más bajas de las que sufriste")],
    command: (s, p) => [...ifThen(nonHome(s, p).length > 0, 4, "Objetivo fuera de casa"), ...ifThen(moreThanThem(s, p), 6, "Más objetivos que el rival")],
  },
};

// --- Estado y puntuación ---------------------------------------------------------------

export interface PrimaryState {
  /** PV de primaria de cada jugador en total y en la ronda `round`. */
  total: [number, number];
  round: number;
  inRound: [number, number];
  /** Castigo: unidades condenadas por cada jugador. */
  condemned?: [string[], string[]];
  /** Consagrar: unidades listas para consagrar y objetivos consagrados por cada jugador. */
  consecrators?: [string[], string[]];
  consecrated?: [string[], string[]];
}

/** ¿Se juega con disposiciones de fuerzas? */
export const usesPrimaries = (s: GameState) => !!s.rulesMode && !!s.primaries;

/** Elige las disposiciones (las que falten, al azar entre las disponibles) y las primarias. Muta `s`. */
export function setupDispositions(s: GameState, chosen?: [ForceDisposition | null, ForceDisposition | null]) {
  const fd = [0, 1].map((i) => {
    const c = chosen?.[i];
    if (c && FD_INFO[c].ready) return c;
    const [r, rng] = nextRandom(s.rng);
    s.rng = rng;
    return READY_DISPOSITIONS[Math.floor(r * READY_DISPOSITIONS.length)];
  }) as [ForceDisposition, ForceDisposition];
  s.dispositions = fd;
  s.primaries = [primaryFor(fd[0], fd[1])!, primaryFor(fd[1], fd[0])!];
  s.primaryState = { total: [0, 0], round: 1, inRound: [0, 0], condemned: [[], []], consecrators: [[], []], consecrated: [[], []] };
}

/** Suma PV de primaria con sus topes (45 en total, 15 por ronda salvo al acabar la batalla). */
function award(s: GameState, p: P, scores: Score[], endOfBattle = false) {
  const st = s.primaryState!;
  if (st.round !== s.turn) { st.round = s.turn; st.inRound = [0, 0]; }
  for (const sc of scores) {
    let vp = Math.min(sc.vp, PRIMARY_CAP - st.total[p]);
    if (!endOfBattle) vp = Math.min(vp, PRIMARY_ROUND_CAP - st.inRound[p]);
    if (vp <= 0) continue;
    st.total[p] += vp;
    if (!endOfBattle) st.inRound[p] += vp;
    addVp(s, p, vp, `${PRIMARIES[s.primaries![p]].name}: ${sc.why}${vp < sc.vp ? " (tope)" : ""}`);
  }
}

/** Al empezar el turno: foto del control y de quién está en objetivos; Castigo condena. Muta `s`. */
export function primaryStartTurn(s: GameState) {
  if (!s.rulesMode) return;
  s.turnStart = {
    ctrl: Object.fromEntries((s.objectives ?? []).map((o) => [o.id, o.ctrl ?? null])),
    onObjective: s.units.filter((u) => s.pieces.some((p) => p.unit === u.id) && objectiveInRange(s, u.id)).map((u) => u.id),
  };
  if (!usesPrimaries(s)) return;
  const p = s.active;
  if (s.primaries![p] === "castigo") condemn(s, p);
}

/** Castigo: condena hasta 3 unidades enemigas (las que están en objetivos o mataron en el turno anterior). */
function condemn(s: GameState, p: P) {
  const foes = s.units.filter((u) => u.faction !== PLAYERS[p] && s.pieces.some((q) => q.unit === u.id));
  const killers = new Set(ownKillsPrev(s, p).map((k) => k.killer).filter(Boolean) as string[]);
  // Las más fáciles de rematar primero (menos miniaturas en mesa)
  const size = (id: string) => s.pieces.filter((q) => q.unit === id).length;
  let pick = foes.filter((u) => objectiveInRange(s, u.id) || killers.has(u.id)).map((u) => u.id).sort((a, b) => size(a) - size(b)).slice(0, 3);
  if (!pick.length && foes.length) pick = [foes.map((u) => u.id).sort((a, b) => size(a) - size(b))[0]];
  const st = s.primaryState!;
  st.condemned = [st.condemned?.[0] ?? [], st.condemned?.[1] ?? []];
  st.condemned[p] = pick;
  if (pick.length) note(s, "pv", `Castigo: quedan condenadas ${pick.map((id) => unitName(s, id)).join(", ")}`, p);
}

/** Al acabar la fase de mando del jugador activo (control ya decidido). */
export function primaryEndCommand(s: GameState) {
  if (!usesPrimaries(s) || s.turn < 2 || s.turn >= MAX_ROUNDS) return;
  const p = s.active, m = PRIMARIES[s.primaries![p]];
  if (m.command) award(s, p, m.command(s, p));
}

/** Al acabar el turno del jugador activo (control ya decidido). */
export function primaryEndTurn(s: GameState) {
  if (!usesPrimaries(s)) return;
  const p = s.active, m = PRIMARIES[s.primaries![p]];
  if (s.primaries![p] === "consagrar") consecrate(s, p);
  if (m.turn) award(s, p, m.turn(s, p));
  if (s.turn >= MAX_ROUNDS && m.command) award(s, p, m.command(s, p));   // ronda 5: lo del mando, al acabar el turno
  for (const q of [0, 1] as P[]) { const mq = PRIMARIES[s.primaries![q]]; if (mq.anyTurn) award(s, q, mq.anyTurn(s, q)); }
}

/** Al acabar la batalla. */
export function primaryEndBattle(s: GameState) {
  if (!usesPrimaries(s)) return;
  for (const p of [0, 1] as P[]) { const m = PRIMARIES[s.primaries![p]]; if (m.battle) award(s, p, m.battle(s, p), true); }
}

/** Una unidad acaba de ser destruida: Consagrar marca a la unidad que la destruyó. */
export function onUnitDestroyed(s: GameState, k: KillEntry) {
  if (!usesPrimaries(s) || !k.killer) return;
  const ku = s.units.find((u) => u.id === k.killer);
  if (!ku) return;
  const p = PLAYERS.indexOf(ku.faction) as P;
  if (s.primaries![p] !== "consagrar") return;
  const st = s.primaryState!;
  st.consecrators = [st.consecrators?.[0] ?? [], st.consecrators?.[1] ?? []];
  if (!st.consecrators[p].includes(k.killer)) st.consecrators[p] = [...st.consecrators[p], k.killer];
}

/** Consagrar: al acabar tu turno, cada unidad lista consagra un objetivo a su alcance. */
function consecrate(s: GameState, p: P) {
  const st = s.primaryState!;
  const done = [...(st.consecrated?.[p] ?? [])];
  const left: string[] = [];
  for (const id of st.consecrators?.[p] ?? []) {
    const o = objs(s).find((x) => !isHome(x, p) && !done.includes(x.id) && unitNear(s, id, x));
    if (!o) { if (s.pieces.some((q) => q.unit === id)) left.push(id); continue; }
    done.push(o.id);
    note(s, "pv", `${unitName(s, id)} consagra ${o.name}`, p);
  }
  st.consecrated = [st.consecrated?.[0] ?? [], st.consecrated?.[1] ?? []];
  st.consecrated[p] = done;
  st.consecrators![p] = left;
}

function unitNear(s: GameState, unitId: string, o: Objective): boolean {
  const one = { ...s, objectives: [o] };
  return objectiveInRange(one as GameState, unitId);
}
