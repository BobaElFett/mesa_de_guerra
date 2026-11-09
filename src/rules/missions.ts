import { BASE_RADIUS, Faction, GameState, PLAYERS } from "../core/state";
import { DATASHEETS, unitPoints } from "./datasheets";
import { gap } from "./geometry";

// Misiones (#33–#35): objetivos en la mesa, quién los controla y los puntos de victoria (PV).
//  - Control: cada miniatura a 3" o menos del marcador (borde con borde) suma el CO de su unidad
//    (0 si está desmoralizada). Lo controla el bando que sume más; con empate, nadie.
//  - Se puntúa al final del turno de cada jugador desde la ronda 2, según la misión.
//  - Tras la ronda 5 gana quien tenga más PV.

export type MissionId = "tomar" | "corazon" | "caza";

export const OBJECTIVE_RADIUS = 0.79;   // marcador de 40 mm
export const OBJECTIVE_RANGE = 3;

export interface Objective {
  id: string;
  x: number;
  z: number;
  /** PV que da controlarlo al final del turno. */
  vp: number;
  /** Nombre corto (A, B…; «Corazón»). */
  name: string;
}

export interface VpEntry {
  turn: number;
  player: 0 | 1;
  vp: number;
  why: string;
}

export interface KillEntry {
  turn: number;
  /** Jugador que la destruyó. */
  by: 0 | 1;
  unit: string;
}

export interface Mission {
  id: MissionId;
  name: string;
  summary: string;
  /** Objetivos (la mitad; el resto es su simétrico respecto al centro, salvo los del centro). */
  objectives: { x: number; z: number; vp: number; name: string }[];
  /** Tope de PV por objetivos en cada turno. */
  capPerTurn: number;
  /** PV por bajas: 1 por cada `per` puntos de miniaturas enemigas eliminadas (cada una vale lo que cuesta su unidad entre sus miniaturas). */
  killVp?: { per: number };
  /** Cuándo puntúan los objetivos: al empezar tu turno (tras la moral) o al acabarlo. */
  scoreAt: "inicio" | "final";
}

export const FIRST_SCORING_ROUND = 2;

export const MISSIONS: Record<MissionId, Mission> = {
  tomar: {
    id: "tomar", name: "Toma y mantén",
    summary: "Cinco objetivos: uno en cada zona de despliegue, dos en los flancos y el búnker del centro. Al empezar tu turno (desde la ronda 2): 5 PV por cada objetivo que controles, hasta 15. Hay que aguantarlos durante el turno rival.",
    objectives: [
      { x: 0, z: 0, vp: 5, name: "Centro" },
      { x: -20, z: 5, vp: 5, name: "Flanco oeste" }, { x: 20, z: -5, vp: 5, name: "Flanco este" },
      { x: -10, z: 16, vp: 5, name: "Base Legión" }, { x: 10, z: -16, vp: 5, name: "Base Enjambre" },
    ],
    capPerTurn: 15, scoreAt: "inicio",
  },
  corazon: {
    id: "corazon", name: "Corazón del frente",
    summary: "Tres objetivos en la línea central; el búnker del centro vale el doble. Al empezar tu turno (desde la ronda 2): 4 PV por cada flanco y 8 por el Corazón.",
    objectives: [
      { x: 0, z: 0, vp: 8, name: "Corazón" },
      { x: -20, z: 0, vp: 4, name: "Flanco oeste" }, { x: 20, z: 0, vp: 4, name: "Flanco este" },
    ],
    capPerTurn: 16, scoreAt: "inicio",
  },
  caza: {
    id: "caza", name: "Caza de presas",
    summary: "Lo que cuenta son las bajas: 1 PV por cada 20 puntos de miniaturas enemigas eliminadas (cada miniatura vale lo que cuesta su unidad entre sus miniaturas). Además, cuatro objetivos en tierra de nadie dan 2 PV cada uno al final de tu turno (desde la ronda 2, hasta 4).",
    objectives: [
      { x: -12, z: 4, vp: 2, name: "A" }, { x: 12, z: -4, vp: 2, name: "B" },
      { x: -4, z: -6, vp: 2, name: "C" }, { x: 4, z: 6, vp: 2, name: "D" },
    ],
    capPerTurn: 4, scoreAt: "final",
    killVp: { per: 20 },
  },
};

export const DEFAULT_MISSION: MissionId = "tomar";

/** Coloca los objetivos de la misión y pone los PV a cero (muta `s`). */
export function setupMission(s: GameState, id: MissionId) {
  const m = MISSIONS[id] ?? MISSIONS[DEFAULT_MISSION];
  s.mission = m.id;
  s.objectives = m.objectives.map((o, i) => ({ id: `O${i + 1}`, ...o }));
  s.vp = [0, 0];
  s.vpLog = [];
  s.kills = [];
  s.killPts = [0, 0];
}

