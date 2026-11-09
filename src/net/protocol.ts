import type { BusOp, Command, SavedTable } from "../core/commands";
import { Faction, GameState, PLAYERS } from "../core/state";
import type { ArmyList } from "../rules/armies";
import type { MissionId } from "../rules/missions";

// Partidas en línea (#40, #43): mensajes entre anfitrión e invitado, permisos y huella.
//
// El anfitrión es la autoridad: el invitado le pide cada operación, el anfitrión comprueba
// que puede hacerla, la aplica y la reenvía numerada (`seq`) con la huella del estado que le
// queda. Como todo es determinista (la semilla va en el estado), los dos llegan a la misma
// mesa; si alguna vez la huella no coincide, el invitado pide la partida entera.

export const PROTOCOL = 1;

export type Role = "host" | "guest";

export type NetMsg =
  | { t: "hello"; v: number; name: string }
  | { t: "welcome"; v: number; name: string; hostSide: Faction; snapshot: SavedTable; issuers: Role[]; seq: number }
  | { t: "req"; op: BusOp }
  | { t: "op"; seq: number; op: BusOp; by: Role; hash: string }
  | { t: "reject"; reason: string }
  | { t: "sync" }
  | { t: "list"; faction: Faction; list: ArmyList }
  | { t: "setup"; mission: MissionId }
  | { t: "chat"; text: string; by: Role }
  | { t: "ping"; at: number }
  | { t: "pong"; at: number }
  | { t: "bye" };

/** Huella del estado (FNV-1a de su JSON): basta para saber si dos mesas son iguales. */
export function stateHash(s: GameState): string {
  const txt = JSON.stringify(s);
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ":" + txt.length.toString(36);
}

const sideOfPiece = (s: GameState, id: string): Faction | "terrain" | null => {
  const p = s.pieces.find((x) => x.id === id);
  if (p) return p.faction;
  return s.terrain.some((t) => t.id === id) ? "terrain" : null;
};
const sideOfUnit = (s: GameState, id: string): Faction | null => s.units.find((u) => u.id === id)?.faction ?? null;

/**
 * ¿Puede el jugador de `side` (anfitrión o invitado) hacer esta operación? Devuelve el motivo
 * si no. `lastBy` / `nextBy`: quién hizo la orden que se desharía / rehará.
 */
export function permission(s: GameState, op: BusOp, by: Role, side: Faction, lastBy: Role | null, nextBy: Role | null): string | null {
  const host = by === "host";
  switch (op.k) {
    case "reset": case "load": return host ? null : "Solo el anfitrión puede cambiar de mesa.";
    case "undo": return !s.rulesMode || lastBy === by ? null : "Solo puedes deshacer lo tuyo.";
    case "redo": return !s.rulesMode || nextBy === by ? null : "Solo puedes rehacer lo tuyo.";
    case "cmd": return cmdPermission(s, op.cmd, host, side);
  }
}

function cmdPermission(s: GameState, c: Command, host: boolean, side: Faction): string | null {
  const active = PLAYERS[s.active];
  if (c.type === "setArmies" || c.type === "setRulesMode") return host ? null : "Preparar la partida es cosa del anfitrión.";
  if (!s.rulesMode) return null;                       // mesa libre: como en una mesa de verdad
  const ownPieces = (ids: string[]) => ids.every((id) => { const f = sideOfPiece(s, id); return f === side || (f === "terrain" && host) || f === null; });
  switch (c.type) {
    case "move": case "rotate": return ownPieces([c.id]) ? null : "Esas miniaturas son del rival.";
    case "moveMany": return ownPieces(c.moves.map((m) => m.id)) ? null : "Esas miniaturas son del rival.";
    case "removePieces": return ownPieces(c.ids) ? null : "Esas miniaturas son del rival.";
    case "addTerrain": case "removeTerrain": return host ? null : "La escenografía la coloca el anfitrión.";
    case "declareMove": case "shoot": case "charge": case "stratagem":
      if (sideOfUnit(s, c.unit) !== side) return "Esa unidad es del rival.";
      return active === side ? null : "No es tu turno.";
    case "fight": return sideOfUnit(s, c.unit) === side ? null : "Esa unidad es del rival.";
    case "nextPhase": case "endTurn":
      if (s.phase === "despliegue") return null;
      return active === side ? null : "No es tu turno.";
    case "spendCP": return PLAYERS[c.player] === side ? null : "Esos PM son del rival.";
    case "reactCharge": return s.pendingCharge && PLAYERS[s.pendingCharge.defender] === side ? null : "No te toca decidir.";
    default: return null;                              // tiradas de dados sueltas, etc.
  }
}
