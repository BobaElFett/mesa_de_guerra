import { FACTIONS, GameState, PLAYERS } from "../core/state";
import { DATASHEETS } from "./datasheets";

// Resumen del turno rival (#100): al volver a tu turno, qué ha hecho el otro bando, sacado de
// comparar el estado al empezar su turno con el de ahora.

export interface Recap {
  player: 0 | 1;
  /** Unidades propias destruidas y miniaturas perdidas. */
  lost: { name: string; models: number; destroyed: boolean }[];
  /** Unidades enemigas destruidas durante su turno (por nosotros, en combate o fuego defensivo). */
  killed: string[];
  vp: [number, number];
  /** Frases destacadas del registro (cargas, estratagemas, poderes, órdenes, moral). */
  lines: string[];
  /** Unidades nuevas en la mesa (llegadas de la reserva). */
  arrived: string[];
}

const KEY_KINDS = new Set(["carga", "estratagema", "moral", "pv"]);

/**
 * Lo que hizo `player` desde `before` (el estado al empezar su turno) hasta `after`.
 * `history` en `before` marca desde dónde leer el registro.
 */
export function turnRecap(before: GameState, after: GameState, player: 0 | 1): Recap {
  const me = (1 - player) as 0 | 1;
  const count = (s: GameState, unit: string) => s.pieces.filter((p) => p.unit === unit).length;
  const lost: Recap["lost"] = [];
  for (const u of before.units) {
    if (u.faction !== PLAYERS[me]) continue;
    const a = count(before, u.id), b = count(after, u.id);
    if (a > b) lost.push({ name: DATASHEETS[u.datasheet].name, models: a - b, destroyed: b === 0 && !(after.reserves ?? []).some((p) => p.unit === u.id) });
  }
  const killed = before.units.filter((u) => u.faction === PLAYERS[player] && count(before, u.id) > 0 && count(after, u.id) === 0
    && !(after.reserves ?? []).some((p) => p.unit === u.id)).map((u) => DATASHEETS[u.datasheet].name);
  const arrived = before.units.filter((u) => u.faction === PLAYERS[player] && count(before, u.id) === 0 && count(after, u.id) > 0)
    .map((u) => DATASHEETS[u.datasheet].name);
  const v0 = before.vp ?? [0, 0], v1 = after.vp ?? [0, 0];
  // Desde la última entrada que ya estaba (el registro se recorta al llegar a su tope)
  const hist = after.history ?? [];
  const last = before.history?.at(-1);
  const at = last ? hist.lastIndexOf(last) : -1;
  const from = at >= 0 ? at + 1 : Math.min(hist.length, before.history?.length ?? 0);
  const lines = hist.slice(from)
    .filter((h) => KEY_KINDS.has(h.kind))
    .map((h) => h.text)
    .slice(-8);
  return { player, lost, killed, vp: [v1[0] - v0[0], v1[1] - v0[1]], lines, arrived };
}

/** El resumen en HTML (corto). */
export function recapHtml(r: Recap): string {
  const name = FACTIONS[PLAYERS[r.player]].name;
  const bits: string[] = [];
  if (r.lost.length) bits.push(`<li><b>Pierdes:</b> ${r.lost.map((l) => l.destroyed ? `<b>${l.name}</b> (destruida)` : `${l.models} de ${l.name}`).join(", ")}</li>`);
  else bits.push(`<li>No has perdido ninguna miniatura.</li>`);
  if (r.killed.length) bits.push(`<li><b>Has destruido:</b> ${r.killed.join(", ")}</li>`);
  if (r.arrived.length) bits.push(`<li><b>Llegan de la reserva:</b> ${r.arrived.join(", ")}</li>`);
  for (const l of r.lines) bits.push(`<li>${l}</li>`);
  const vp = (p: 0 | 1) => r.vp[p] > 0 ? `<span style="color:${FACTIONS[PLAYERS[p]].color}">${FACTIONS[PLAYERS[p]].name} +${r.vp[p]} PV</span>` : "";
  const vps = [vp(r.player), vp((1 - r.player) as 0 | 1)].filter(Boolean).join(" · ");
  return `<div class="rc-head">Lo que ha hecho ${name}${vps ? ` · ${vps}` : ""}</div><ul>${bits.join("")}</ul>`;
}
