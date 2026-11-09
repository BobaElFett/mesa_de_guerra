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
  /** PV por cada unidad enemiga destruida (y extra si era personaje o grande). */
  killVp?: { unit: number; bonus: number };
}

export const FIRST_SCORING_ROUND = 2;

export const MISSIONS: Record<MissionId, Mission> = {
  tomar: {
    id: "tomar", name: "Toma y mantén",
    summary: "Cinco objetivos: uno en cada zona de despliegue, dos en los flancos y el búnker del centro. Al final de tu turno (desde la ronda 2): 5 PV por cada objetivo que controles, hasta 15 por turno.",
    objectives: [
      { x: 0, z: 0, vp: 5, name: "Centro" },
      { x: -20, z: 0, vp: 5, name: "Flanco oeste" }, { x: 20, z: 0, vp: 5, name: "Flanco este" },
      { x: -10, z: 16, vp: 5, name: "Base Legión" }, { x: 10, z: -16, vp: 5, name: "Base Enjambre" },
    ],
    capPerTurn: 15,
  },
  corazon: {
    id: "corazon", name: "Corazón del frente",
    summary: "Tres objetivos en la línea central; el búnker del centro vale el doble. Al final de tu turno (desde la ronda 2): 4 PV por cada flanco y 8 por el Corazón.",
    objectives: [
      { x: 0, z: 0, vp: 8, name: "Corazón" },
      { x: -20, z: 0, vp: 4, name: "Flanco oeste" }, { x: 20, z: 0, vp: 4, name: "Flanco este" },
    ],
    capPerTurn: 16,
  },
  caza: {
    id: "caza", name: "Caza de presas",
    summary: "Cuatro objetivos en tierra de nadie, 3 PV cada uno al final de tu turno (desde la ronda 2, hasta 6). Además, cada unidad enemiga destruida da 3 PV y 3 más si era un personaje o un vehículo o monstruo.",
    objectives: [
      { x: -12, z: 4, vp: 3, name: "A" }, { x: 12, z: -4, vp: 3, name: "B" },
      { x: -4, z: -6, vp: 3, name: "C" }, { x: 4, z: 6, vp: 3, name: "D" },
    ],
    capPerTurn: 6,
    killVp: { unit: 3, bonus: 3 },
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

/** Al final del turno del jugador activo: PV por los objetivos que controla (muta `s`). */
export function scoreEndOfTurn(s: GameState) {
  if (!s.rulesMode || !s.mission || s.turn < FIRST_SCORING_ROUND) return;
  const m = MISSIONS[s.mission];
  const mine = controlledBy(s, s.active);
  const raw = mine.reduce((n, o) => n + o.vp, 0);
  const vp = Math.min(m.capPerTurn, raw);
  if (vp > 0) addVp(s, s.active, vp, `Objetivos: ${mine.map((o) => o.name).join(", ")}${raw > vp ? ` (tope ${m.capPerTurn})` : ""}`);
}

/** Tras un ataque: apunta las unidades destruidas y da sus PV si la misión los da (muta `s`). */
export function recordKill(s: GameState, by: 0 | 1, unitId: string) {
  if ((s.kills ?? []).some((k) => k.unit === unitId)) return;
  s.kills = [...(s.kills ?? []), { turn: s.turn, by, unit: unitId }];
  const m = s.mission ? MISSIONS[s.mission] : null;
  if (!m?.killVp || !s.rulesMode) return;
  const u = s.units.find((x) => x.id === unitId)!;
  const ds = DATASHEETS[u.datasheet];
  const big = ds.character || ds.big;
  addVp(s, by, m.killVp.unit + (big ? m.killVp.bonus : 0), `Destruye ${ds.name}`);
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
