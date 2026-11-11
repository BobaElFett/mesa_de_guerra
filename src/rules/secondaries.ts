import { BOARD, DEPLOY_DEPTH, GameState, PLAYERS } from "../core/state";
import { nextRandom } from "../core/rng";
import { DATASHEETS } from "./datasheets";
import { addVp, controlledBy } from "./missions";
import { note } from "./history";

// Objetivos secundarios (#97): cada jugador tiene su propio mazo de órdenes. Al empezar su fase
// de mando roba hasta tener 2 en la mano; al acabar su turno, cada orden cumplida da sus PV y se
// descarta. Una vez por turno puede descartar una orden para ganar 1 PM. Las órdenes imposibles
// (matar a un personaje que ya no existe…) se descartan al robarlas.

export type SecondaryId = "decapitar" | "golpe" | "masacre" | "coloso" | "frentes" | "lineas" | "centro" | "asaltar" | "choque";

export interface Secondary {
  id: SecondaryId;
  name: string;
  text: string;
  vp: number;
  /** Tipo, para la IA y el icono: bajas, posición o acción. */
  kind: "bajas" | "posicion" | "accion";
  /** ¿Se cumple ahora (al acabar el turno del jugador `p`)? */
  done: (s: GameState, p: 0 | 1) => boolean;
  /** ¿Se puede cumplir todavía? Si no, se descarta al robarla. */
  possible?: (s: GameState, p: 0 | 1) => boolean;
}

export const HAND_SIZE = 2;
/** Tope de PV por objetivos secundarios en toda la partida. */
export const SECONDARY_CAP = 20;
/** Distancia al centro de la mesa para «Dominar el centro» y «Todos los frentes». */
export const CENTRE_RANGE = 6;

/** Unidades enemigas destruidas en el turno en curso por el jugador activo. */
function killsThisTurn(s: GameState, p: 0 | 1): string[] {
  return (s.kills ?? []).filter((k) => k.turn === s.turn && k.by === p && k.during === p).map((k) => k.unit);
}

function dsOf(s: GameState, unitId: string) {
  const u = s.units.find((x) => x.id === unitId);
  return u ? DATASHEETS[u.datasheet] : undefined;
}

const enemyUnits = (s: GameState, p: 0 | 1) => s.units.filter((u) => u.faction !== PLAYERS[p]
  && (s.pieces.some((x) => x.unit === u.id) || (s.reserves ?? []).some((x) => x.unit === u.id)));

/** Miniaturas en mesa de unidades del jugador que no estén desmoralizadas. */
function steadyModels(s: GameState, p: 0 | 1) {
  const ok = new Set(s.units.filter((u) => u.faction === PLAYERS[p] && !u.shocked).map((u) => u.id));
  return s.pieces.filter((x) => x.unit && ok.has(x.unit));
}

/** Cuadrante de la mesa (0-3) de un punto, o null si está a menos de CENTRE_RANGE del centro. */
export function quarterOf(x: number, z: number): number | null {
  if (Math.hypot(x, z) < CENTRE_RANGE) return null;
  return (x < 0 ? 0 : 1) + (z < 0 ? 0 : 2);
}

/** ¿Está el punto dentro de la zona de despliegue enemiga del jugador `p`? */
export function inEnemyZone(p: 0 | 1, z: number): boolean {
  const edge = BOARD.d / 2;
  return p === 0 ? z <= -edge + DEPLOY_DEPTH : z >= edge - DEPLOY_DEPTH;
}

/** ¿Está el objetivo en la mitad enemiga del jugador `p`? (la Legión empieza en z > 0) */
const enemyHalf = (p: 0 | 1, z: number) => (p === 0 ? z < -2 : z > 2);

