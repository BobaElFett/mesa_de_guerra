// Estado de la partida: todo lo que hay en la mesa, serializable a JSON.
// La vista Three.js solo lo lee; nada lo cambia salvo applyCommand (commands.ts).
// Unidades: 1 = 1 pulgada. Origen en el centro del tapete, +z hacia el jugador 1 (Legión).

export const BOARD = { w: 60, d: 44 } as const;   // tapete de 60" × 44"
export const DEPLOY_DEPTH = 10;                   // zona de despliegue desde cada borde largo

export type Faction = "legion" | "swarm";
export type ModelKind = "legionario" | "garra";

/** Radio de la peana en pulgadas: 32 mm para la Legión, 25 mm para las Garras. */
export const BASE_RADIUS: Record<ModelKind, number> = { legionario: 0.63, garra: 0.49 };

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
}

export type TerrainKind = "ruina" | "ruinaGrande" | "cajas" | "crater" | "bunker" | "barricada";

/** Huella de cada pieza de escenografía (ancho en x × fondo en z, en pulgadas, sin girar). */
export const TERRAIN: Record<TerrainKind, { name: string; w: number; d: number }> = {
  ruina: { name: "Ruina", w: 6, d: 4 },
  ruinaGrande: { name: "Ruina grande", w: 8, d: 6 },
  cajas: { name: "Contenedores", w: 4, d: 3 },
  crater: { name: "Cráter", w: 5, d: 5 },
  bunker: { name: "Búnker", w: 6, d: 4 },
  barricada: { name: "Barricada", w: 4, d: 1 },
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
  pieces: Piece[];
  terrain: TerrainPiece[];
  nextTerrainId: number;     // para dar ids nuevos (T1, T2…) sin repetir
  rolls: RollRecord[];       // últimas tiradas, la más reciente al final
}

export const PLAYERS: Faction[] = ["legion", "swarm"];

/** Mesa inicial: una escuadra de la Legión y un enjambre de Garras desplegados. */
export function createInitialState(seed: number): GameState {
  const pieces: Piece[] = [];
  const zLeg = BOARD.d / 2 - 5, zSw = -BOARD.d / 2 + 5;
  for (let i = 0; i < 5; i++) {
    pieces.push({ id: `L${i + 1}`, faction: "legion", model: "legionario", x: (i - 2) * 2, z: zLeg, rot: Math.PI, pose: [1, 2, 0, 0, 1][i], leader: i === 2 });
  }
  for (let i = 0; i < 10; i++) {
    const row = i < 5 ? 0 : 1;
    pieces.push({
      id: `E${i + 1}`, faction: "swarm", model: "garra",
      x: ((i % 5) - 2) * 1.8 + row * 0.9, z: zSw + row * 1.8, rot: 0, pose: (i * 2) % 3, leader: i === 2,
    });
  }
  const terrain = exampleMap();
  return { version: 1, seed, rng: seed, turn: 1, active: 0, pieces, terrain, nextTerrainId: terrain.length + 1, rolls: [] };
}

/** Mapa de ejemplo, simétrico respecto al centro del tapete: cada bando tiene lo mismo. */
function exampleMap(): TerrainPiece[] {
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
