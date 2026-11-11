import { onForbiddenTerrain } from "./geometry";
import { BASE_RADIUS, BOARD, DEPLOY_DEPTH, Faction, GameState, Piece } from "../core/state";
import { DATASHEETS } from "./datasheets";
import { PieceMove } from "../core/commands";
import { resolveOverlaps } from "../core/placement";

// Fase de despliegue: cada bando recoloca sus miniaturas dentro de su zona, sin solapes.

/** Franja de z donde puede estar el centro de una peana de radio `r` de este bando. */
export function zoneBand(faction: Faction, r: number): [number, number] {
  const edge = BOARD.d / 2;
  return faction === "legion" ? [edge - DEPLOY_DEPTH + r, edge - r] : [-edge + r, -edge + DEPLOY_DEPTH - r];
}

/** Infiltradores (#103): pueden desplegar en su mitad, a más de esto de la línea central. */
export const INFILTRATE_LINE = 6;

const infiltrates = (s: GameState, unit?: string) => {
  const u = unit ? s.units.find((x) => x.id === unit) : undefined;
  return !!u && DATASHEETS[u.datasheet].abilities.includes("infiltrador");
};

/** Franja de z donde puede desplegar esta miniatura (la de su zona o, si se infiltra, su mitad). */
export function pieceBand(s: GameState, p: { faction: Faction; model: Piece["model"]; unit?: string }): [number, number] {
  const r = BASE_RADIUS[p.model];
  if (!infiltrates(s, p.unit)) return zoneBand(p.faction, r);
  const edge = BOARD.d / 2;
  return p.faction === "legion" ? [INFILTRATE_LINE + r, edge - r] : [-edge + r, -INFILTRATE_LINE - r];
}

export function clampToZone(faction: Faction, r: number, z: number): number {
  const [lo, hi] = zoneBand(faction, r);
  return Math.min(hi, Math.max(lo, z));
}

/** Coloca las miniaturas soltadas: dentro de su zona y sin solapes; las que no caben vuelven. */
export function checkDeploy(s: GameState, moves: PieceMove[]): { moves: PieceMove[]; rejected: string[]; message: string | null } {
  const byId = new Map(s.pieces.map((p) => [p.id, p]));
  const minis = moves.filter((m) => byId.has(m.id));
  let clamped = false;
  const wanted = minis.map((m) => {
    const p = byId.get(m.id)!;
    const [lo, hi] = pieceBand(s, p);
    const z = Math.min(hi, Math.max(lo, m.z));
    if (Math.abs(z - m.z) > 0.01) clamped = true;
    return { ...m, z };
  });
  const rejected: string[] = [];
  const placed = resolveOverlaps(s.pieces, wanted, {
    zBand: (id) => pieceBand(s, byId.get(id)!),
    blocked: (x, z, r) => onForbiddenTerrain(s.terrain, x, z, r + 0.05) !== null,
    rejected,
  });
  const out = placed.filter((m) => !rejected.includes(m.id));
  let message: string | null = null;
  if (rejected.length) message = `No hay sitio en la zona de despliegue (${rejected.length === 1 ? "1 miniatura vuelve" : `${rejected.length} vuelven`} a su sitio).`;
  else if (clamped) message = "Solo dentro de tu zona de despliegue (la franja de tu color); los infiltradores, en tu mitad a más de 6\" del centro.";
  return { moves: out, rejected, message };
}
