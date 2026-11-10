import type { DatasheetId } from "../rules/datasheets";
import type { Phase } from "../rules/turn";
import type { TurnLog } from "../rules/movement";
import type { AttackLogEntry } from "../rules/shooting";
import type { MoraleEntry } from "../rules/morale";
import type { KillEntry, MissionId, Objective, VpEntry } from "../rules/missions";

// Estado de la partida: todo lo que hay en la mesa, serializable a JSON.
// La vista Three.js solo lo lee; nada lo cambia salvo applyCommand (commands.ts).
// Unidades: 1 = 1 pulgada. Origen en el centro del tapete, +z hacia el jugador 1 (Legión).

export const BOARD = { w: 60, d: 44 } as const;   // tapete de 60" × 44"
export const DEPLOY_DEPTH = 10;                   // zona de despliegue desde cada borde largo

export type Faction = "legion" | "swarm";
export type ModelKind = "legionario" | "garra" | "capitan" | "pesado" | "andador" | "tirano" | "nodo" | "escupidor" | "exterminador" | "acechador" | "moto" | "carnifice" | "psiquico" | "mente";

/** Radio de la peana en pulgadas: 32 mm para la Legión, 25 mm para las Garras. */
export const BASE_RADIUS: Record<ModelKind, number> = {
  legionario: 0.63, pesado: 0.63, capitan: 0.79, andador: 1.6,     // 32 mm, 32 mm, 40 mm, 90 mm
  garra: 0.49, escupidor: 0.49, nodo: 0.79, tirano: 1.18,          // 25 mm, 25 mm, 40 mm, 60 mm
  exterminador: 0.79, acechador: 0.79,                             // 40 mm (#57)
  moto: 1.0, carnifice: 1.6, psiquico: 0.63, mente: 0.79,                                       // peana de moto y 105 mm (#62)
};

export const FACTIONS: Record<Faction, { name: string; of: string; color: string }> = {
  legion: { name: "Legión Astral", of: "de la Legión Astral", color: "#3d6fd8" },
  swarm: { name: "El Enjambre", of: "del Enjambre", color: "#a24fc4" },
};

export interface Piece {
  id: string;
  faction: Faction;
  model: ModelKind;
  x: number;
  z: number;
  rot: number;      // radianes; 0 = mirando hacia +z
  /** Variante de pose del modelo (0–2). */
  pose?: number;
  /** Sargento de la escuadra / alfa del enjambre. */
  leader?: boolean;
  /** Unidad a la que pertenece (ver GameState.units). */
  unit?: string;
  /** Heridas perdidas; la miniatura cae cuando llegan a su H. */
  damage?: number;
  /** Armas propias (equipo opcional, #63); si no, las de su hoja de datos. */
  weapons?: string[];
}

/** Una unidad del reglamento: varias miniaturas con la misma hoja de datos. */
export interface Unit {
  id: string;
  datasheet: DatasheetId;
  faction: Faction;
  /** Miniaturas con las que empezó (para la moral: «por debajo de la mitad»). */
  startingModels: number;
  /** Desmoralizada hasta su siguiente fase de mando (CO 0, sin PM). */
  shocked?: boolean;
  /** Personaje unido a esta escuadra (id de la unidad que lidera). */
  attachedTo?: string;
  /** Fuera de la mesa, en reserva (#56): sus miniaturas están en `GameState.reserves`. */
  reserve?: boolean;
  /** Coste total con el equipo opcional (#66); sin él, el de su tamaño inicial. */
  points?: number;
  /** Veterana de una batalla anterior de la campaña (#71): repite los 1 al herir. */
  veteran?: boolean;
  /** Índice de su entrada en la lista de ejército (campaña, #70). */
  entry?: number;
}

export type TerrainKind = "ruina" | "ruinaGrande" | "cajas" | "crater" | "bunker" | "barricada" | "bosque";

/** Huella de cada pieza de escenografía (ancho en x × fondo en z, en pulgadas, sin girar). */
export const TERRAIN: Record<TerrainKind, { name: string; w: number; d: number }> = {
  ruina: { name: "Ruina", w: 6, d: 4 },
  ruinaGrande: { name: "Ruina grande", w: 8, d: 6 },
  cajas: { name: "Contenedores", w: 4, d: 3 },
  crater: { name: "Cráter", w: 5, d: 5 },
  bunker: { name: "Búnker", w: 6, d: 4 },
  barricada: { name: "Barricada", w: 4, d: 1 },
  bosque: { name: "Bosque", w: 7, d: 5 },
};

export interface TerrainPiece {
  id: string;
  kind: TerrainKind;
  x: number;
  z: number;
  rot: number;
}

