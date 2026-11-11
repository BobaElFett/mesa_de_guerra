import { CONDITIONS } from "../rules/conditions";
import { FACTIONS, GameState, PLAYERS } from "../core/state";
import { FIRST_SCORING_ROUND, MISSIONS, objectiveStatus } from "../rules/missions";
import { MAX_ROUNDS } from "../rules/turn";
import { discardBlocked, SECONDARIES, SECONDARY_CAP, SecondaryId, secondaryVp } from "../rules/secondaries";

// Panel de la misión (arriba a la derecha): PV de cada bando, objetivos con quién los controla
// y lo que puntuaría el jugador activo si el turno acabara ahora.

const $ = (id: string) => document.getElementById(id)!;

export class MissionPanel {
  private folded = false;
  /** Órdenes secundarias plegadas (#101); se recuerda. */
  private secFolded = (() => { try { const v = localStorage.getItem("mesa-de-guerra.ordenes-plegadas"); return v === null ? window.innerHeight < 820 : v === "1"; } catch { return false; } })();
  private last: GameState | null = null;
  onShowSummary: () => void = () => {};
  /** Descartar una orden secundaria (#97). */
  onDiscard: (id: SecondaryId) => void = () => {};
  /** ¿Puede este jugador actuar desde aquí? (no la IA ni el rival en línea) */
  canAct: (p: 0 | 1) => boolean = () => true;
  hiddenByTerrain = false;
  hiddenByLog = false;

