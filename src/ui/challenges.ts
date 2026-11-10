import { FACTIONS } from "../core/state";
import { Challenge, ChallengeMemo, ChallengeResult, CHALLENGES } from "../rules/challenges";
import { modal } from "./modal";

// Desafíos (#92): lista con las mejores estrellas, cartel durante la partida y resultado.

const KEY = "mesa-de-guerra.desafios";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const starStr = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

export function loadStars(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
}
function saveStars(id: string, n: number) {
  const all = loadStars();
  if ((all[id] ?? 0) >= n) return;
  all[id] = n;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* nada */ }
}

export class ChallengeDialog {
  active: Challenge | null = null;
  memo: ChallengeMemo = {};
  /** Empieza el desafío (main prepara la mesa). */
  onPlay: (c: Challenge) => void = () => {};
  onChange: () => void = () => {};

  constructor() {
    $("challenge-backdrop").addEventListener("click", (e) => {
      if (e.target === $("challenge-backdrop")) { this.hide(); return; }
      const b = (e.target as HTMLElement).closest("button[data-ch]") as HTMLButtonElement | null;
      if (!b) return;
      const v = b.dataset.ch!;
      if (v === "close") { this.hide(); return; }
      if (v === "list") { this.render(); return; }
      const c = CHALLENGES.find((x) => x.id === v);
      if (c) { this.hide(); this.start(c); }
    });
    $("challenge-box").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-chb]") as HTMLButtonElement | null;
      if (b?.dataset.chb === "quit") this.stop();
      if (b?.dataset.chb === "fold") $("challenge-box").classList.toggle("folded");
    });
  }

  get open() { return !$("challenge-backdrop").hidden; }
  show() { this.render(); $("challenge-backdrop").hidden = false; modal.open = true; }
  hide() { $("challenge-backdrop").hidden = true; modal.open = false; }

  start(c: Challenge) {
    this.active = c;
    this.memo = {};
    this.onPlay(c);
    const box = $("challenge-box");
    box.classList.remove("folded");
    box.innerHTML = `<div class="row"><b>Desafío: ${c.name}</b> <span class="dim">· juegas con <span style="color:${FACTIONS[c.side].color}">${FACTIONS[c.side].name}</span></span>`
      + `<button data-chb="fold" style="margin-left:auto">–</button><button data-chb="quit">Abandonar</button></div>`
      + `<div class="ch-body"><div>${c.brief}</div><div class="dim">${c.stars.map((t, i) => `${starStr(i + 1)} ${t}`).join(" · ")}</div></div>`;
    box.hidden = false;
    this.onChange();
  }

  stop() {
    this.active = null;
    $("challenge-box").hidden = true;
    this.onChange();
  }

  /** Lo llama main al cambiar el estado: cuando acaba, guarda las estrellas y enseña el resultado. */
  finish(r: ChallengeResult) {
    const c = this.active;
    if (!c) return;
    saveStars(c.id, r.stars);
    this.stop();
    $("challenge").innerHTML = `<h2>${c.name}</h2>
      <div class="ch-stars ${r.stars ? "" : "none"}">${starStr(r.stars)}</div>
      <p>${r.text} ${r.stars ? (r.stars === 3 ? "¡Perfecto!" : "Superado.") : "No lo has conseguido."}</p>
      <div class="ch-buttons"><button data-ch="list">Desafíos</button><button data-ch="close">Cerrar</button><button data-ch="${c.id}" class="primary">Repetir</button></div>`;
    $("challenge-backdrop").hidden = false;
    modal.open = true;
  }

  private render() {
    const best = loadStars();
    const total = CHALLENGES.reduce((n, c) => n + (best[c.id] ?? 0), 0);
    $("challenge").innerHTML = `<div style="display:flex;align-items:center"><h2>Desafíos</h2><span class="dim" style="margin-left:10px">${total} de ${CHALLENGES.length * 3} estrellas</span><button data-ch="close" style="margin-left:auto">Cerrar</button></div>
      <div class="ch-list">${CHALLENGES.map((c) => `<div class="ch-item"><div><b>${c.name}</b> <span class="ch-best">${starStr(best[c.id] ?? 0)}</span>
        <div class="dim">Con <span style="color:${FACTIONS[c.side].color}">${FACTIONS[c.side].name}</span>. ${c.brief}</div>
        <div class="dim ch-crit">${c.stars.map((t, i) => `${starStr(i + 1)} ${t}`).join(" · ")}</div></div>
        <button data-ch="${c.id}" class="primary">Jugar</button></div>`).join("")}</div>`;
  }
}
