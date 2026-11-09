import { runtime, settings } from "../ai/settings";
import { formation, formationModels } from "../rules/leaders";
import { CommandBus, PieceMove } from "../core/commands";
import { FACTIONS, PLAYERS } from "../core/state";
import { PHASE_INFO } from "../rules/turn";
import { checkDeploy, clampToZone } from "../rules/deployment";
import { BASE_RADIUS } from "../core/state";
import { allowance, checkMove, clampToAllowance, isEngaged, originOf } from "../rules/movement";
import { PiecesView } from "../view/piecesView";
import { RulesGate } from "./pieceControls";

// Las reglas de la fase en curso aplicadas a la mano del jugador (modo reglas).
// En mesa libre no hay puerta: todo se mueve como antes.

export function createRulesGate(bus: CommandBus, view: PiecesView, notify: (msg: string) => void): () => RulesGate | null {
  const unitOf = (id: string) => bus.state.pieces.find((p) => p.id === id)?.unit ?? null;
  const minisOf = (ids: string[]) => ids.filter((id) => view.pieceOf(id));
  const inMovement = () => bus.state.rulesMode && bus.state.phase === "movimiento";
  const deploying = () => bus.state.rulesMode && bus.state.phase === "despliegue" && !bus.state.gameOver;

  const gate: RulesGate = {
    selectionFor(id, single) {
      const u = unitOf(id);
      if (!u || single) return [id];
      return formationModels(bus.state, u).map((p) => p.id);     // con su líder, si lo tiene
    },

    blockMove(ids) {
      const s = bus.state;
      const minis = minisOf(ids);
      if (!minis.length) return null;                       // escenografía desbloqueada: se mueve libre
      if (s.gameOver) return "La partida ha terminado.";
      if (deploying()) {
        const factions = new Set(minis.map((id) => view.pieceOf(id)!.faction));
        if (runtime.localSide && [...factions].some((f) => f !== runtime.localSide)) return "Esas unidades las coloca tu rival.";
        if (!runtime.online && settings.aiSide && factions.has(settings.aiSide)) return "Esas unidades las coloca la IA.";
        return factions.size > 1 ? "Despliega cada bando por separado." : null;
      }
      if (runtime.online && runtime.localSide) {
        if (minis.some((id) => view.pieceOf(id)!.faction !== runtime.localSide)) return "Esas miniaturas son de tu rival.";
        if (PLAYERS[s.active] !== runtime.localSide) return "Es el turno de tu rival.";
      }
      if (!runtime.online && settings.aiSide && !runtime.aiPaused && PLAYERS[s.active] === settings.aiSide) return "Es el turno de la IA (Pausar IA para moverla a mano).";
      if (s.phase !== "movimiento") return `En la fase de ${PHASE_INFO[s.phase].name.toLowerCase()} no se mueve a mano. Para colocar libremente, cambia a Mesa libre.`;
      const units = new Set(minis.map((id) => { const u = unitOf(id); return u ? formation(s, u)[0] : null; }));
      if (units.size > 1) return "Mueve las unidades de una en una.";
      const u = [...units][0]!;
      const unit = s.units.find((x) => x.id === u)!;
      if (unit.faction !== PLAYERS[s.active]) return `Es el turno ${FACTIONS[PLAYERS[s.active]].of}.`;
      if (!s.turnLog.moves[u]) {
        if (formation(s, u).some((id) => isEngaged(s, id))) return "Unidad trabada: elige Retirarse en su panel (o déjala quieta).";
        bus.dispatch({ type: "declareMove", unit: u, kind: "normal" });   // mover sin más = movimiento normal
      }
      return null;
    },

    clampLive(id, x, z) {
      if (deploying()) {
        const p = view.pieceOf(id);
        return p ? [x, clampToZone(p.faction, BASE_RADIUS[p.model], z)] : [x, z];
      }
      if (!inMovement()) return [x, z];
      const p = view.pieceOf(id), u = p?.unit;
      if (!p || !u) return [x, z];
      return clampToAllowance(originOf(bus.state, p), x, z, allowance(bus.state, u, bus.state.turnLog.moves[u]));
    },

    label(ids) {
      if (deploying()) return minisOf(ids).length ? `<span class="dim">Zona de despliegue</span>` : null;
      if (!inMovement()) return null;
      const minis = minisOf(ids);
      const u = minis.length ? unitOf(minis[0]) : null;
      if (!u) return null;
      let used = 0;
      for (const id of minis) {
        const p = view.pieceOf(id)!, g = view.groupOf(id)!;
        const [ox, oz] = originOf(bus.state, p);
        used = Math.max(used, Math.hypot(g.position.x - ox, g.position.z - oz));
      }
      const max = allowance(bus.state, u, bus.state.turnLog.moves[u]);
      return `${fmt(used)} <span class="dim">de ${fmt(max)}</span>`;
    },

    finalize(moves) {
      if (deploying()) {
        const rest = moves.filter((m) => !view.pieceOf(m.id));
        const r = checkDeploy(bus.state, moves.filter((m) => view.pieceOf(m.id)));
        if (r.message) notify(r.message);
        return [...r.moves, ...rest] as PieceMove[];
      }
      if (!inMovement()) return moves;
      const minis = moves.filter((m) => view.pieceOf(m.id));
      const rest = moves.filter((m) => !view.pieceOf(m.id));
      const u = minis.length ? unitOf(minis[0].id) : null;
      if (!u) return moves;
      const move = bus.state.turnLog.moves[u] ?? { kind: "normal" as const };
      const r = checkMove(bus.state, u, minis, move);
      if (r.message) notify(r.message);
      return [...r.moves, ...rest] as PieceMove[];
    },

    notify,
  };
  return () => (bus.state.rulesMode ? gate : null);
}

const fmt = (v: number) => `${v.toFixed(1).replace(".", ",")}"`;
