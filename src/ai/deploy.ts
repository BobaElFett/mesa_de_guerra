import type { PieceMove } from "../core/commands";
import { BASE_RADIUS, BOARD, DEPLOY_DEPTH, Faction, GameState } from "../core/state";
import { checkDeploy, INFILTRATE_LINE, pieceBand } from "../rules/deployment";
import { DATASHEETS } from "../rules/datasheets";
import { formation, formationModels } from "../rules/leaders";
import { TERRAIN_RULES } from "../rules/geometry";
import { roleOf } from "./tactics";

// Despliegue de la IA (#51): las pesadas junto al objetivo de su base (si la misión tiene uno)
// o atrás en el centro; las de disparo, en cobertura si hay ruinas en su zona; las de choque
// se quedan en primera línea, donde las pone la lista (probado: moverlas salía peor).

export function aiDeploy(s: GameState, f: Faction): PieceMove[] {
  const sign = f === "legion" ? 1 : -1;                     // la Legión, en z > 0
  const edge = BOARD.d / 2;
  const front = sign * (edge - DEPLOY_DEPTH);                // línea delantera de la zona
  const back = sign * (edge - 1);
  const heads = s.units.filter((u) => u.faction === f && s.pieces.some((p) => p.unit === u.id) && formation(s, u.id)[0] === u.id);
  const objs = s.objectives ?? [];
  const home = objs.find((o) => Math.sign(o.z) === sign && Math.abs(o.z) > edge - DEPLOY_DEPTH - 1);
  const cover = s.terrain.filter((t) => TERRAIN_RULES[t.kind].cover && !TERRAIN_RULES[t.kind].noEnd && Math.sign(t.z) === sign && Math.abs(t.z) > edge - DEPLOY_DEPTH - 2);
  const order = [...heads].sort((a, b) => rank(s, a.id) - rank(s, b.id));
  const lanes = [-16, 16, 0, -8, 8, -24, 24];
  let lane = 0, coverUsed = 0;
  const moves: PieceMove[] = [];
  // Quién guarda la base: la pesada, o si no hay, la primera de disparo
  const keeper = home ? (order.find((u) => roleOf(s, u.id) === "heavy") ?? order.find((u) => roleOf(s, u.id) === "shooter")) : undefined;
  for (const u of order) {
    const role = roleOf(s, u.id);
    let cx: number, cz: number;
    const infiltrator = DATASHEETS[u.datasheet].abilities.includes("infiltrador");
    if (infiltrator) {
      // Infiltrados: en ruinas (o bosque) de su mitad cerca de la línea, si hay; si no, en un flanco adelantado
      const hide = s.terrain.find((t) => TERRAIN_RULES[t.kind].cover && !TERRAIN_RULES[t.kind].noEnd && Math.sign(t.z) === sign && Math.abs(t.z) > INFILTRATE_LINE + 1 && Math.abs(t.z) < INFILTRATE_LINE + 10);
      if (hide) { cx = hide.x; cz = hide.z; } else { cx = lanes[lane++ % lanes.length]; cz = sign * (INFILTRATE_LINE + 4); }
    } else if (u === keeper && home) { cx = home.x; cz = home.z; }
    else if (role === "heavy") { cx = 0; cz = back - sign * 2; }
    else if (role === "melee") continue;          // las de choque se quedan donde las pone la lista (delante) else if (coverUsed < cover.length) { const t = cover[coverUsed++]; cx = t.x; cz = t.z; }
    else { cx = lanes[lane++ % lanes.length]; cz = front + sign * 5; }
    // Rejilla de 5 por fila alrededor del punto, de frente hacia el enemigo
    const ms = formationModels(s, u.id);
    const r = Math.max(...ms.map((p) => BASE_RADIUS[p.model]));
    const step = 2 * r + 0.5, per = Math.min(5, ms.length);
    ms.forEach((p, i) => {
      const col = i % per, row = Math.floor(i / per);
      const band = pieceBand(s, p);
      const z = Math.max(band[0], Math.min(band[1], cz + sign * row * step));
      moves.push({ id: p.id, x: cx + (col - (per - 1) / 2) * step, z });
    });
  }
  return checkDeploy(s, moves).moves;
}

/** Orden de colocación: pesadas primero (eligen sitio), luego disparo y al final las de choque. */
function rank(s: GameState, id: string) {
  const r = roleOf(s, id);
  return r === "heavy" ? 0 : r === "shooter" ? 1 : 2;
}

