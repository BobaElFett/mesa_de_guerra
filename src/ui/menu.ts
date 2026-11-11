import { MISSIONS, MissionId } from "../rules/missions";
import type { Faction } from "../core/state";
import { AiLevel, saveSettings, settings } from "../ai/settings";
import { modal } from "./modal";

// Pantalla de inicio (#54): continuar, partida rápida contra la IA, tutorial, mesa libre,
// ejércitos, en línea y ajustes. Se abre al cargar el juego (si no se ha desactivado) y con «Menú».

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface QuickGame { side: Faction | "mirar"; level: AiLevel; mission: MissionId; map: "aleatorio" | "ejemplo" | "urbano" | "llanura" | "bosque"; lists: "prueba" | "mias" | "azar"; conditions?: "" | "noche" | "tormenta"; size?: 500 | 1000; secondaries?: boolean }

export class StartMenu {
  onContinue: () => void = () => {};
  onQuick: (q: QuickGame) => void = () => {};
  onTutorial: () => void = () => {};
  onFree: () => void = () => {};
  onArmies: () => void = () => {};
  onOnline: () => void = () => {};
  onSettings: () => void = () => {};
  onCampaign: () => void = () => {};
  onRecord: () => void = () => {};
  onCodex: () => void = () => {};
  onChallenges: () => void = () => {};
  /** Hay partida que continuar (texto) o null. */
  continueInfo: () => string | null = () => null;

  constructor() {
    $("q-mission").innerHTML = Object.values(MISSIONS).map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
    const desc = () => { $("q-desc").textContent = MISSIONS[$<HTMLSelectElement>("q-mission").value as MissionId].summary; };
    $("q-mission").addEventListener("change", desc);
    $("menu-open").addEventListener("click", () => this.show());
    $("menu").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-m]") as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      const m = b.dataset.m;
      this.hide();
      if (m === "continue") this.onContinue();
      if (m === "tutorial") this.onTutorial();
      if (m === "free") this.onFree();
      if (m === "armies") this.onArmies();
      if (m === "online") this.onOnline();
      if (m === "settings") this.onSettings();
      if (m === "campaign") this.onCampaign();
      if (m === "record") this.onRecord();
      if (m === "codex") this.onCodex();
      if (m === "challenges") this.onChallenges();
      if (m === "quick") {
        const q: QuickGame = {
          side: $<HTMLSelectElement>("q-side").value as QuickGame["side"],
          level: $<HTMLSelectElement>("q-level").value as AiLevel,
          mission: $<HTMLSelectElement>("q-mission").value as MissionId,
          map: $<HTMLSelectElement>("q-map").value as QuickGame["map"],
          lists: $<HTMLSelectElement>("q-lists").value as QuickGame["lists"],
          conditions: $<HTMLSelectElement>("q-cond").value as QuickGame["conditions"],
          size: Number($<HTMLSelectElement>("q-size").value) === 1000 ? 1000 : 500,
          secondaries: $<HTMLInputElement>("q-sec").checked,
        };
        try { localStorage.setItem("mesa-de-guerra.rapida", JSON.stringify(q)); } catch { /* nada */ }
        this.onQuick(q);
      }
    });
    $("menu-show").addEventListener("change", () => { settings.showMenu = $<HTMLInputElement>("menu-show").checked; saveSettings(); });
    window.addEventListener("keydown", (e) => { if (e.code === "Escape" && this.open && this.continueInfo()) { this.hide(); } });
    // Lo último elegido en la partida rápida
    try {
      const q = JSON.parse(localStorage.getItem("mesa-de-guerra.rapida") ?? "null") as QuickGame | null;
      if (q) {
        $<HTMLSelectElement>("q-side").value = q.side; $<HTMLSelectElement>("q-level").value = q.level;
        $<HTMLSelectElement>("q-mission").value = q.mission; $<HTMLSelectElement>("q-map").value = q.map; $<HTMLSelectElement>("q-lists").value = q.lists; $<HTMLSelectElement>("q-cond").value = q.conditions ?? ""; $<HTMLSelectElement>("q-size").value = String(q.size ?? 500); $<HTMLInputElement>("q-sec").checked = q.secondaries ?? true;
      } else $<HTMLSelectElement>("q-level").value = "normal";
    } catch { /* nada */ }
    desc();
  }

  get open() { return !$("menu-backdrop").hidden; }

  show() {
    const info = this.continueInfo();
    const c = $<HTMLButtonElement>("menu-continue");
    c.disabled = !info;
    $("menu-continue-info").textContent = info ?? "no hay ninguna partida empezada";
    $<HTMLInputElement>("menu-show").checked = settings.showMenu;
    $("menu-backdrop").hidden = false;
    modal.open = true;
  }

  hide() {
    $("menu-backdrop").hidden = true;
    modal.open = false;
  }
}

