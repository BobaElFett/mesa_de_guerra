import { FACTIONS, GameState, PLAYERS } from "../core/state";

// Registro de la batalla (#53): lo que ha pasado, por rondas, con el color de cada bando.

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export class BattleLog {
  private shown = -1;
  onToggle: (open: boolean) => void = () => {};

  constructor() {
    $("log-open").addEventListener("click", () => this.toggle());
    $("log-close").addEventListener("click", () => this.toggle(false));
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyL" && !e.ctrlKey && !e.metaKey && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") this.toggle();
    });
  }

  get open() { return !$("battle-log").hidden; }

  toggle(on = !this.open) {
    $("battle-log").hidden = !on;
    $("log-open").classList.toggle("on", on);
    this.shown = -1;
    this.onToggle(on);
  }

  render(s: GameState) {
    if (!this.open) return;
    const h = s.history ?? [];
    if (h.length === this.shown) return;
    this.shown = h.length;
    let html = "", round = -1;
    for (const e of h) {
      if (e.turn !== round) { round = e.turn; html += `<h4>Ronda ${round}</h4>`; }
      const color = FACTIONS[PLAYERS[e.player]].color;
      html += `<div class="e ${e.kind}"><span class="dot" style="background:${color}"></span><span>${esc(e.text)}</span></div>`;
    }
    const body = $("log-body");
    const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 20;
    body.innerHTML = html || `<div class="dim">Aún no ha pasado nada. Con el modo reglas, aquí se apunta cada disparo, carga, combate, chequeo de moral y PV.</div>`;
    if (atEnd || this.shown === h.length) body.scrollTop = body.scrollHeight;
  }
}