export const SECONDARIES: Record<SecondaryId, Secondary> = {
  decapitar: {
    id: "decapitar", name: "Decapitar", kind: "bajas", vp: 4,
    text: "Destruye en tu turno una unidad enemiga de personaje (Capitán, Psíquico, Tirano, Mente).",
    done: (s, p) => killsThisTurn(s, p).some((id) => dsOf(s, id)?.character),
    possible: (s, p) => enemyUnits(s, p).some((u) => DATASHEETS[u.datasheet].character),
  },
  golpe: {
    id: "golpe", name: "Golpe certero", kind: "bajas", vp: 3,
    text: "Destruye en tu turno al menos una unidad enemiga.",
    done: (s, p) => killsThisTurn(s, p).length >= 1,
  },
  masacre: {
    id: "masacre", name: "Masacre", kind: "bajas", vp: 5,
    text: "Destruye en tu turno dos o más unidades enemigas.",
    done: (s, p) => killsThisTurn(s, p).length >= 2,
    possible: (s, p) => enemyUnits(s, p).length >= 2,
  },
  coloso: {
    id: "coloso", name: "Abatir al coloso", kind: "bajas", vp: 4,
    text: "Destruye en tu turno una unidad enemiga grande (Andador, Tirano, Carnífice).",
    done: (s, p) => killsThisTurn(s, p).some((id) => dsOf(s, id)?.big),
    possible: (s, p) => enemyUnits(s, p).some((u) => DATASHEETS[u.datasheet].big),
  },
  frentes: {
    id: "frentes", name: "Todos los frentes", kind: "posicion", vp: 3,
    text: `Acaba tu turno con miniaturas tuyas (no desmoralizadas) en tres de los cuatro cuartos de la mesa, a más de ${CENTRE_RANGE}" del centro.`,
    done: (s, p) => new Set(steadyModels(s, p).map((m) => quarterOf(m.x, m.z)).filter((q) => q !== null)).size >= 3,
  },
  lineas: {
    id: "lineas", name: "Tras las líneas", kind: "posicion", vp: 4,
    text: "Acaba tu turno con una miniatura tuya (no desmoralizada) dentro de la zona de despliegue enemiga.",
    done: (s, p) => steadyModels(s, p).some((m) => inEnemyZone(p, m.z)),
  },
  centro: {
    id: "centro", name: "Dominar el centro", kind: "posicion", vp: 3,
    text: `Acaba tu turno con una miniatura tuya (no desmoralizada) a ${CENTRE_RANGE}" del centro de la mesa y ninguna enemiga tan cerca.`,
    done: (s, p) => {
      const near = (m: { x: number; z: number }) => Math.hypot(m.x, m.z) <= CENTRE_RANGE;
      return steadyModels(s, p).some(near) && !s.pieces.some((m) => m.unit && m.faction !== PLAYERS[p] && near(m));
    },
  },
  asaltar: {
    id: "asaltar", name: "Asaltar su objetivo", kind: "posicion", vp: 4,
    text: "Acaba tu turno controlando un objetivo de la mitad enemiga de la mesa.",
    done: (s, p) => controlledBy(s, p).some((o) => !o.relic && enemyHalf(p, o.z)),
    possible: (s, p) => (s.objectives ?? []).some((o) => !o.relic && enemyHalf(p, o.z)),
  },
  choque: {
    id: "choque", name: "Choque", kind: "accion", vp: 3,
    text: "Haz en tu turno dos o más cargas con éxito.",
    done: (s) => Object.values(s.turnLog.charges ?? {}).filter((c) => c.success).length >= 2,
  },
};

export const SECONDARY_IDS = Object.keys(SECONDARIES) as SecondaryId[];

export interface SecondaryState {
  deck: [SecondaryId[], SecondaryId[]];
  hand: [SecondaryId[], SecondaryId[]];
  /** Órdenes cumplidas, con la ronda. */
  scored: [{ id: SecondaryId; turn: number; vp: number }[], { id: SecondaryId; turn: number; vp: number }[]];
  /** Ronda y jugador del último descarte por PM (uno por turno). */
  discardedTurn?: [number, number];
}

