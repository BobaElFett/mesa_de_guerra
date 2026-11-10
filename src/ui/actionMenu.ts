import type { CommandBus } from "../core/commands";
import type { BoardAction } from "../rules/actions";

/** Tamaño de la interfaz (#69): las posiciones en píxeles de pantalla, en las del panel ampliado. */
const uiZ = () => Number(getComputedStyle(document.documentElement).getPropertyValue("--ui")) || 1;

// Menú de acciones sobre el tablero (#46): al pasar por encima de un enemigo, un recuadro con
// lo que se puede hacer y sus probabilidades; al hacer clic, el menú para elegir.

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export class ActionMenu {
  /** Antes de mandar la orden (p. ej. comprobar que la unidad es tuya). */
  canRun: (a: BoardAction) => boolean = () => true;
  private actions: BoardAction[] = [];

  constructor(private bus: CommandBus) {
    $("action-menu").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (!b) return;
      if (b.dataset.act === "close") { this.close(); return; }
      const a = this.actions[Number(b.dataset.i)];
      if (a?.cmd && this.canRun(a)) { this.close(); this.bus.dispatch(a.cmd); }
    });
    window.addEventListener("pointerdown", (e) => {
      if (!$("action-menu").hidden && !(e.target as HTMLElement).closest("#action-menu")) this.close();
    }, true);
    window.addEventListener("keydown", (e) => { if (e.code === "Escape") this.close(); });
  }

  get isOpen() { return !$("action-menu").hidden; }

  /** Recuadro de ayuda junto al cursor: la mejor acción (o por qué no hay ninguna). */
  tip(title: string, actions: BoardAction[], x: number, y: number) {
    const el = $("board-tip");
    if (!actions.length) { el.hidden = true; return; }
    const ok = actions.filter((a) => a.cmd).sort((a, b) => b.value - a.value);
    const best = ok[0];
    el.innerHTML = `<b>${esc(title)}</b><br>` + (best
      ? `${esc(best.label)}: ${esc(best.detail)}${ok.length > 1 ? `<br><span class="dim">+${ok.length - 1} opción${ok.length > 2 ? "es" : ""} más · clic para elegir</span>` : `<br><span class="dim">clic para hacerlo</span>`}`
      : `<span class="dim">${esc(actions[0].blocked ?? "")}</span>`);
    el.style.left = `${(x + 16) / uiZ()}px`;
    el.style.top = `${(y + 14) / uiZ()}px`;
    el.hidden = false;
  }

  hideTip() { $("board-tip").hidden = true; }

  open(title: string, actions: BoardAction[], x: number, y: number) {
    this.actions = actions;
    this.hideTip();
    const el = $("action-menu");
    const rows = actions.map((a, i) => a.cmd
      ? `<button data-i="${i}"><b>${esc(a.label)}</b><span>${esc(a.detail)}</span></button>`
      : `<div class="off"><b>${esc(a.label)}</b><span>${esc(a.blocked ?? a.detail)}</span></div>`).join("");
    el.innerHTML = `<div class="am-head">${esc(title)}<button data-act="close" title="Esc">×</button></div>${rows}`;
    el.hidden = false;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(x + 10, innerWidth - r.width - 8) / uiZ()}px`;
    el.style.top = `${Math.min(y + 10, innerHeight - r.height - 8) / uiZ()}px`;
  }

  close() { $("action-menu").hidden = true; }
}
