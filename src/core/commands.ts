import { formation } from "../rules/leaders";
import { GameState, BOARD, cloneState, createInitialState, TerrainKind, TERRAIN } from "./state";
import { rollDice } from "./rng";
import { advancePhase, endTurn } from "../rules/turn";
import type { MoveKind } from "../rules/movement";
import { applyShoot } from "../rules/shooting";
import { applyCharge, applyFight } from "../rules/melee";
import { deployArmies, ArmyList } from "../rules/armies";

// Toda acción sobre la mesa es una orden. El estado se obtiene aplicando las órdenes
// en orden desde la mesa inicial: así hay deshacer, guardado y, más adelante, juego en línea
// (se envían las órdenes, no el estado).

export type Command =
  | { type: "move"; id: string; x: number; z: number }
  | { type: "rotate"; id: string; rot: number }
  /** Mover (y girar) varias miniaturas a la vez: un solo paso de deshacer. */
  | { type: "moveMany"; moves: PieceMove[] }
  | { type: "roll"; count: number; sides: number }
  /** Poner una pieza de escenografía (recibe el id T<n> siguiente). */
  | { type: "addTerrain"; kind: TerrainKind; x: number; z: number; rot: number }
  | { type: "removeTerrain"; ids: string[] }
  /** Sustituye los ejércitos por dos listas desplegadas en sus zonas. */
  | { type: "setArmies"; legion: ArmyList; swarm: ArmyList }
  /** Mesa libre: retirar miniaturas a mano (bajas, recolocar…). */
  | { type: "removePieces"; ids: string[] }
  /** Volver a tirar algunos dados de la última tirada (por índice). */
  | { type: "reroll"; indices: number[] }
  | { type: "endTurn" }
  /** Modo reglas: pasa a la fase siguiente (y al otro jugador tras el combate). */
  | { type: "nextPhase" }
  | { type: "setRulesMode"; on: boolean }
  /** Fase de disparo: una unidad dispara un arma a una unidad enemiga. */
  | { type: "shoot"; unit: string; weapon: string; target: string }
  /** Fase de carga: declarar una carga (tira 2D6 y, si llega, entra en contacto). */
  | { type: "charge"; unit: string; target: string }
  /** Fase de combate: la unidad se agrupa, golpea a la enemiga y consolida. */
  | { type: "fight"; unit: string; target: string }
  /** Fase de movimiento: la unidad elige mover, avanzar (tira 1D6) o retirarse. */
  | { type: "declareMove"; unit: string; kind: MoveKind }
  /** Gastar puntos de mando (p. ej. 1 PM para repetir una tirada). */
  | { type: "spendCP"; player: 0 | 1; amount: number };

export interface PieceMove { id: string; x: number; z: number; rot?: number }

const MAX_ROLLS = 30;

