import type { GameState } from "../core/state";
import { DATASHEETS } from "./datasheets";

// Registro de la batalla (#53): frases cortas de lo que pasa, guardadas en el estado (así
// deshacer y rehacer, la red y las partidas guardadas lo tienen igual que el resto).

export type HistoryKind = "turno" | "mover" | "disparo" | "carga" | "combate" | "estratagema" | "moral" | "pv" | "baja";

export interface HistoryEntry { turn: number; player: 0 | 1; kind: HistoryKind; text: string }

const MAX = 400;

export function note(s: GameState, kind: HistoryKind, text: string, player: 0 | 1 = s.active) {
  const h = s.history ?? [];
  s.history = [...(h.length >= MAX ? h.slice(h.length - MAX + 1) : h), { turn: s.turn, player, kind, text }];
}

export const unitName = (s: GameState, id: string) => {
  const u = s.units.find((x) => x.id === id);
  return u ? DATASHEETS[u.datasheet].name : "?";
};