/** Baraja con la semilla de la partida (muta `s.rng`). */
function shuffle(s: GameState): SecondaryId[] {
  const a = [...SECONDARY_IDS];
  for (let i = a.length - 1; i > 0; i--) {
    const [v, n] = nextRandom(s.rng);
    s.rng = n;
    const j = Math.floor(v * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Empieza los objetivos secundarios (al montar la partida). */
export function setupSecondaries(s: GameState, on: boolean) {
  if (!on) { delete s.secondaries; return; }
  s.secondaries = { deck: [shuffle(s), shuffle(s)], hand: [[], []], scored: [[], []] };
}

export const secondaryVp = (s: GameState, p: 0 | 1) => (s.secondaries?.scored[p] ?? []).reduce((n, x) => n + x.vp, 0);

/** El jugador activo roba hasta tener la mano llena (al empezar su mando). */
export function drawSecondaries(s: GameState) {
  const sec = s.secondaries;
  if (!sec || !s.rulesMode) return;
  const p = s.active;
  const deck = [...sec.deck[p]], hand = [...sec.hand[p]].filter((id) => SECONDARIES[id].possible?.(s, p) ?? true);
  const drawn: string[] = [];
  while (hand.length < HAND_SIZE && deck.length) {
    const id = deck.shift()!;
    if (SECONDARIES[id].possible && !SECONDARIES[id].possible!(s, p)) continue;
    hand.push(id);
    drawn.push(SECONDARIES[id].name);
  }
  s.secondaries = { ...sec, deck: replace(sec.deck, p, deck), hand: replace(sec.hand, p, hand) };
  if (drawn.length) note(s, "turno", `Órdenes nuevas: ${drawn.join(", ")}`, p);
}

/** Al acabar el turno del jugador activo: PV por las órdenes cumplidas. */
export function scoreSecondaries(s: GameState) {
  const sec = s.secondaries;
  if (!sec || !s.rulesMode) return;
  const p = s.active;
  const keep: SecondaryId[] = [];
  let scored = [...sec.scored[p]];
  for (const id of sec.hand[p]) {
    const c = SECONDARIES[id];
    if (!c.done(s, p)) { keep.push(id); continue; }
    const room = SECONDARY_CAP - scored.reduce((n, x) => n + x.vp, 0);
    const vp = Math.max(0, Math.min(c.vp, room));
    scored = [...scored, { id, turn: s.turn, vp }];
    if (vp > 0) addVp(s, p, vp, `Orden cumplida: ${c.name}`);
    else note(s, "pv", `Orden cumplida: ${c.name} (ya se alcanzó el tope de ${SECONDARY_CAP} PV)`, p);
  }
  s.secondaries = { ...sec, hand: replace(sec.hand, p, keep), scored: replace(sec.scored, p, scored) };
}

/** ¿Puede el jugador activo descartar ahora esa orden por 1 PM? Devuelve el motivo si no. */
export function discardBlocked(s: GameState, id: SecondaryId): string | null {
  const sec = s.secondaries;
  if (!sec || !s.rulesMode || s.gameOver) return "No hay objetivos secundarios en esta partida.";
  if (s.phase === "despliegue") return "Aún no ha empezado la batalla.";
  if (!sec.hand[s.active].includes(id)) return "Esa orden no está en tu mano.";
  if (sec.discardedTurn && sec.discardedTurn[0] === s.turn && sec.discardedTurn[1] === s.active) return "Ya has descartado una orden este turno.";
  return null;
}

/** Descarta una orden de la mano del jugador activo y le da 1 PM (muta `s`). */
export function discardSecondary(s: GameState, id: SecondaryId) {
  if (discardBlocked(s, id)) return;
  const sec = s.secondaries!;
  const p = s.active;
  s.secondaries = { ...sec, hand: replace(sec.hand, p, sec.hand[p].filter((x) => x !== id)), discardedTurn: [s.turn, p] };
  s.cp = (p === 0 ? [s.cp[0] + 1, s.cp[1]] : [s.cp[0], s.cp[1] + 1]) as [number, number];
  note(s, "turno", `Descarta la orden ${SECONDARIES[id].name}: +1 PM`, p);
}

function replace<T>(pair: [T, T], p: 0 | 1, v: T): [T, T] {
  return p === 0 ? [v, pair[1]] : [pair[0], v];
}
