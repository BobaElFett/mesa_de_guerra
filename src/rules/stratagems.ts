import { note, unitName } from "./history";
import { BASE_RADIUS, Faction, GameState, Piece, PLAYERS } from "../core/state";
import type { Phase } from "./turn";
import { DATASHEETS, WEAPONS } from "./datasheets";
import { disc, gap, sight, onForbiddenTerrain, ENGAGEMENT } from "./geometry";
import { isEngaged, unitModels, enemyModels } from "./movement";
import { performAttack } from "./shooting";
import { inSynapse } from "./morale";
import { resolveOverlaps } from "../core/placement";
import { rollDice } from "../core/rng";
import { respawn } from "./special";

// Estratagemas (#36): el jugador activo gasta puntos de mando (PM) en su propio turno.
// Cada estratagema se usa como mucho una vez por turno (cada una va con una sola fase) y
// nunca sobre una unidad desmoralizada, salvo Reagrupar, que es justo para eso.

export type StratId = "reagrupar" | "punteria" | "impetu" | "furia" | "granadas" | "oleada"
  | "fuegoSostenido" | "avanceTactico" | "frenesi" | "hambre";

export interface Stratagem {
  id: StratId; name: string; cost: number; phase: Phase; text: string;
  /** Solo para este bando (#52). */
  faction?: Faction;
  /** Necesita un objetivo enemigo (se elige en la mesa). */
  needsTarget?: boolean;
}

export const STRATAGEMS: Record<StratId, Stratagem> = {
  reagrupar: { id: "reagrupar", name: "Reagrupar", cost: 1, phase: "mando", text: "Una unidad desmoralizada se recupera ya (vuelve a tener CO)." },
  punteria: { id: "punteria", name: "Puntería", cost: 1, phase: "disparo", text: "+1 para herir a los disparos de una unidad esta fase." },
  impetu: { id: "impetu", name: "Ímpetu", cost: 1, phase: "carga", text: "Si la carga de una unidad falla, se repite la tirada de 2D6." },
  furia: { id: "furia", name: "Furia", cost: 1, phase: "combate", text: "+1 para impactar a los ataques de combate de una unidad esta fase." },
  granadas: { id: "granadas", name: "Granadas", cost: 1, phase: "disparo", faction: "legion", needsTarget: true,
    text: "Una unidad que puede disparar lanza granadas a un enemigo visible a 8\" o menos: 6D6, cada 4+ es una herida mortal (sin salvación). Puede disparar igual." },
  oleada: { id: "oleada", name: "Oleada sin fin", cost: 1, phase: "mando", faction: "swarm",
    text: "Unas Garras Menores en sinapsis que hayan perdido miniaturas recuperan D3+1, junto a la unidad." },
  // Estratagemas propias de cada bando (#123)
  fuegoSostenido: { id: "fuegoSostenido", name: "Fuego sostenido", cost: 1, phase: "disparo", faction: "legion",
    text: "Las armas a distancia de una unidad ganan Sostenida 1 esta fase: cada 6 para impactar da un impacto más." },
  avanceTactico: { id: "avanceTactico", name: "Avance táctico", cost: 1, phase: "movimiento", faction: "legion",
    text: "Una unidad puede disparar este turno aunque avance, como si todas sus armas fueran de Asalto." },
  frenesi: { id: "frenesi", name: "Frenesí", cost: 1, phase: "combate", faction: "swarm",
    text: "Cada miniatura de una unidad hace 1 ataque más en combate esta fase." },
  hambre: { id: "hambre", name: "Hambre voraz", cost: 1, phase: "carga", faction: "swarm",
    text: "+2 a la tirada de carga de una unidad esta fase." },
};

export const GRENADE_RANGE = 8;

export const STRAT_IDS = Object.keys(STRATAGEMS) as StratId[];