/** CO de cada bando sobre un objetivo y quién lo controla. */
export function objectiveStatus(s: GameState, o: Objective): { oc: [number, number]; holder: 0 | 1 | null } {
  const oc: [number, number] = [0, 0];
  const marker = { x: o.x, z: o.z, r: OBJECTIVE_RADIUS };
  for (const p of s.pieces) {
    if (!p.unit) continue;
    const u = s.units.find((x) => x.id === p.unit);
    if (!u || u.shocked) continue;
    if (gap({ x: p.x, z: p.z, r: BASE_RADIUS[p.model] }, marker) > OBJECTIVE_RANGE + 1e-6) continue;
    oc[PLAYERS.indexOf(p.faction)] += DATASHEETS[u.datasheet].profile.OC;
  }
  const holder = oc[0] > oc[1] ? 0 : oc[1] > oc[0] ? 1 : null;
  return { oc, holder };
}

export function controlledBy(s: GameState, player: 0 | 1): Objective[] {
  return (s.objectives ?? []).filter((o) => objectiveStatus(s, o).holder === player);
}

function addVp(s: GameState, player: 0 | 1, vp: number, why: string) {
  if (vp <= 0) return;
  s.vp = [s.vp?.[0] ?? 0, s.vp?.[1] ?? 0];
  s.vp[player] += vp;
  s.vpLog = [...(s.vpLog ?? []), { turn: s.turn, player, vp, why }];
}

/**
 * PV del jugador activo por los objetivos que controla (muta `s`). Se llama al empezar su turno
 * (después de la moral) y al acabarlo; solo puntúa en el momento que diga la misión.
 */
export function scoreObjectives(s: GameState, when: "inicio" | "final") {
  if (!s.rulesMode || !s.mission || s.turn < FIRST_SCORING_ROUND) return;
  const m = MISSIONS[s.mission];
  if (m.scoreAt !== when) return;
  const mine = controlledBy(s, s.active);
  const raw = mine.reduce((n, o) => n + o.vp, 0);
  const vp = Math.min(m.capPerTurn, raw);
  if (vp > 0) addVp(s, s.active, vp, `Objetivos: ${mine.map((o) => o.name).join(", ")}${raw > vp ? ` (tope ${m.capPerTurn})` : ""}`);
}

/**
 * Tras un ataque: `slain` miniaturas de `unitId` eliminadas por el jugador `by`. Apunta la unidad
 * si ha quedado destruida y, si la misión da PV por bajas, suma los que tocan (muta `s`).
 */
export function recordCasualties(s: GameState, by: 0 | 1, unitId: string, slain: number) {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || slain <= 0) return;
  const ds = DATASHEETS[u.datasheet];
  if (!s.pieces.some((p) => p.unit === unitId) && !(s.kills ?? []).some((k) => k.unit === unitId)) {
    s.kills = [...(s.kills ?? []), { turn: s.turn, by, unit: unitId }];
  }
  const m = s.mission ? MISSIONS[s.mission] : null;
  if (!m?.killVp || !s.rulesMode) return;
  const pts = ((unitPoints(ds, u.startingModels) ?? 0) / u.startingModels) * slain;
  const bank = [s.killPts?.[0] ?? 0, s.killPts?.[1] ?? 0] as [number, number];
  const before = Math.floor(bank[by] / m.killVp.per);
  bank[by] += pts;
  s.killPts = bank;
  const gained = Math.floor(bank[by] / m.killVp.per) - before;
  if (gained > 0) addVp(s, by, gained, `Bajas en ${ds.name}`);
}

export type Outcome = { winner: Faction | null; vp: [number, number] };

export function outcome(s: GameState): Outcome {
  const vp: [number, number] = [s.vp?.[0] ?? 0, s.vp?.[1] ?? 0];
  return { winner: vp[0] > vp[1] ? "legion" : vp[1] > vp[0] ? "swarm" : null, vp };
}

/** Puntos (del ejército) destruidos de cada bando: proporcional a las miniaturas que faltan. */
export function pointsLost(s: GameState, faction: Faction): number {
  let n = 0;
  for (const u of s.units) if (u.faction === faction) {
    const ds = DATASHEETS[u.datasheet];
    const pts = unitPoints(ds, u.startingModels) ?? 0;
    const alive = s.pieces.filter((p) => p.unit === u.id).length;
    n += pts * (1 - alive / u.startingModels);
  }
  return Math.round(n);
}
