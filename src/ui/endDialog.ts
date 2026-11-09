import { FACTIONS, GameState } from "../core/state";
import { DATASHEETS } from "../rules/datasheets";
import { MISSIONS, outcome, pointsLost } from "../rules/missions";
import { MAX_ROUNDS } from "../rules/turn";
import { modal } from "./modal";

// Resumen al acabar la partida (#35): quién gana, PV por ronda, bajas y puntos destruidos.

const $ = (id: string) => document.getElementById(id)!;

export class EndDialog {
  onNewGame: () => void = () => {};

  constructor() {
    $("end-backdrop").addEventListener("pointerdown", (e) => { if (e.target === $("end-backdrop")) this.hide(); });
    $("end").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (b?.dataset.act === "close") this.hide();
      if (b?.dataset.act === "new") { this.hide(); this.onNewGame(); }
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
    const kills = (p: 0 | 1) => {
      const list = (s.kills ?? []).filter((k) => k.by === p).map((k) => {
        const u = s.units.find((x) => x.id === k.unit);
        return u ? `<li>${DATASHEETS[u.datasheet].name} <span class="dim">(ronda ${k.turn})</span></li>` : "";
      }).join("");
      return list || `<li class="dim">Ninguna</li>`;
    };
    $("end").innerHTML = `<div class="dim" style="text-align:center">Fin de la partida${m ? ` · ${m.name}` : ""}</div>`
      + `<div class="winner">${head}</div>`
      + `<div class="score">${name("legion")} <b>${o.vp[0]}</b> — <b>${o.vp[1]}</b> ${name("swarm")} <span class="dim">PV</span></div>`
      + `<table><tr><th></th><th>Legión</th><th>Enjambre</th></tr>${perRound}`
      + `<tr><td><b>Total</b></td><td><b>${o.vp[0]}</b></td><td><b>${o.vp[1]}</b></td></tr>`
      + `<tr><td>Puntos de ejército perdidos</td><td>${pointsLost(s, "legion")}</td><td>${pointsLost(s, "swarm")}</td></tr></table>`
      + `<h3>Unidades destruidas por la ${FACTIONS.legion.name}</h3><ul>${kills(0)}</ul>`
      + `<h3>Unidades destruidas por ${FACTIONS.swarm.name}</h3><ul>${kills(1)}</ul>`
      + `<div class="row" style="justify-content:flex-end;gap:6px;margin-top:10px"><span class="dim" style="font-size:12px;margin-right:auto">Ctrl+Z vuelve atrás para revisar la partida.</span>`
      + `<button data-act="close">Cerrar</button><button data-act="new" class="primary">Nueva partida</button></div>`;
    $("end-backdrop").hidden = false;
    modal.open = true;
  }

  hide() {
    $("end-backdrop").hidden = true;
    modal.open = false;
  }
}