export interface RollRecord {
  player: number;   // 0 o 1
  turn: number;
  sides: number;
  results: number[];
  /** Índices de los dados que se han vuelto a tirar. */
  rerolled?: number[];
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;               // estado actual del generador
  turn: number;              // ronda de batalla, desde 1
  active: 0 | 1;             // jugador que mueve: 0 = Legión, 1 = Enjambre
  phase: Phase;              // fase del turno del jugador activo
  cp: [number, number];      // puntos de mando de cada jugador
  rulesMode: boolean;        // true: modo reglas (el juego guía las fases); false: mesa libre
  gameOver: boolean;         // se acabó la ronda 5
  turnLog: TurnLog;          // lo hecho en el turno en curso (tipo de movimiento, orígenes…)
  combatLog: AttackLogEntry[]; // ataques resueltos, el último al final
  moraleLog: MoraleEntry[];  // chequeos de moral hechos
  pieces: Piece[];
  units: Unit[];
  terrain: TerrainPiece[];
  nextTerrainId: number;     // para dar ids nuevos (T1, T2…) sin repetir
  rolls: RollRecord[];       // últimas tiradas, la más reciente al final
  /** Misión en juego (null: ninguna, mesa libre). */
  mission?: MissionId | null;
  objectives?: Objective[];
  vp?: [number, number];     // puntos de victoria de cada jugador
  vpLog?: VpEntry[];
  kills?: KillEntry[];       // unidades destruidas, en orden
  /** Batalla de la campaña que se juega (1-3, #70). */
  campaignBattle?: number;
  /** Condiciones de batalla (#68). */
  conditions?: "noche" | "tormenta";
  /** Estadísticas por unidad (#65). */
  stats?: Record<string, { dmg: number; kills: number; pts: number; taken: number; lost: number }>;
  killPts?: [number, number];
  /** Miniaturas de las unidades en reserva, fuera de la mesa (#56). */
  reserves?: Piece[];
  /** Registro de la batalla (#53). */
  history?: import("../rules/history").HistoryEntry[];
  /** Carga declarada esperando a que el defensor decida si hace fuego defensivo. */
  pendingCharge?: { unit: string; target: string; defender: 0 | 1 } | null; // puntos de miniaturas enemigas eliminadas por cada jugador (Caza de presas)
}

export const PLAYERS: Faction[] = ["legion", "swarm"];

/** Mesa inicial: una escuadra de la Legión y un enjambre de Garras desplegados. */
export function createInitialState(seed: number): GameState {
  const pieces: Piece[] = [];
  const zLeg = BOARD.d / 2 - 5, zSw = -BOARD.d / 2 + 5;
  for (let i = 0; i < 5; i++) {
    pieces.push({ id: `L${i + 1}`, faction: "legion", model: "legionario", x: (i - 2) * 2, z: zLeg, rot: Math.PI, pose: [1, 2, 0, 0, 1][i], leader: i === 2, unit: "U1" });
  }
  for (let i = 0; i < 10; i++) {
    const row = i < 5 ? 0 : 1;
    pieces.push({
      id: `E${i + 1}`, faction: "swarm", model: "garra",
      x: ((i % 5) - 2) * 1.8 + row * 0.9, z: zSw + row * 1.8, rot: 0, pose: (i * 2) % 3, leader: i === 2, unit: "U2",
    });
  }
  const terrain = exampleMap();
  const units: Unit[] = [
    { id: "U1", datasheet: "asalto", faction: "legion", startingModels: 5 },
    { id: "U2", datasheet: "garras", faction: "swarm", startingModels: 10 },
  ];
  return {
    version: 1, seed, rng: seed, turn: 1, active: 0, phase: "mando", cp: [1, 1], rulesMode: false, gameOver: false,
    turnLog: { moves: {}, origins: {} }, combatLog: [], moraleLog: [],
    pieces, units, terrain, nextTerrainId: terrain.length + 1, rolls: [],
    mission: null, objectives: [], vp: [0, 0], vpLog: [], kills: [],
  };
}

/** Mapa de ejemplo, simétrico respecto al centro del tapete: cada bando tiene lo mismo. */
export function exampleMap(): TerrainPiece[] {
  const half: [TerrainKind, number, number, number][] = [
    ["ruina", -14, -4, 0],
    ["ruinaGrande", -22, 7, Math.PI / 2],
    ["cajas", -6, 8, 0.3],
    ["crater", -6, -9.5, 0],
    ["barricada", -17, 13, 0],
  ];
  const out: TerrainPiece[] = [{ id: "T1", kind: "bunker", x: 0, z: 0, rot: 0 }];
  for (const [kind, x, z, rot] of half) {
    out.push({ id: `T${out.length + 1}`, kind, x, z, rot });
    out.push({ id: `T${out.length + 1}`, kind, x: -x, z: -z, rot: rot + Math.PI });
  }
  return out;
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}
