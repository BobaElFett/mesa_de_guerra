import { GameState, PLAYERS } from "../core/state";
import type { Phase } from "./turn";
import { DATASHEETS, WEAPONS } from "./datasheets";

// Estratagemas (#36): el jugador activo gasta puntos de mando (PM) en su propio turno.
// Cada estratagema se usa como mucho una vez por turno (cada una va con una sola fase) y
// nunca sobre una unidad desmoralizada, salvo Reagrupar, que es justo para eso.

export type StratId = "reagrupar" | "punteria" | "impetu" | "furia";

export interface Stratagem { id: StratId; name: string; cost: number; phase: Phase; text: string }

export const STRATAGEMS: Record<StratId, Stratagem> = {
  reagrupar: { id: "reagrupar", name: "Reagrupar", cost: 1, phase: "mando", text: "Una unidad desmoralizada se recupera ya (vuelve a tener CO)." },
  punteria: { id: "punteria", name: "Puntería", cost: 1, phase: "disparo", text: "+1 para herir a los disparos de una unidad esta fase." },
  impetu: { id: "impetu", name: "Ímpetu", cost: 1, phase: "carga", text: "Si la carga de una unidad falla, se repite la tirada de 2D6." },
  furia: { id: "furia", name: "Furia", cost: 1, phase: "combate", text: "+1 para impactar a los ataques de combate de una unidad esta fase." },
};

export const STRAT_IDS = Object.keys(STRATAGEMS) as StratId[];

/** ¿Por qué no se puede usar? (null = se puede) */
export function stratBlocked(s: GameState, id: StratId, unitId: string): string | null {
  const st = STRATAGEMS[id];
  const u = s.units.find((x) => x.id === unitId);
  if (!s.rulesMode || s.gameOver) return "Solo en modo reglas.";
  if (!u || !s.pieces.some((p) => p.unit === unitId)) return "Unidad destruida.";
  if (u.faction !== PLAYERS[s.active]) return "Solo en tu turno.";
  if (s.phase !== st.phase) return `Solo en la fase de ${st.phase}.`;
  if ((s.turnLog.strats ?? []).some((x) => x.id === id)) return "Ya usada este turno.";
  if (s.cp[s.active] < st.cost) return "No quedan PM.";
  if (id === "reagrupar") return u.shocked ? null : "No está desmoralizada.";
  if (u.shocked) return "Desmoralizada: no recibe estratagemas.";
  const ds = DATASHEETS[u.datasheet];
  if (id === "punteria" && !ds.weapons.concat(ds.leaderWeapons ?? []).some((w) => WEAPONS[w].range !== "CC")) return "No tiene armas a distancia.";
  if (id === "impetu" && s.turnLog.charges?.[unitId]) return "Ya ha cargado.";
  if (id === "furia" && (s.turnLog.fought ?? []).includes(unitId)) return "Ya ha combatido.";
  return null;
}

/** Gasta los PM y deja la estratagema activa para la unidad (muta `s`). */
export function applyStratagem(s: GameState, id: StratId, unitId: string): boolean {
  if (stratBlocked(s, id, unitId)) return false;
  s.cp = [...s.cp] as [number, number];
  s.cp[s.active] -= STRATAGEMS[id].cost;
  s.turnLog.strats = [...(s.turnLog.strats ?? []), { id, unit: unitId }];
  if (id === "reagrupar") s.units.find((x) => x.id === unitId)!.shocked = false;
  return true;
}

export function hasStrat(s: GameState, id: StratId, unitId: string): boolean {
  return (s.turnLog.strats ?? []).some((x) => x.id === id && x.unit === unitId);
}
