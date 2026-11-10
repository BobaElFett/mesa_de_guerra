import type { CommandBus, PieceMove } from "../core/commands";
import { Faction, GameState, TerrainPiece } from "../core/state";
import type { ArmyList } from "./armies";
import { MissionId, objectiveStatus } from "./missions";

// Desafíos (#92): escenarios cortos con un objetivo y de 1 a 3 estrellas. Cada uno prepara la
// mesa (ejércitos, escenografía, posiciones) y dice, mirando el estado, si ya ha acabado.

export interface ChallengeResult { over: boolean; stars: 0 | 1 | 2 | 3; text: string }

/** Memoria del desafío en curso (lo que no está en el estado: p. ej. rondas aguantadas). */
export type ChallengeMemo = Record<string, number>;

export interface Challenge {
  id: string;
  name: string;
  /** Con qué bando juega la persona (la IA lleva el otro). */
  side: Faction;
  brief: string;
  /** Qué da cada estrella. */
  stars: [string, string, string];
  mission: MissionId;
  legion: ArmyList;
  swarm: ArmyList;
  terrain: TerrainPiece[];
  /** Dónde va cada miniatura: [unidad (índice en la lista), x, z, columnas, separación]. */
  place: { faction: Faction; entry: number; x: number; z: number; cols: number; gap: number }[];
  check(s: GameState, memo: ChallengeMemo): ChallengeResult;
}

const T = (id: number, kind: TerrainPiece["kind"], x: number, z: number, rot = 0): TerrainPiece => ({ id: `T${id}`, kind, x, z, rot });
const unitOf = (s: GameState, f: Faction, ds: string) => s.units.find((u) => u.faction === f && u.datasheet === ds);
const alive = (s: GameState, f: Faction) => s.pieces.filter((p) => p.faction === f).length;
const wiped = (s: GameState, unitId: string | undefined) => !!unitId && !s.pieces.some((p) => p.unit === unitId);
const NOT_YET: ChallengeResult = { over: false, stars: 0, text: "" };
/** ¿Acaba de empezar la ronda `r` (turno de la Legión)? */
const roundStarted = (s: GameState, r: number) => s.turn >= r && s.active === 0;

