import { note } from "./history";
import { GameState, PLAYERS } from "../core/state";
import { applyCharge } from "./melee";
import { applyStratagem, STRATAGEMS, StratId, stratBlocked, snapTargets, heroicTargets, ReactionKind } from "./stratagems";

// Ventanas de reacción (11.ª, fase 32): en ciertos momentos del turno del rival, el jugador que no
// juega puede usar una estratagema: Fuego defensivo al acabar el movimiento, Cortina de humo al
// empezar el disparo e Intervención heroica al acabar la carga. La partida espera a que decida.

/** Qué estratagemas se usan en cada ventana. */
export const WINDOW_STRATS: Record<ReactionKind, StratId[]> = {
  finMovimiento: ["fuegoDefensivo"],
  inicioDisparo: ["humo"],
  finCarga: ["intervencion"],
};

export const WINDOW_NAME: Record<ReactionKind, string> = {
  finMovimiento: "El rival ha acabado de mover",
  inicioDisparo: "El rival va a disparar",
  finCarga: "El rival ha acabado de cargar",
};

export interface ReactionOption { id: StratId; unit: string; target?: string }

/** Lo que puede hacer el jugador `player` en la ventana `kind` (sin comprobar PM de más). */
export function reactionOptions(s: GameState, kind: ReactionKind, player: 0 | 1): ReactionOption[] {
  const saved = s.reaction;
  s.reaction = { kind, player };
  const out: ReactionOption[] = [];
  for (const id of WINDOW_STRATS[kind]) for (const u of s.units) {
    if (u.faction !== PLAYERS[player] || stratBlocked(s, id, u.id)) continue;
    const targets = id === "fuegoDefensivo" ? snapTargets(s, u.id) : id === "intervencion" ? heroicTargets(s, u.id) : [undefined];
    for (const t of targets) out.push({ id, unit: u.id, target: t });
  }
  s.reaction = saved;
  return out;
}

/**
 * Abre la ventana si el rival del jugador activo tiene algo que hacer en ella y aún no se ha
 * abierto este turno. Devuelve true si la ha abierto (la partida espera). Muta `s`.
 */
export function openReaction(s: GameState, kind: ReactionKind): boolean {
  if (!s.rulesMode || s.gameOver || s.reaction) return false;
  if ((s.turnLog.reacted ?? []).includes(kind)) return false;
  const other = (1 - s.active) as 0 | 1;
  if (!reactionOptions(s, kind, other).length) return false;
  s.reaction = { kind, player: other };
  return true;
}

/** El jugador de la ventana decide (una estratagema o nada) y la ventana se cierra. Devuelve su tipo. */
export function resolveReactionWindow(s: GameState, choice?: ReactionOption): ReactionKind | null {
  const r = s.reaction;
  if (!r) return null;
  if (choice && WINDOW_STRATS[r.kind].includes(choice.id)) {
    if (!applyStratagem(s, choice.id, choice.unit, choice.target)) note(s, "estratagema", `No se pudo usar ${STRATAGEMS[choice.id].name}`, r.player);
    if (choice.id === "humo") s.turnLog.smoke = [...(s.turnLog.smoke ?? []), choice.unit];
  }
  s.reaction = null;
  s.turnLog.reacted = [...(s.turnLog.reacted ?? []), r.kind];
  return r.kind;
}

/** La orden de carga (11.ª: ya no hay fuego defensivo al declararla). */
export function declareCharge(s: GameState, unit: string, target: string) {
  applyCharge(s, unit, target);
}
