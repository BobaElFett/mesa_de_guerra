// Estado de la partida: todo lo que hay en la mesa, serializable a JSON.
// La vista Three.js solo lo lee; nada lo cambia salvo applyCommand (commands.ts).
// Unidades: 1 = 1 pulgada. Origen en el centro del tapete, +z hacia el jugador 1 (Legión).

export const BOARD = { w: 60, d: 44 } as const;   // tapete de 60" × 44"
export const DEPLOY_DEPTH = 10;                   // zona de despliegue desde cada borde largo

export type Faction = "legion" | "swarm";
export type ModelKind = "legionario" | "garra";

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
}

export interface RollRecord {
  player: number;   // 0 o 1
  turn: number;
  sides: number;
  results: number[];
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;               // estado actual del generador
  turn: number;              // ronda de batalla, desde 1
  active: 0 | 1;             // jugador que mueve: 0 = Legión, 1 = Enjambre
  pieces: Piece[];
  rolls: RollRecord[];       // últimas tiradas, la más reciente al final
}

export const PLAYERS: Faction[] = ["legion", "swarm"];

/** Mesa inicial: una escuadra de la Legión y un enjambre de Garras desplegados. */
export function createInitialState(seed: number): GameState {
  const pieces: Piece[] = [];
  const zLeg = BOARD.d / 2 - 5, zSw = -BOARD.d / 2 + 5;
  for (let i = 0; i < 5; i++) {
    pieces.push({ id: `L${i + 1}`, faction: "legion", model: "legionario", x: (i - 2) * 2, z: zLeg, rot: Math.PI });
  }
  for (let i = 0; i < 10; i++) {
    const row = i < 5 ? 0 : 1;
    pieces.push({
      id: `E${i + 1}`, faction: "swarm", model: "garra",
      x: ((i % 5) - 2) * 1.8 + row * 0.9, z: zSw + row * 1.8, rot: 0,
    });
  }
  return { version: 1, seed, rng: seed, turn: 1, active: 0, pieces, rolls: [] };
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}
