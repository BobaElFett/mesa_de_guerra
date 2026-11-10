import type { Faction } from "../core/state";
import type { MissionId } from "../rules/missions";

// Ajustes de la partida que no forman parte del estado: quién lleva la IA, su nivel y la misión
// elegida para la próxima partida. Se recuerdan en el navegador.

export type AiLevel = "facil" | "normal" | "dificil";
export interface GameSettings {
  aiSide: Faction | null; aiLevel: AiLevel; mission: MissionId; map: "actual" | "ejemplo" | "aleatorio"; diceSpeed: "normal" | "rapido" | "instante";
  /** Ajustes (#55) */
  volume: number; followAi: boolean; guideRings: boolean; confirmAdvance: boolean; hoverTips: boolean; showMenu: boolean;
  /** Gráficos (#58): alta = sombras suaves y pantalla nítida; rapida = sin sombras y a 1×. */
  graphics: "alta" | "rapida";
  /** Condiciones de batalla de la próxima partida (#68). */
  conditions: "" | "noche" | "tormenta";
  /** Tamaño de la interfaz (#69): 0,85 a 1,3. */
  uiScale: number;
  /** Colores de bando (#74): normales o para daltónicos (azul y naranja). */
  palette: "normal" | "daltonico";
  /** Esquemas de color de cada bando (#77). */
  legionScheme: "azul" | "carmesi" | "verde" | "gris";
  swarmScheme: "morado" | "carmesi" | "pantano" | "ocre";
}

const KEY = "mesa-de-guerra.ajustes";
const DEFAULTS: GameSettings = { aiSide: "swarm", aiLevel: "normal", mission: "tomar", map: "actual", diceSpeed: "normal",
  volume: 0.55, followAi: true, guideRings: true, confirmAdvance: true, hoverTips: true, showMenu: true, graphics: "alta", conditions: "", uiScale: 1, palette: "normal", legionScheme: "azul", swarmScheme: "morado" };

export const AI_LEVEL_NAME: Record<AiLevel, string> = { facil: "Fácil", normal: "Normal", dificil: "Difícil" };

export const settings: GameSettings = (() => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (d && typeof d === "object") return { ...DEFAULTS, ...d };
  } catch { /* nada */ }
  return { ...DEFAULTS };
})();

/** Estado de la sesión (no se guarda): la IA en pausa deja jugar su bando a mano. */
/** spectate (#67): la IA juega los dos bandos y el jugador solo mira. */
export const runtime: { aiPaused: boolean; online: boolean; localSide: Faction | null; spectate: boolean } = { aiPaused: false, online: false, localSide: null, spectate: false };

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* nada */ }
}
