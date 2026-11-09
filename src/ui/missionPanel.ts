import { FACTIONS, GameState, PLAYERS } from "../core/state";
import { FIRST_SCORING_ROUND, MISSIONS, objectiveStatus } from "../rules/missions";
import { MAX_ROUNDS } from "../rules/turn";

// Panel de la misión (arriba a la derecha): PV de cada bando, objetivos con quién los controla
// y lo que puntuaría el jugador activo si el turno acabara ahora.

const $ = (id: string) => document.getElementById(id)!;

export class MissionPanel {
  private folded = false;
  onShowSummary: () => void = () => {};
  hiddenByTerrain = false;

  constructor() {
    $("mission").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      if (b.dataset.act === "fold") { this.folded = !this.folded; $("mission").classList.toggle("folded", this.folded); b.textContent = this.folded ? "Ver" : "Plegar"; }
      if (b.dataset.act === "summary") this.onShowSummary();
    });
  }

  render(s: GameState) {
    const el = $("mission");
    const m = s.mission ? MISSIONS[s.mission] : null;
    el.hidden = !m || this.hiddenByTerrain;
    if (!m) return;
    const vp = s.vp ?? [0, 0];
    const C = (i: 0 | 1) => FACTIONS[PLAYERS[i]].color;
    const rows = (s.objectives ?? []).map((o) => {
      const st = objectiveStatus(s, o);
      const color = st.holder === null ? "transparent" : C(st.holder);
      return `<li><span class="dot" style="background:${color}"></span><b>${o.name}</b> <span class="dim">${o.vp} PV</span>`
        + `<span class="oc" title="CO a 3&quot;: Legión · Enjambre"><span style="color:${C(0)}">${st.oc[0]}</span> · <span style="color:${C(1)}">${st.oc[1]}</span></span></li>`;
    }).join("");
    let proj = "";
    if (s.rulesMode && !s.gameOver && s.phase !== "despliegue") {
      const held = (s.objectives ?? []).filter((o) => objectiveStatus(s, o).holder === s.active);
      const raw = held.reduce((n, o) => n + o.vp, 0), n = Math.min(raw, m.capPerTurn);
      proj = s.turn < FIRST_SCORING_ROUND
        ? `<div class="m-proj dim">Se puntúa desde la ronda ${FIRST_SCORING_ROUND}.</div>`
        : `<div class="m-proj">Si el turno acaba así: <b style="color:${C(s.active)}">+${n} PV</b> ${FACTIONS[PLAYERS[s.active]].of.replace("de la ", "a la ").replace("del ", "al ")}</div>`;
    }
    const end = s.gameOver ? `<div style="margin-top:6px"><button data-act="summary" class="primary">Ver resumen</button></div>` : "";
    el.innerHTML = `<div class="m-head"><span class="m-name">${m.name}</span><span class="dim">ronda ${Math.min(s.turn, MAX_ROUNDS)}/${MAX_ROUNDS}</span>`
      + `<button class="m-fold" data-act="fold">${this.folded ? "Ver" : "Plegar"}</button></div>`
      + `<div class="vp"><span style="color:${C(0)}">Legión <b>${vp[0]}</b></span><span class="dim">PV</span><span style="color:${C(1)}"><b>${vp[1]}</b> Enjambre</span></div>`
      + `<ul>${rows}</ul>${proj}<div class="m-sum">${m.summary}</div>${end}`;
  }
}