  constructor() {
    $("mission").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      if (b.dataset.act === "fold") { this.folded = !this.folded; $("mission").classList.toggle("folded", this.folded); b.textContent = this.folded ? "Ver" : "Plegar"; }
      if (b.dataset.act === "summary") this.onShowSummary();
      if (b.dataset.act === "secfold") {
        this.secFolded = !this.secFolded;
        try { localStorage.setItem("mesa-de-guerra.ordenes-plegadas", this.secFolded ? "1" : "0"); } catch { /* nada */ }
        if (this.last) this.render(this.last);
      }
      if (b.dataset.act === "discard") this.onDiscard(b.dataset.id as SecondaryId);
    });
  }

  render(s: GameState) {
    const el = $("mission");
    this.last = s;
    const m = s.mission ? MISSIONS[s.mission] : null;
    el.hidden = !m || this.hiddenByTerrain || this.hiddenByLog;
    if (!m) return;
    const vp = s.vp ?? [0, 0];
    const C = (i: 0 | 1) => FACTIONS[PLAYERS[i]].color;
    const rows = (s.objectives ?? []).map((o) => {
      const st = objectiveStatus(s, o);
      const color = st.holder === null ? "transparent" : C(st.holder);
      return `<li><span class="dot" style="background:${color}"></span><b>${o.name}</b> <span class="dim">${m.asym ? `${m.asym.attacker} / ${m.asym.defender} PV` : `${o.vp} PV`}</span>`
        + `<span class="oc" title="CO a 3&quot;: Legión · Enjambre"><span style="color:${C(0)}">${st.oc[0]}</span> · <span style="color:${C(1)}">${st.oc[1]}</span></span></li>`;
    }).join("");
    let proj = "";
    if (s.rulesMode && !s.gameOver && s.phase !== "despliegue") {
      const worth = (pl: 0 | 1) => {
        const held = (s.objectives ?? []).filter((o) => objectiveStatus(s, o).holder === pl);
        if (m.asym) { const def = s.defender === pl; return Math.min(def ? m.asym.defenderCap : m.capPerTurn, held.length * (def ? m.asym.defender : m.asym.attacker)); }
        return Math.min(m.capPerTurn, held.reduce((n, o) => n + o.vp, 0));
      };
      const when = m.scoreAt === "inicio" ? "al empezar el turno de cada uno" : "al acabar el turno de cada uno";
      proj = s.turn < FIRST_SCORING_ROUND
        ? `<div class="m-proj dim">Se puntúa desde la ronda ${FIRST_SCORING_ROUND}, ${when}.</div>`
        : `<div class="m-proj">Valen ahora: <b style="color:${C(0)}">+${worth(0)}</b> · <b style="color:${C(1)}">+${worth(1)}</b> PV <span class="dim">(${when})</span></div>`;
    }
    let orders = "";
    const sec = s.secondaries;
    if (sec && s.rulesMode) {
      const side = (pl: 0 | 1) => {
        const cards = sec.hand[pl].map((id) => {
          const c = SECONDARIES[id];
          const now = s.phase !== "despliegue" && !s.gameOver && c.done(s, pl);
          const can = pl === s.active && this.canAct(pl) && !discardBlocked(s, id);
          return `<li title="${c.text}"><span class="sec-ok">${now ? "✓" : ""}</span><b>${c.name}</b> <span class="dim">${c.vp} PV</span>`
            + `${can ? `<button class="sec-drop" data-act="discard" data-id="${id}" title="Descartar esta orden y ganar 1 PM (una vez por turno)">+1 PM</button>` : ""}${pl === s.active ? `<div class="sec-text">${c.text}</div>` : ""}</li>`;
        }).join("") || `<li class="dim">Sin órdenes${s.phase === "despliegue" ? " (se roban al empezar el mando)" : ""}</li>`;
        return `<div class="sec-side"><div class="sec-head" style="color:${C(pl)}">${FACTIONS[PLAYERS[pl]].name} <span class="dim">${secondaryVp(s, pl)}/${SECONDARY_CAP} PV</span></div><ul>${cards}</ul></div>`;
      };
      const fold = `<button class="m-fold" data-act="secfold">${this.secFolded ? "Ver" : "Plegar"}</button>`;
      orders = this.secFolded
        ? `<div class="m-sec"><div class="m-sec-title row">Órdenes <span class="dim"><span style="color:${C(0)}">${secondaryVp(s, 0)}</span> · <span style="color:${C(1)}">${secondaryVp(s, 1)}</span> / ${SECONDARY_CAP} PV${sec.hand[s.active].some((id) => s.phase !== "despliegue" && SECONDARIES[id].done(s, s.active)) ? " · ✓" : ""}</span>${fold}</div></div>`
        : `<div class="m-sec"><div class="m-sec-title row">Órdenes secundarias ${fold}</div><div class="dim sec-note">Se cumplen al acabar tu turno; ✓ = se cumpliría ahora.</div>${side(0)}${side(1)}</div>`;
    }
    const end = s.gameOver ? `<div style="margin-top:6px"><button data-act="summary" class="primary">Ver resumen</button></div>` : "";
    el.innerHTML = `<div class="m-head"><span class="m-name">${m.name}</span><span class="dim">ronda ${Math.min(s.turn, MAX_ROUNDS)}/${MAX_ROUNDS}</span>`
      + `<button class="m-fold" data-act="fold">${this.folded ? "Ver" : "Plegar"}</button></div>`
      + `<div class="vp"><span style="color:${C(0)}">Legión <b>${vp[0]}</b></span><span class="dim">PV</span><span style="color:${C(1)}"><b>${vp[1]}</b> Enjambre</span></div>`
      + `<ul>${rows}</ul>${proj}${s.defender !== undefined ? `<div class="m-cond"><b>Ataca:</b> <span style="color:${FACTIONS[PLAYERS[1 - s.defender]].color}">${FACTIONS[PLAYERS[1 - s.defender]].name}</span> · <b>Defiende:</b> <span style="color:${FACTIONS[PLAYERS[s.defender]].color}">${FACTIONS[PLAYERS[s.defender]].name}</span></div>` : ""}${s.conditions ? `<div class="m-cond"><b>${CONDITIONS[s.conditions].name}:</b> ${CONDITIONS[s.conditions].text}</div>` : ""}${orders}<div class="m-sum">${m.summary}</div>${end}`;
  }
}