export const CHALLENGES: Challenge[] = [
  {
    id: "bastion", name: "Último bastión", side: "legion", mission: "caza",
    brief: "Una Escuadra de Asalto y su Capitán, en un cráter en medio de la nada. El Enjambre llega por todas partes. Aguanta hasta el final de la ronda 3.",
    stars: ["Sobrevive alguien", "Quedan 5 o más", "Quedan 8 o más"],
    legion: { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }] },
    swarm: { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "garras", models: 20 }, { datasheet: "escupidores", models: 10 }] },
    terrain: [T(1, "crater", 0, 0), T(2, "ruina", -12, 10, 0.4), T(3, "ruina", 11, -15, 0.4)],
    place: [
      { faction: "legion", entry: 0, x: 0, z: -1.8, cols: 1, gap: 1.6 }, { faction: "legion", entry: 1, x: 0, z: 0.2, cols: 5, gap: 1.6 },
      { faction: "swarm", entry: 0, x: 0, z: -17, cols: 1, gap: 2 }, { faction: "swarm", entry: 1, x: -20, z: -6, cols: 5, gap: 1.4 },
      { faction: "swarm", entry: 2, x: 20, z: -6, cols: 5, gap: 1.4 }, { faction: "swarm", entry: 3, x: 0, z: -13, cols: 5, gap: 1.4 },
    ],
    check(s) {
      const n = alive(s, "legion");
      if (!n) return { over: true, stars: 0, text: "Han caído todos." };
      if (!roundStarted(s, 4) && !s.gameOver) return NOT_YET;
      const stars = n >= 8 ? 3 : n >= 5 ? 2 : 1;
      return { over: true, stars, text: `Aguantan ${n} miniaturas.` };
    },
  },
  {
    id: "decapitacion", name: "Decapitación", side: "legion", mission: "caza",
    brief: "El Tirano Sináptico dirige el ataque desde detrás de sus garras. Mátalo: sin él, el Enjambre se descontrola. Cuanto antes, mejor.",
    stars: ["Antes de acabar la ronda 3", "Antes de acabar la ronda 2", "En la ronda 1"],
    legion: { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "fuegoPesado", models: 5, options: ["laser"] }] },
    swarm: { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "escupidores", models: 10 }] },
    terrain: [T(1, "ruina", -10, 0, 0), T(2, "ruina", 10, 0, 0), T(3, "barricada", 0, 6)],
    place: [
      { faction: "legion", entry: 0, x: 3, z: 12.5, cols: 1, gap: 1.6 }, { faction: "legion", entry: 1, x: -3, z: 14.5, cols: 5, gap: 1.6 },
      { faction: "legion", entry: 2, x: 8, z: 15, cols: 5, gap: 1.6 },
      { faction: "swarm", entry: 0, x: 0, z: -14, cols: 1, gap: 2 }, { faction: "swarm", entry: 1, x: -6, z: -8, cols: 10, gap: 1.4 },
      { faction: "swarm", entry: 2, x: 6, z: -11, cols: 5, gap: 1.4 },
    ],
    check(s) {
      const t = unitOf(s, "swarm", "tirano");
      if (wiped(s, t?.id)) { const r = s.turn; return { over: true, stars: (r <= 1 ? 3 : r === 2 ? 2 : 1), text: `El Tirano cae en la ronda ${r}.` }; }
      if (!alive(s, "legion")) return { over: true, stars: 0, text: "La Legión ha caído." };
      if (roundStarted(s, 4) || s.gameOver) return { over: true, stars: 0, text: "El Tirano sigue vivo." };
      return NOT_YET;
    },
  },
  {
    id: "marea", name: "La marea", side: "swarm", mission: "tomar",
    brief: "Juegas con el Enjambre. La Legión defiende su base. Hazte con ella (controla el objetivo «Base Legión») al acabar uno de tus turnos.",
    stars: ["En la ronda 3", "En la ronda 2", "En la ronda 1"],
    legion: { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "fuegoPesado", models: 5 }] },
    swarm: { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "garras", models: 20 }, { datasheet: "acechadores", models: 6 }] },
    terrain: [T(1, "bosque", -16, 4), T(2, "ruina", 4, 2, 0.3), T(3, "crater", -4, -6)],
    place: [
      { faction: "legion", entry: 0, x: -6, z: 12, cols: 1, gap: 1.6 }, { faction: "legion", entry: 1, x: -13, z: 13.5, cols: 5, gap: 1.6 },
      { faction: "legion", entry: 2, x: -4, z: 17, cols: 5, gap: 1.6 },
      { faction: "swarm", entry: 0, x: -6, z: -15, cols: 1, gap: 2 }, { faction: "swarm", entry: 1, x: -18, z: -10, cols: 10, gap: 1.4 },
      { faction: "swarm", entry: 2, x: 2, z: -10, cols: 10, gap: 1.4 }, { faction: "swarm", entry: 3, x: 12, z: -13, cols: 3, gap: 1.8 },
    ],
    check(s, memo) {
      // Al acabar el turno del Enjambre (empieza el de la Legión), ¿es suya la base?
      const base = (s.objectives ?? []).find((o) => o.name === "Base Legión");
      const key = `${s.turn}`;
      if (base && s.active === 0 && s.turn >= 2 && !memo[key]) {
        memo[key] = 1;
        if (objectiveStatus(s, base).holder === 1) { const r = s.turn - 1; return { over: true, stars: (r <= 1 ? 3 : r === 2 ? 2 : 1), text: `La base cae en la ronda ${r}.` }; }
      }
      if (!alive(s, "swarm")) return { over: true, stars: 0, text: "El Enjambre ha sido barrido." };
      if (roundStarted(s, 4) || s.gameOver) return { over: true, stars: 0, text: "La Legión conserva su base." };
      return NOT_YET;
    },
  },
  {
    id: "cazacarros", name: "Cazabestias", side: "legion", mission: "caza",
    brief: "Un Carnífice y el Tirano avanzan juntos. Acaba con las dos bestias antes del final de la ronda 4.",
    stars: ["Antes de acabar la ronda 4", "Antes de acabar la ronda 3", "Antes de acabar la ronda 2"],
    legion: { units: [{ datasheet: "capitan", models: 1, leads: 2 }, { datasheet: "fuegoPesado", models: 5, options: ["laser"] }, { datasheet: "asalto", models: 5, options: ["misiles", "sgtPlasma"] }, { datasheet: "fuegoPesado", models: 5, options: ["misiles"] }] },
    swarm: { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "carnifice", models: 1 }, { datasheet: "garras", models: 10 }] },
    terrain: [T(1, "ruinaGrande", 0, 0, 0), T(2, "crater", -14, 6), T(3, "crater", 14, -6)],
    place: [
      { faction: "legion", entry: 0, x: -1.5, z: 13, cols: 1, gap: 1.6 }, { faction: "legion", entry: 1, x: -8, z: 16, cols: 5, gap: 1.6 },
      { faction: "legion", entry: 2, x: 3, z: 15.5, cols: 5, gap: 1.6 }, { faction: "legion", entry: 3, x: 14, z: 16, cols: 5, gap: 1.6 },
      { faction: "swarm", entry: 0, x: -8, z: -14, cols: 1, gap: 2 }, { faction: "swarm", entry: 1, x: 8, z: -14, cols: 1, gap: 2 },
      { faction: "swarm", entry: 2, x: 0, z: -10, cols: 5, gap: 1.4 },
    ],
    check(s) {
      const a = unitOf(s, "swarm", "tirano"), b = unitOf(s, "swarm", "carnifice");
      if (wiped(s, a?.id) && wiped(s, b?.id)) { const r = s.turn; return { over: true, stars: (r <= 2 ? 3 : r === 3 ? 2 : 1), text: `Las dos bestias caen en la ronda ${r}.` }; }
      if (!alive(s, "legion")) return { over: true, stars: 0, text: "La Legión ha caído." };
      if (roundStarted(s, 5) || s.gameOver) return { over: true, stars: 0, text: "Alguna bestia sigue en pie." };
      return NOT_YET;
    },
  },
  {
    id: "corazon", name: "El corazón", side: "legion", mission: "corazon",
    brief: "Tienes el centro del campo. Contrólalo al acabar el turno del Enjambre en las rondas 1, 2 y 3: cada vez que lo conserves, una estrella.",
    stars: ["Lo conservas una ronda", "Dos rondas", "Las tres"],
    legion: { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "exterminadores", models: 5 }] },
    swarm: { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "acechadores", models: 6 }, { datasheet: "escupidores", models: 10 }] },
    terrain: [T(1, "barricada", -4, -3, 0), T(2, "barricada", 4, -3, 0), T(3, "ruina", -15, -4, 0.5), T(4, "ruina", 15, 4, 0.5)],
    place: [
      { faction: "legion", entry: 0, x: 3.5, z: 0, cols: 1, gap: 1.6 }, { faction: "legion", entry: 1, x: -2, z: 2, cols: 5, gap: 1.6 },
      { faction: "legion", entry: 2, x: -3, z: 6, cols: 5, gap: 1.8 },
      { faction: "swarm", entry: 0, x: 0, z: -16, cols: 1, gap: 2 }, { faction: "swarm", entry: 1, x: -7, z: -12, cols: 10, gap: 1.4 },
      { faction: "swarm", entry: 2, x: 14, z: -13, cols: 3, gap: 1.8 }, { faction: "swarm", entry: 3, x: -21, z: -14, cols: 5, gap: 1.4 },
    ],
    check(s, memo) {
      const heart = (s.objectives ?? []).find((o) => o.name === "Corazón");
      const key = `${s.turn}`;
      if (heart && s.active === 0 && s.turn >= 2 && s.turn <= 4 && !memo[key]) {
        memo[key] = 1;
        if (objectiveStatus(s, heart).holder === 0) memo.held = (memo.held ?? 0) + 1;
      }
      if (roundStarted(s, 4) || s.gameOver || !alive(s, "legion")) {
        const n = Math.min(3, memo.held ?? 0) as 0 | 1 | 2 | 3;
        return { over: true, stars: n, text: n ? `Conservas el centro ${n} ronda${n > 1 ? "s" : ""}.` : "El centro es del Enjambre." };
      }
      return NOT_YET;
    },
  },
];

/** Prepara la mesa del desafío (sin reglas, coloca, y entra en el mando de la ronda 1). */
export function setupChallenge(bus: CommandBus, c: Challenge) {
  bus.dispatch({ type: "setRulesMode", on: false });
  bus.dispatch({ type: "setTerrain", pieces: c.terrain });
  bus.dispatch({ type: "setArmies", legion: c.legion, swarm: c.swarm, mission: c.mission });
  const s = bus.state, moves: PieceMove[] = [];
  for (const pl of c.place) {
    const u = s.units.find((x) => x.faction === pl.faction && x.entry === pl.entry);
    if (!u) continue;
    s.pieces.filter((p) => p.unit === u.id).forEach((p, i) => {
      const col = i % pl.cols, row = Math.floor(i / pl.cols);
      const dir = pl.faction === "legion" ? 1 : -1;
      moves.push({ id: p.id, x: pl.x + (col - (pl.cols - 1) / 2) * pl.gap, z: pl.z + dir * row * pl.gap });
    });
  }
  bus.dispatch({ type: "moveMany", moves });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });     // despliegue → mando de la ronda 1
}
