import { GameState, PLAYERS } from "../core/state";
import type { GameRecord } from "./record";

// Logros (#93): se miran al acabar una partida contra la IA, un desafío o una campaña, y se
// guardan en el navegador con la fecha en que se consiguieron.

const KEY = "mesa-de-guerra.logros";

export interface AchievementCtx {
  records: GameRecord[];
  /** La partida que acaba de terminar (si es eso lo que se mira). */
  last?: { rec: GameRecord; s: GameState; points: number };
  stars: Record<string, number>;
  campaignWon: boolean;
}

export interface Achievement { id: string; name: string; text: string; check: (c: AchievementCtx) => boolean }

const won = (r: GameRecord) => r.result === "victoria";

export const ACHIEVEMENTS: Achievement[] = [
  { id: "primera", name: "Primera sangre", text: "Gana una partida contra la IA.", check: (c) => c.records.some(won) },
  { id: "dificil", name: "Contra lo mejor", text: "Gana a la IA en Difícil.", check: (c) => c.records.some((r) => won(r) && r.level === "dificil") },
  { id: "ambos", name: "Dos caras", text: "Gana con la Legión y con el Enjambre.", check: (c) => ["legion", "swarm"].every((f) => c.records.some((r) => won(r) && r.side === f)) },
  { id: "impecable", name: "Impecable", text: "Gana sin perder ninguna unidad entera.", check: (c) => !!c.last && won(c.last.rec) && !(c.last.s.kills ?? []).some((k) => c.last!.s.units.find((u) => u.id === k.unit)?.faction === c.last!.rec.side) },
  { id: "aplastante", name: "Aplastante", text: "Gana por 20 PV o más.", check: (c) => c.records.some((r) => won(r) && r.vp[0] - r.vp[1] >= 20) },
  { id: "noche", name: "Ojos en la oscuridad", text: "Gana de noche o con tormenta.", check: (c) => c.records.some((r) => won(r) && !!r.conditions) },
  { id: "reliquia", name: "Arqueólogo", text: "Gana la misión Reliquia.", check: (c) => c.records.some((r) => won(r) && r.mission === "reliquia") },
  { id: "asalto", name: "Tomar la posición", text: "Gana la misión Asalto atacando.", check: (c) => !!c.last && won(c.last.rec) && c.last.rec.mission === "asalto" && c.last.s.defender !== PLAYERS.indexOf(c.last.rec.side) },
  { id: "batalla", name: "Gran batalla", text: "Gana una partida de 1.000 puntos.", check: (c) => !!c.last && won(c.last.rec) && c.last.points > 600 },
  { id: "campana", name: "Veterano", text: "Gana una campaña.", check: (c) => c.campaignWon },
  { id: "estrella", name: "Estratega", text: "Consigue 3 estrellas en un desafío.", check: (c) => Object.values(c.stars).some((n) => n >= 3) },
  { id: "maestro", name: "Maestro de desafíos", text: "Consigue las 15 estrellas de los desafíos.", check: (c) => Object.values(c.stars).reduce((a, b) => a + b, 0) >= 15 },
  { id: "curtido", name: "Curtido", text: "Juega 10 partidas contra la IA.", check: (c) => c.records.length >= 10 },
];

export function loadAchievements(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>; } catch { return {}; }
}

/** Mira todos los logros y apunta los nuevos. Devuelve los que se acaban de conseguir. */
export function unlock(ctx: AchievementCtx): Achievement[] {
  const have = loadAchievements(), fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) if (!have[a.id] && a.check(ctx)) { have[a.id] = new Date().toISOString(); fresh.push(a); }
  if (fresh.length) try { localStorage.setItem(KEY, JSON.stringify(have)); } catch { /* nada */ }
  return fresh;
}

/** Bloque HTML para el Historial. */
export function achievementsHtml(): string {
  const have = loadAchievements();
  const n = ACHIEVEMENTS.filter((a) => have[a.id]).length;
  return `<h3>Logros · ${n} de ${ACHIEVEMENTS.length}</h3><div class="ach-grid">${ACHIEVEMENTS.map((a) => `<div class="ach ${have[a.id] ? "on" : ""}" title="${have[a.id] ? `Conseguido el ${new Date(have[a.id]).toLocaleDateString("es-ES")}` : "Aún no"}"><b>${have[a.id] ? "★" : "☆"} ${a.name}</b><span>${a.text}</span></div>`).join("")}</div>`;
}
