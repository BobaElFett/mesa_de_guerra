import { reach } from "../rules/conditions";
import type { CommandBus } from "../core/commands";
import { BOARD, GameState, PLAYERS } from "../core/state";
import { DATASHEETS, WEAPONS } from "../rules/datasheets";
import { arrivalBlocked, arrivalPlacement, ARRIVE_GAP, reserveUnits } from "../rules/reserves";
import { OBJECTIVE_RANGE, objectiveStatus } from "../rules/missions";
import { attackValue, expectedAttack, meleeExpected, p2D6 } from "./evaluate";
import { disc, gap } from "../rules/geometry";

// Llegadas desde la reserva para la IA (#56): busca en una rejilla los puntos válidos (a más
// de 9" de todo enemigo) y elige el de más valor: objetivos sin controlar cerca, enemigos a tiro
// (o a distancia de carga, para las de cuerpo a cuerpo). Llega siempre en la ronda 2.

function scorePoint(s: GameState, unitId: string, x: number, z: number, smart: boolean): number {
  const u = s.units.find((q) => q.id === unitId)!;
  const ds = DATASHEETS[u.datasheet];
  const me = PLAYERS.indexOf(u.faction) as 0 | 1;
  const n = (s.reserves ?? []).filter((p) => p.unit === unitId).length;
  const here = { x, z, r: 2 };
  let sc = 0;
  for (const o of s.objectives ?? []) {
    const d = Math.hypot(o.x - x, o.z - z);
    const st = objectiveStatus(s, o);
    if (st.holder !== me) sc += o.vp * 6 * Math.max(0, 1 - Math.max(0, d - OBJECTIVE_RANGE) / 12);
  }
  if (!smart) return sc - Math.abs(z) * 0.5;
  const melee = ds.weapons.every((w) => WEAPONS[w].range === "CC");
  for (const e of s.units.filter((q) => q.faction !== u.faction && s.pieces.some((p) => p.unit === q.id))) {
    const em = s.pieces.filter((p) => p.unit === e.id);
    const g = Math.min(...em.map((p) => gap(here, disc(p))));
    if (melee) sc += p2D6(Math.max(2, Math.ceil(g - 1))) * attackValue(s, e.id, meleeExpected(s, unitId, e.id)) * 0.8;
    else for (const wid of ds.weapons) {
      const w = WEAPONS[wid];
      if (w.range === "CC" || g > reach(s, w)) continue;
      sc = Math.max(sc, sc + 0.5 * attackValue(s, e.id, expectedAttack(s, w, n, e.id, { distance: g })));
    }
  }
  return sc;
}

/** El mejor punto de llegada (o null si no hay ninguno válido). */
export function bestArrival(s: GameState, unitId: string, smart: boolean): { x: number; z: number } | null {
  const u = s.units.find((q) => q.id === unitId)!;
  const enemies = s.pieces.filter((p) => p.faction !== u.faction);
  const cands: { x: number; z: number; sc: number }[] = [];
  for (let x = -BOARD.w / 2 + 3; x <= BOARD.w / 2 - 3; x += 2.5) {
    for (let z = -BOARD.d / 2 + 3; z <= BOARD.d / 2 - 3; z += 2.5) {
      if (enemies.some((e) => Math.hypot(e.x - x, e.z - z) < ARRIVE_GAP + 2.5)) continue;
      cands.push({ x, z, sc: scorePoint(s, unitId, x, z, smart) });
    }
  }
  cands.sort((a, b) => b.sc - a.sc);
  for (const c of cands.slice(0, 25)) if (arrivalPlacement(s, unitId, c.x, c.z)) return c;
  return null;
}

/** Hace llegar una unidad en reserva del jugador activo, si puede. Devuelve true si lo hizo. */
export function arriveStep(bus: CommandBus, smart: boolean): string | null {
  const s = bus.state;
  for (const u of reserveUnits(s, PLAYERS[s.active])) {
    if (arrivalBlocked(s, u.id)) continue;
    const p = bestArrival(s, u.id, smart);
    if (!p) continue;
    bus.dispatch({ type: "arrive", unit: u.id, x: p.x, z: p.z });
    if (!bus.state.units.find((q) => q.id === u.id)?.reserve) return u.id;
  }
  return null;
}
