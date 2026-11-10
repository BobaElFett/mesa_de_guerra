import { FACTIONS, GameState } from "../core/state";
import { DATASHEETS } from "../rules/datasheets";
import { MISSIONS, outcome, pointsLost } from "../rules/missions";
import { MAX_ROUNDS } from "../rules/turn";
import { statsOf, unitOfTheMatch } from "../rules/stats";
import { modal } from "./modal";

// Resumen al acabar la partida (#35): quién gana, PV por ronda, bajas y puntos destruidos.

const $ = (id: string) => document.getElementById(id)!;

export class EndDialog {
  onNewGame: () => void = () => {};
  onReplay: () => void = () => {};

  constructor() {
    $("end-backdrop").addEventListener("pointerdown", (e) => { if (e.target === $("end-backdrop")) this.hide(); });
    $("end").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (b?.dataset.act === "close") this.hide();
      if (b?.dataset.act === "new") { this.hide(); this.onNewGame(); }
      if (b?.dataset.act === "replay") { this.hide(); this.onReplay(); }
    });
    window.addEventListener("keydown", (e) => { if (e.code === "Escape" && !$("end-backdrop").hidden) this.hide(); });
  }

  get open() { return !$("end-backdrop").hidden; }

  show(s: GameState) {
    const o = outcome(s);
    const m = s.mission ? MISSIONS[s.mission] : null;
    const name = (f: "legion" | "swarm") => `<span style="color:${FACTIONS[f].color}">${FACTIONS[f].name}</span>`;
    const head = o.winner ? `${name(o.winner)} gana` : "Empate";
    const perRound = Array.from({ length: MAX_ROUNDS }, (_, i) => {
      const r = i + 1;
      const v = [0, 1].map((p) => (s.vpLog ?? []).filter((e) => e.turn === r && e.player === p).reduce((n, e) => n + e.vp, 0));
      return `<tr><td>Ronda ${r}</td><td>${v[0] || "—"}</td><td>${v[1] || "—"}</td></tr>`;
    }).join("");
    // Estadísticas por unidad (#65)
    const mvp = unitOfTheMatch(s);
    const table = (f: "legion" | "swarm") => {
      const rows = s.units.filter((u) => u.faction === f).map((u) => {
        const st = statsOf(s, u.id);
        const alive = s.pieces.filter((p) => p.unit === u.id).length + (s.reserves ?? []).filter((p) => p.unit === u.id).length;
        const k = (s.kills ?? []).find((x) => x.unit === u.id);
        const state = k ? `<span class="dim">destruida (r. ${k.turn})</span>` : alive < u.startingModels ? `${alive}/${u.startingModels}` : "entera";
        return `<tr${u.id === mvp ? ' class="mvp"' : ""}><td>${DATASHEETS[u.datasheet].name}${u.id === mvp ? " ★" : ""}</td><td>${st.dmg}</td><td>${st.kills}</td><td>${Math.round(st.pts)}</td><td>${state}</td></tr>`;
      }).join("");
      return `<h3>${name(f)}</h3><table class="stats"><tr><th>Unidad</th><th title="Heridas causadas">Daño</th><th title="Miniaturas enemigas eliminadas">Bajas</th><th title="Puntos de ejército enemigos destruidos">Pts</th><th>Estado</th></tr>${rows}</table>`;
    };
    const mvpUnit = mvp ? s.units.find((u) => u.id === mvp) : null;
    const mvpLine = mvpUnit ? `<div class="mvp-line">★ Unidad de la partida: <b style="color:${FACTIONS[mvpUnit.faction].color}">${DATASHEETS[mvpUnit.datasheet].name}</b> — ${Math.round(statsOf(s, mvp!).pts)} pts destruidos, ${statsOf(s, mvp!).dmg} heridas</div>` : "";
    $("end").innerHTML = `<div class="dim" style="text-align:center">Fin de la partida${m ? ` · ${m.name}` : ""}</div>`
      + `<div class="winner">${head}</div>`
      + `<div class="score">${name("legion")} <b>${o.vp[0]}</b> — <b>${o.vp[1]}</b> ${name("swarm")} <span class="dim">PV</span></div>`
      + `<table><tr><th></th><th>Legión</th><th>Enjambre</th></tr>${perRound}`
      + `<tr><td><b>Total</b></td><td><b>${o.vp[0]}</b></td><td><b>${o.vp[1]}</b></td></tr>`
      + `<tr><td>Puntos de ejército perdidos</td><td>${pointsLost(s, "legion")}</td><td>${pointsLost(s, "swarm")}</td></tr></table>`
      + mvpLine
      + `<div class="stats-wrap">${table("legion")}${table("swarm")}</div>`
      + `<div class="row" style="justify-content:flex-end;gap:6px;margin-top:10px">`
      + `<button data-act="close">Cerrar</button><button data-act="replay">Ver repetición</button><button data-act="new" class="primary">Nueva partida</button></div>`;
    $("end-backdrop").hidden = false;
    modal.open = true;
  }

  hide() {
    $("end-backdrop").hidden = true;
    modal.open = false;
  }
}