/** Aplica una orden y devuelve un estado nuevo. Pura: no modifica `state`. */
export function applyCommand(state: GameState, cmd: Command): GameState {
  const s = cloneState(state);
  switch (cmd.type) {
    case "move": {
      const p = s.pieces.find((q) => q.id === cmd.id);
      if (!p) break;
      p.x = clamp(cmd.x, -BOARD.w / 2, BOARD.w / 2);
      p.z = clamp(cmd.z, -BOARD.d / 2, BOARD.d / 2);
      break;
    }
    case "rotate": {
      const p = s.pieces.find((q) => q.id === cmd.id);
      if (p) p.rot = cmd.rot;
      break;
    }
    case "moveMany": {
      for (const m of cmd.moves) {
        const p = s.pieces.find((q) => q.id === m.id) ?? s.terrain.find((q) => q.id === m.id);
        if (!p) continue;
        p.x = clamp(m.x, -BOARD.w / 2, BOARD.w / 2);
        p.z = clamp(m.z, -BOARD.d / 2, BOARD.d / 2);
        if (m.rot !== undefined) p.rot = m.rot;
      }
      break;
    }
    case "roll": {
      const count = clamp(Math.round(cmd.count), 1, 60);
      const sides = clamp(Math.round(cmd.sides), 2, 20);
      const [results, rng] = rollDice(s.rng, count, sides);
      s.rng = rng;
      s.rolls.push({ player: s.active, turn: s.turn, sides, results });
      if (s.rolls.length > MAX_ROLLS) s.rolls.splice(0, s.rolls.length - MAX_ROLLS);
      break;
    }
    case "addTerrain": {
      if (!(cmd.kind in TERRAIN)) break;
      s.terrain.push({
        id: `T${s.nextTerrainId}`, kind: cmd.kind,
        x: clamp(cmd.x, -BOARD.w / 2, BOARD.w / 2), z: clamp(cmd.z, -BOARD.d / 2, BOARD.d / 2), rot: cmd.rot,
      });
      s.nextTerrainId += 1;
      break;
    }
    case "setArmies": {
      deployArmies(s, cmd.legion, cmd.swarm);
      break;
    }
    case "removePieces": {
      const gone = new Set(cmd.ids);
      s.pieces = s.pieces.filter((p) => !gone.has(p.id));
      break;
    }
    case "removeTerrain": {
      const gone = new Set(cmd.ids);
      s.terrain = s.terrain.filter((t) => !gone.has(t.id));
      break;
    }
    case "reroll": {
      const r = s.rolls.at(-1);
      if (!r) break;
      const idx = [...new Set(cmd.indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < r.results.length).sort((a, b) => a - b);
      if (!idx.length) break;
      const [vals, rng] = rollDice(s.rng, idx.length, r.sides);
      s.rng = rng;
      idx.forEach((i, k) => { r.results[i] = vals[k]; });
      r.rerolled = [...new Set([...(r.rerolled ?? []), ...idx])].sort((a, b) => a - b);
      break;
    }
    case "endTurn": {
      endTurn(s);
      break;
    }
    case "nextPhase": {
      advancePhase(s);
      break;
    }
    case "declareMove": {
      if (!s.units.some((u) => u.id === cmd.unit)) break;
      const move: { kind: MoveKind; advance?: number } = { kind: cmd.kind };
      if (cmd.kind === "avanzar") {
        const [[d], rng] = rollDice(s.rng, 1, 6);
        s.rng = rng;
        move.advance = d;
        s.rolls.push({ player: s.active, turn: s.turn, sides: 6, results: [d] });
      }
      for (const u of formation(s, cmd.unit)) s.turnLog.moves[u] = move;   // el líder y su escuadra, juntos
      break;
    }
    case "shoot": {
      applyShoot(s, cmd.unit, cmd.weapon, cmd.target);
      break;
    }
    case "charge": {
      applyCharge(s, cmd.unit, cmd.target);
      break;
    }
    case "fight": {
      applyFight(s, cmd.unit, cmd.target);
      break;
    }
    case "setRulesMode": {
      s.rulesMode = !!cmd.on;
      break;
    }
    case "spendCP": {
      const n = Math.max(0, Math.round(cmd.amount));
      if (s.cp[cmd.player] >= n) s.cp[cmd.player] -= n;   // (las desmoralizadas no reciben PM: lo comprueba quien gasta)
      break;
    }
  }
  return s;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export interface SavedTable {
  v: 1;
  seed: number;
  log: Command[];
  cursor: number;
}

/**
 * Historial de órdenes con deshacer y rehacer.
 * `log` guarda todas las órdenes; `cursor` dice cuántas están aplicadas.
 */
export class CommandBus {
  private initial: GameState;
  private log: Command[] = [];
  private cursor = 0;
  state: GameState;
  private listeners: ((s: GameState, cmd: Command | null) => void)[] = [];

  constructor(public seed: number) {
    this.initial = createInitialState(seed);
    this.state = this.initial;
  }

  /** Mesa nueva con otra semilla (no se puede deshacer). */
  reset(seed: number) {
    this.seed = seed;
    this.initial = createInitialState(seed);
    this.state = this.initial;
    this.log = [];
    this.cursor = 0;
    this.emit(null);
  }

  /** Sustituye la mesa por una guardada (no se puede deshacer). */
  load(saved: SavedTable) {
    this.seed = saved.seed;
    this.initial = createInitialState(saved.seed);
    this.log = saved.log.slice();
    this.cursor = Math.min(saved.cursor, this.log.length);
    this.state = this.replay();
    this.emit(null);
  }

  static restore(saved: SavedTable): CommandBus {
    const bus = new CommandBus(saved.seed);
    bus.log = saved.log.slice();
    bus.cursor = Math.min(saved.cursor, bus.log.length);
    bus.state = bus.replay();
    return bus;
  }

  onChange(fn: (s: GameState, cmd: Command | null) => void) {
    this.listeners.push(fn);
  }

  dispatch(cmd: Command) {
    this.log.length = this.cursor;          // una orden nueva descarta lo deshecho
    this.log.push(cmd);
    this.cursor++;
    this.state = applyCommand(this.state, cmd);
    this.emit(cmd);
  }

  get canUndo() { return this.cursor > 0; }
  get canRedo() { return this.cursor < this.log.length; }
  get length() { return this.cursor; }

  undo() {
    if (!this.canUndo) return;
    this.cursor--;
    this.state = this.replay();
    this.emit(null);
  }

  redo() {
    if (!this.canRedo) return;
    this.state = applyCommand(this.state, this.log[this.cursor]);
    this.cursor++;
    this.emit(null);
  }

  serialize(): SavedTable {
    return { v: 1, seed: this.seed, log: this.log.slice(), cursor: this.cursor };
  }

  private replay(): GameState {
    let s = this.initial;
    for (let i = 0; i < this.cursor; i++) s = applyCommand(s, this.log[i]);
    return s;
  }

  private emit(cmd: Command | null) {
    for (const fn of this.listeners) fn(this.state, cmd);
  }
}
