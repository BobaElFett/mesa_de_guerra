import { FACTIONS, Faction, PLAYERS } from "../core/state";
import { DATASHEETS } from "../rules/datasheets";
import { MISSIONS } from "../rules/missions";
import { CONDITIONS } from "../rules/conditions";
import { CAMPAIGN, Campaign, campaignScore, newCampaign, nextBattle } from "../rules/campaign";
import type { ArmyList } from "../rules/armies";
import { modal } from "./modal";

// Diálogo de la campaña (#70): empezar, ver cómo va, jugar la siguiente batalla o abandonar.

const KEY = "mesa-de-guerra.campana";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function loadCampaign(): Campaign | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as Campaign | null; } catch { return null; }
}
export function saveCampaign(c: Campaign | null) {
  try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* nada */ }
}

export class CampaignDialog {
  /** Juega la batalla `n` (1-3) de la campaña. */
  onPlay: (c: Campaign, n: number) => void = () => {};
  /** Listas para empezar: las de prueba o las de Ejércitos. */
  lists: (mine: boolean) => { legion: ArmyList; swarm: ArmyList } | string = () => "sin listas";
  private confirmAbandon = false;
  onChange: () => void = () => {};

  constructor() {
    $("campaign-backdrop").addEventListener("click", (e) => {
      if (e.target === $("campaign-backdrop")) { this.hide(); return; }
      const b = (e.target as HTMLElement).closest("button[data-c]") as HTMLButtonElement | null;
      if (!b) return;
      const c = loadCampaign();
      switch (b.dataset.c) {
        case "close": this.hide(); break;
        case "start": {
          const side = $<HTMLSelectElement>("c-side").value as Faction;
          const level = $<HTMLSelectElement>("c-level").value as Campaign["level"];
          const lists = this.lists($<HTMLSelectElement>("c-lists").value === "mias");
          if (typeof lists === "string") { $("c-err").textContent = lists; return; }
          saveCampaign(newCampaign(side, level, lists, Math.floor(Math.random() * 2 ** 30)));
          this.render();
          break;
        }
        case "play": if (c && nextBattle(c)) { this.hide(); this.onPlay(c, nextBattle(c)!); } break;
        case "abandon":
          if (!this.confirmAbandon) { this.confirmAbandon = true; this.render(); break; }
          saveCampaign(null); this.confirmAbandon = false; this.render();
          break;
        case "new": saveCampaign(null); this.render(); break;
      }
    });
  }

  get open() { return !$("campaign-backdrop").hidden; }

  show() { this.confirmAbandon = false; this.render(); $("campaign-backdrop").hidden = false; modal.open = true; }
  hide() { $("campaign-backdrop").hidden = true; modal.open = false; }

  render() {
    this.onChange();
    const c = loadCampaign();
    const el = $("campaign");
    if (!c) {
      el.innerHTML = `<h2>Campaña</h2>
        <p class="dim">Tres batallas seguidas contra la IA. Las unidades que sobreviven y hacen daño pasan a <b>Veteranas</b> (repiten los 1 al herir); las destruidas vuelven con reclutas. Gana quien gane más batallas (si empatan, más PV en total).</p>
        <ol class="c-plan">${CAMPAIGN.map((b) => `<li><b>${b.name}</b> — ${MISSIONS[b.mission].name}${b.conditions ? `, ${CONDITIONS[b.conditions].name.toLowerCase()}` : ""}</li>`).join("")}</ol>
        <div class="c-form">
          <label>Tu ejército <select id="c-side"><option value="legion">Legión Astral</option><option value="swarm">El Enjambre</option></select></label>
          <label>IA <select id="c-level"><option value="facil">Fácil</option><option value="normal" selected>Normal</option><option value="dificil">Difícil</option></select></label>
          <label>Listas <select id="c-lists"><option value="prueba">Las de prueba</option><option value="mias">Las mías (Ejércitos)</option></select></label>
        </div>
        <div id="c-err" class="warn"></div>
        <div class="c-buttons"><button data-c="close">Cerrar</button><button data-c="start" class="primary">Empezar campaña</button></div>`;
      return;
    }
    const sc = campaignScore(c);
    const me = PLAYERS.indexOf(c.side), foe = 1 - me;
    const n = nextBattle(c);
    const rows = CAMPAIGN.map((b, i) => {
      const r = c.results[i];
      const vetTxt = r && r.veterans.length ? ` · ${r.veterans.length} veterana${r.veterans.length > 1 ? "s" : ""} nueva${r.veterans.length > 1 ? "s" : ""}` : "";
      const res = r ? `${r.winner ? `<b style="color:${FACTIONS[r.winner].color}">${r.winner === c.side ? "Victoria" : "Derrota"}</b>` : "<b>Empate</b>"} ${r.vp[me]}-${r.vp[foe]} PV${vetTxt}` : i + 1 === n ? `<span class="gold">Siguiente</span>` : `<span class="dim">Por jugar</span>`;
      return `<li class="${i + 1 === n ? "next" : ""}"><div><b>${b.name}</b> <span class="dim">${MISSIONS[b.mission].name}${b.conditions ? ` · ${CONDITIONS[b.conditions].name}` : ""}</span></div>`
        + `${i + 1 === n ? `<div class="dim c-intro">${b.intro}</div>` : ""}<div>${res}</div></li>`;
    }).join("");
    const vets = (f: Faction) => c.lists[f].units.filter((u) => u.veteran).map((u) => DATASHEETS[u.datasheet].name);
    const vetLine = (f: Faction) => { const v = vets(f); return v.length ? `<div><span style="color:${FACTIONS[f].color}">${FACTIONS[f].name}</span>: ${v.join(", ")}</div>` : ""; };
    const final = sc.over ? `<div class="c-final">${sc.winner ? (sc.winner === c.side ? "¡Has ganado la campaña!" : "La IA gana la campaña.") : "La campaña acaba en empate."}</div>` : "";
    el.innerHTML = `<h2>Campaña <span class="dim">· juegas con ${FACTIONS[c.side].name}</span></h2>
      <div class="c-score">Batallas: <b>${sc.wins[me]}</b> – <b>${sc.wins[foe]}</b> · PV en total: ${sc.vp[me]} – ${sc.vp[foe]}</div>
      ${final}<ol class="c-battles">${rows}</ol>
      ${vets("legion").length || vets("swarm").length ? `<div class="c-vets"><b>Veteranas</b>${vetLine(c.side)}${vetLine(c.side === "legion" ? "swarm" : "legion")}</div>` : ""}
      <div class="c-buttons">
        <button data-c="close">Cerrar</button>
        ${sc.over ? `<button data-c="new" class="primary">Nueva campaña</button>` : `<button data-c="abandon">${this.confirmAbandon ? "¿Seguro? Pulsa otra vez" : "Abandonar"}</button><button data-c="play" class="primary">Jugar: ${CAMPAIGN[n! - 1].name}</button>`}
      </div>`;
  }
}
