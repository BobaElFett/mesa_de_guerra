import { Faction, GameState, PLAYERS } from "../core/state";
import type { ArmyList } from "./armies";
import type { MissionId } from "./missions";
import { outcome } from "./missions";
import type { Condition } from "./conditions";
import { statsOf } from "./stats";

// Campaña (#70): tres batallas seguidas contra la IA. Entre una y otra, las unidades que
// sobreviven y han hecho daño pasan a Veteranas (#71); las destruidas vuelven con reclutas.

export interface CampaignBattle { name: string; mission: MissionId; conditions?: Condition; intro: string }

export const CAMPAIGN: CampaignBattle[] = [
  { name: "I · Cabeza de playa", mission: "tomar", intro: "Los dos ejércitos llegan al valle a la vez. Quien se haga con las posiciones tendrá la ventaja." },
  { name: "II · La reliquia en la oscuridad", mission: "reliquia", conditions: "noche", intro: "De noche, entre las ruinas, aparece una reliquia antigua. Hay que llevársela." },
  { name: "III · Cacería bajo la tormenta", mission: "caza", conditions: "tormenta", intro: "La tormenta cubre el campo. Gana quien destruya más del ejército rival." },
];

export interface BattleResult { winner: Faction | null; vp: [number, number]; veterans: string[] }

export interface Campaign {
  side: Faction;
  level: "facil" | "normal" | "dificil";
  lists: { legion: ArmyList; swarm: ArmyList };
  /** Batallas jugadas (0-3). */
  results: BattleResult[];
  /** Semilla de los mapas (uno distinto y simétrico por batalla). */
  seed: number;
}

export function newCampaign(side: Faction, level: Campaign["level"], lists: Campaign["lists"], seed: number): Campaign {
  const clean = (l: ArmyList): ArmyList => ({ ...l, units: l.units.map((u) => { const c = { ...u }; delete c.veteran; return c; }) });
  return { side, level, lists: { legion: clean(lists.legion), swarm: clean(lists.swarm) }, results: [], seed };
}

export const nextBattle = (c: Campaign): number | null => (c.results.length < CAMPAIGN.length ? c.results.length + 1 : null);

/**
 * Apunta el resultado de la batalla `s` (si es la que toca) y devuelve la campaña nueva con
 * las veteranías al día. Devuelve null si `s` no es la batalla que tocaba o no ha acabado.
 */
export function recordBattle(c: Campaign, s: GameState): Campaign | null {
  if (!s.gameOver || s.campaignBattle !== nextBattle(c)) return null;
  const o = outcome(s);
  const lists = { legion: { ...c.lists.legion, units: c.lists.legion.units.map((u) => ({ ...u })) }, swarm: { ...c.lists.swarm, units: c.lists.swarm.units.map((u) => ({ ...u })) } };
  const veterans: string[] = [];
  for (const u of s.units) {
    if (u.entry === undefined) continue;
    const e = lists[u.faction].units[u.entry];
    if (!e) continue;
    const alive = s.pieces.some((p) => p.unit === u.id);
    if (!alive) { delete e.veteran; continue; }          // destruida: vuelve con reclutas
    if (statsOf(s, u.id).dmg > 0 && !e.veteran) { e.veteran = true; veterans.push(u.id); }
  }
  return { ...c, lists, results: [...c.results, { winner: o.winner, vp: o.vp, veterans }] };
}

/** Marcador de la campaña: batallas ganadas y PV acumulados por bando; ganador si ha acabado. */
export function campaignScore(c: Campaign): { wins: [number, number]; vp: [number, number]; winner: Faction | null; over: boolean } {
  const wins: [number, number] = [0, 0], vp: [number, number] = [0, 0];
  for (const r of c.results) {
    if (r.winner) wins[PLAYERS.indexOf(r.winner)]++;
    vp[0] += r.vp[0]; vp[1] += r.vp[1];
  }
  const over = c.results.length >= CAMPAIGN.length;
  const winner = wins[0] !== wins[1] ? PLAYERS[wins[0] > wins[1] ? 0 : 1] : vp[0] !== vp[1] ? PLAYERS[vp[0] > vp[1] ? 0 : 1] : null;
  return { wins, vp, winner, over };
}
