import type { Faction } from "../core/state";
import type { MissionId } from "../rules/missions";

// Ajustes de la partida que no forman parte del estado: quién lleva la IA, su nivel y la misión
// elegida para la próxima partida. Se recuerdan en el navegador.

export type AiLevel = "facil" | "normal" | "dificil";
export interface GameSettings { aiSide: Faction | null; aiLevel: AiLevel; mission: MissionId }

const KEY = "mesa-de-guerra.ajustes";
const DEFAULTS: GameSettings = { aiSide: "swarm", aiLevel: "normal", mission: "tomar" };

export const AI_LEVEL_NAME: Record<AiLevel, string> = { facil: "Fácil", normal: "Normal", dificil: "Difícil" };

export const settings: GameSettings = (() => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (d && typeof d === "object") return { ...DEFAULTS, ...d };
  } catch { /* nada */ }
  return { ...DEFAULTS };
})();

/** Estado de la sesión (no se guarda): la IA en pausa deja jugar su bando a mano. */
export const runtime = { aiPaused: false };

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* nada */ }
}
