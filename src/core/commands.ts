import { GameState, BOARD, cloneState, createInitialState } from "./state";
import { rollDice } from "./rng";

// Toda acción sobre la mesa es una orden. El estado se obtiene aplicando las órdenes
// en orden desde la mesa inicial: así hay deshacer, guardado y, más adelante, juego en línea
// (se envían las órdenes, no el estado).

export type Command =
  | { type: "move"; id: string; x: number; z: number }
  | { type: "rotate"; id: string; rot: number }
  | { type: "roll"; count: number; sides: number }
  | { type: "endTurn" };

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
    case "roll": {
      const count = clamp(Math.round(cmd.count), 1, 60);
      const sides = clamp(Math.round(cmd.sides), 2, 20);
      const [results, rng] = rollDice(s.rng, count, sides);
      s.rng = rng;
      s.rolls.push({ player: s.active, turn: s.turn, sides, results });
      if (s.rolls.length > MAX_ROLLS) s.rolls.splice(0, s.rolls.length - MAX_ROLLS);
      break;
    }
    case "endTurn": {
      if (s.active === 1) s.turn += 1;
      s.active = s.active === 0 ? 1 : 0;
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