/** ¿Por qué no se puede usar? (null = se puede) */
export function stratBlocked(s: GameState, id: StratId, unitId: string): string | null {
  const st = STRATAGEMS[id];
  const u = s.units.find((x) => x.id === unitId);
  if (!s.rulesMode || s.gameOver) return "Solo en modo reglas.";
  if (!u || !s.pieces.some((p) => p.unit === unitId)) return "Unidad destruida.";
  if (u.faction !== PLAYERS[s.active]) return "Solo en tu turno.";
  if (st.faction && u.faction !== st.faction) return "No es de tu bando.";
  if (s.phase !== st.phase) return `Solo en la fase de ${st.phase}.`;
  if ((s.turnLog.strats ?? []).some((x) => x.id === id)) return "Ya usada este turno.";
  if (s.cp[s.active] < st.cost) return "No quedan PM.";
  if (id === "reagrupar") return u.shocked ? null : "No está desmoralizada.";
  if (u.shocked) return "Desmoralizada: no recibe estratagemas.";
  const ds = DATASHEETS[u.datasheet];
  if (id === "punteria" && !ds.weapons.concat(ds.leaderWeapons ?? []).some((w) => WEAPONS[w].range !== "CC")) return "No tiene armas a distancia.";
  if (id === "impetu" && s.turnLog.charges?.[unitId]) return "Ya ha cargado.";
  if ((id === "furia" || id === "frenesi") && (s.turnLog.fought ?? []).includes(unitId)) return "Ya ha combatido.";
  if (id === "hambre" && s.turnLog.charges?.[unitId]) return "Ya ha cargado.";
  if (id === "fuegoSostenido" && !ds.weapons.concat(ds.leaderWeapons ?? []).some((w) => WEAPONS[w].range !== "CC")) return "No tiene armas a distancia.";
  if (id === "fuegoSostenido" && (s.turnLog.shot?.[unitId] ?? []).length) return "Ya ha disparado.";
  if (id === "avanceTactico" && !ds.weapons.concat(ds.leaderWeapons ?? []).some((w) => WEAPONS[w].range !== "CC")) return "No tiene armas a distancia.";
  if (id === "avanceTactico" && s.turnLog.moves[unitId]?.kind === "retirarse") return "Se ha retirado.";
  if (id === "granadas") {
    if (isEngaged(s, unitId)) return "Trabada en combate.";
    const mv = s.turnLog.moves[unitId];
    if (mv && mv.kind !== "normal") return mv.kind === "avanzar" ? "Ha avanzado." : "Se ha retirado.";
    if (!grenadeTargets(s, unitId).length) return "Ningún enemigo visible a 8\" o menos.";
  }
  if (id === "oleada") {
    if (u.datasheet !== "garras") return "Solo Garras Menores.";
    if (!inSynapse(s, unitId)) return "No está en sinapsis.";
    if (unitModels(s, unitId).length >= u.startingModels) return "No ha perdido miniaturas.";
  }
  return null;
}

/** Enemigos a los que puede lanzar granadas (visibles, a 8" o menos de alguna miniatura). */
export function grenadeTargets(s: GameState, unitId: string): string[] {
  const mine = unitModels(s, unitId);
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return [];
  return s.units.filter((e) => e.faction !== u.faction && s.pieces.some((p) => p.unit === e.id)).filter((e) => {
    const theirs = unitModels(s, e.id);
    return mine.some((a) => theirs.some((b) => gap(disc(a), disc(b)) <= GRENADE_RANGE && sight(disc(a), disc(b), s.terrain) !== "oculta"));
  }).map((e) => e.id);
}

/** Gasta los PM y deja la estratagema activa para la unidad (muta `s`). */
export function applyStratagem(s: GameState, id: StratId, unitId: string, target?: string): boolean {
  if (stratBlocked(s, id, unitId)) return false;
  if (id === "granadas" && (!target || !grenadeTargets(s, unitId).includes(target))) return false;
  s.cp = [...s.cp] as [number, number];
  s.cp[s.active] -= STRATAGEMS[id].cost;
  s.turnLog.strats = [...(s.turnLog.strats ?? []), { id, unit: unitId }];
  note(s, "estratagema", `Estratagema ${STRATAGEMS[id].name} (${STRATAGEMS[id].cost} PM) en ${unitName(s, unitId)}${target ? ` contra ${unitName(s, target)}` : ""}`);
  if (id === "reagrupar") s.units.find((x) => x.id === unitId)!.shocked = false;
  if (id === "granadas") throwGrenades(s, unitId, target!);
  if (id === "oleada") endlessWave(s, unitId);
  return true;
}

export function hasStrat(s: GameState, id: StratId, unitId: string): boolean {
  return (s.turnLog.strats ?? []).some((x) => x.id === id && x.unit === unitId);
}

/** Granadas: una miniatura (la más cercana) lanza 6D6 a 4+; cada éxito, una herida mortal. */
function throwGrenades(s: GameState, unitId: string, target: string) {
  const theirs = unitModels(s, target);
  const thrower = unitModels(s, unitId).map((p) => ({ p, d: Math.min(...theirs.map((q) => gap(disc(p), disc(q)))) })).sort((a, b) => a.d - b.d)[0];
  if (!thrower) return;
  performAttack(s, "disparo", unitId, [thrower.p], WEAPONS.granadas, target, { distance: thrower.d, mortal: true });
}

/** Oleada sin fin: vuelven D3+1 Garras (sin pasar de las iniciales), pegadas a la unidad. */
function endlessWave(s: GameState, unitId: string) {
  const u = s.units.find((x) => x.id === unitId)!;
  const models = unitModels(s, unitId);
  const [d, rng] = rollDice(s.rng, 1, 3);
  s.rng = rng;
  s.rolls.push({ player: s.active, turn: s.turn, sides: 3, results: d });
  const roll = d[0] + 1;
  const n = Math.min(roll, u.startingModels - models.length);
  respawn(s, unitId, n, models[0]);
}