/** Ajustes (#55). */
export class SettingsDialog {
  onChange: () => void = () => {};
  /** Sonido: lo lleva el módulo de audio. */
  sound = { get: () => true, set: (_v: boolean) => {}, volume: (_v: number) => {} };

  constructor() {
    $("settings-open").addEventListener("click", () => this.show());
    $("settings-close").addEventListener("click", () => this.hide());
    $("settings-backdrop").addEventListener("pointerdown", (e) => { if (e.target === $("settings-backdrop")) this.hide(); });
    window.addEventListener("keydown", (e) => { if (e.code === "Escape" && !$("settings-backdrop").hidden) this.hide(); });
    $("settings").addEventListener("input", () => this.read());
    $("settings").addEventListener("change", () => this.read());
  }

  show() {
    $<HTMLInputElement>("set-sound").checked = this.sound.get();
    $<HTMLInputElement>("set-grid").checked = $("grid").classList.contains("on");
    $<HTMLInputElement>("set-volume").value = String(settings.volume);
    $<HTMLSelectElement>("set-speed").value = settings.diceSpeed;
    $<HTMLSelectElement>("set-graphics").value = settings.graphics;
    $<HTMLSelectElement>("set-ui").value = String(settings.uiScale);
    $<HTMLSelectElement>("set-palette").value = settings.palette;
    $<HTMLSelectElement>("set-ambient").value = String(settings.ambient);
    $<HTMLSelectElement>("set-legion").value = settings.legionScheme;
    $<HTMLSelectElement>("set-swarm").value = settings.swarmScheme;
    $<HTMLInputElement>("set-follow").checked = settings.followAi;
    $<HTMLInputElement>("set-confirm").checked = settings.confirmAdvance;
    $<HTMLInputElement>("set-rings").checked = settings.guideRings;
    $<HTMLInputElement>("set-tips").checked = settings.hoverTips;
    $<HTMLInputElement>("set-menu").checked = settings.showMenu;
    $<HTMLInputElement>("set-anim").checked = settings.animations;
    $<HTMLInputElement>("set-icons").checked = settings.statusIcons;
    $<HTMLInputElement>("set-recap").checked = settings.turnRecap;
    $("settings-backdrop").hidden = false;
    modal.open = true;
  }

  hide() {
    $("settings-backdrop").hidden = true;
    modal.open = false;
  }

  private read() {
    this.sound.set($<HTMLInputElement>("set-sound").checked);
    if ($<HTMLInputElement>("set-grid").checked !== $("grid").classList.contains("on")) $("grid").click();
    settings.volume = Number($<HTMLInputElement>("set-volume").value);
    this.sound.volume(settings.volume);
    settings.diceSpeed = $<HTMLSelectElement>("set-speed").value as typeof settings.diceSpeed;
    settings.graphics = $<HTMLSelectElement>("set-graphics").value as typeof settings.graphics;
    settings.uiScale = Number($<HTMLSelectElement>("set-ui").value) || 1;
    settings.palette = $<HTMLSelectElement>("set-palette").value as typeof settings.palette;
    settings.ambient = Number($<HTMLSelectElement>("set-ambient").value);
    settings.legionScheme = $<HTMLSelectElement>("set-legion").value as typeof settings.legionScheme;
    settings.swarmScheme = $<HTMLSelectElement>("set-swarm").value as typeof settings.swarmScheme;
    settings.followAi = $<HTMLInputElement>("set-follow").checked;
    settings.confirmAdvance = $<HTMLInputElement>("set-confirm").checked;
    settings.guideRings = $<HTMLInputElement>("set-rings").checked;
    settings.hoverTips = $<HTMLInputElement>("set-tips").checked;
    settings.showMenu = $<HTMLInputElement>("set-menu").checked;
    settings.animations = $<HTMLInputElement>("set-anim").checked;
    settings.statusIcons = $<HTMLInputElement>("set-icons").checked;
    settings.turnRecap = $<HTMLInputElement>("set-recap").checked;
    saveSettings();
    this.onChange();
  }
}
