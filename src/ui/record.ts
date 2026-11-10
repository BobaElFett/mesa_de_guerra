import { FACTIONS, Faction, GameState } from "../core/state";
import { MISSIONS } from "../rules/missions";
import { CONDITIONS } from "../rules/conditions";
import { outcome } from "../rules/missions";
import { modal } from "./modal";
import { achievementsHtml } from "./achievements";

// Historial (#79): cada partida acabada contra la IA, en el navegador (las 200 últimas).

const KEY = "mesa-de-guerra.historial";
const MAX = 200;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface GameRecord {
  at: string;             // fecha ISO
  side: Faction;          // con qué jugaba la persona
  level: "facil" | "normal" | "dificil";
  mission: string;
  conditions?: string;
  campaign?: number;
  result: "victoria" | "empate" | "derrota";
  vp: [number, number];   // [la persona, la IA]
  rounds: number;
}

export function loadRecords(): GameRecord[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as GameRecord[]; } catch { return []; }
}
function saveRecords(r: GameRecord[]) {
  try { localStorage.setItem(KEY, JSON.stringify(r.slice(-MAX))); } catch { /* nada */ }
}

/** Apunta la partida `s` (ya acabada) jugada con `side` contra la IA de nivel `level`. */
export function recordGame(s: GameState, side: Faction, level: GameRecord["level"]): GameRecord {
  const o = outcome(s), me = side === "legion" ? 0 : 1;
  const rec: GameRecord = {
    at: new Date().toISOString(), side, level, mission: s.mission ?? "", rounds: Math.min(s.turn, 5),
    ...(s.conditions ? { conditions: s.conditions } : {}), ...(s.campaignBattle ? { campaign: s.campaignBattle } : {}),
    result: o.winner === null ? "empate" : o.winner === side ? "victoria" : "derrota",
    vp: [o.vp[me], o.vp[1 - me]],
  };
  saveRecords([...loadRecords(), rec]);
  return rec;
}

/** Recuento por clave: victorias, empates y derrotas. */
export function tally(rs: GameRecord[], key: (r: GameRecord) => string): Map<string, [number, number, number]> {
  const m = new Map<string, [number, number, number]>();
  for (const r of rs) {
    const k = key(r), t = m.get(k) ?? [0, 0, 0];
    t[r.result === "victoria" ? 0 : r.result === "empate" ? 1 : 2]++;
    m.set(k, t);
  }
  return m;
}

const LEVEL = { facil: "Fácil", normal: "Normal", dificil: "Difícil" } as const;

export class RecordDialog {
  private confirmClear = false;
  constructor() {
    $("record-backdrop").addEventListener("click", (e) => {
      if (e.target === $("record-backdrop")) { this.hide(); return; }
      const b = (e.target as HTMLElement).closest("button[data-r]") as HTMLButtonElement | null;
      if (b?.dataset.r === "close") this.hide();
      if (b?.dataset.r === "clear") {
        if (!this.confirmClear) { this.confirmClear = true; this.render(); return; }
        saveRecords([]); this.confirmClear = false; this.render();
      }
    });
  }
  show() { this.confirmClear = false; this.render(); $("record-backdrop").hidden = false; modal.open = true; }
  hide() { $("record-backdrop").hidden = true; modal.open = false; }

  render() {
    const rs = loadRecords();
    const row = (label: string, t: [number, number, number] | undefined) => {
      const [w, d, l] = t ?? [0, 0, 0], n = w + d + l;
      return `<tr><td>${label}</td><td>${w}</td><td>${d}</td><td>${l}</td><td>${n ? Math.round((w / n) * 100) + " %" : "—"}</td></tr>`;
    };
    const head = `<tr><th></th><th>Victorias</th><th>Empates</th><th>Derrotas</th><th>% victorias</th></tr>`;
    const byLevel = tally(rs, (r) => r.level), bySide = tally(rs, (r) => r.side), all = tally(rs, () => "x");
    const last = rs.slice(-10).reverse().map((r) => {
      const d = new Date(r.at);
      const res = r.result === "victoria" ? `<b class="win">Victoria</b>` : r.result === "derrota" ? `<b class="loss">Derrota</b>` : "<b>Empate</b>";
      return `<tr><td class="dim">${d.toLocaleDateString("es-ES")} ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td><td>${res} ${r.vp[0]}-${r.vp[1]}</td>`
        + `<td><span style="color:${FACTIONS[r.side].color}">${FACTIONS[r.side].name}</span> · IA ${LEVEL[r.level]}</td>`
        + `<td>${MISSIONS[r.mission as keyof typeof MISSIONS]?.name ?? "—"}${r.conditions ? ` · ${CONDITIONS[r.conditions as keyof typeof CONDITIONS]?.name ?? ""}` : ""}${r.campaign ? ` · campaña ${r.campaign}` : ""}</td></tr>`;
    }).join("");
    $("record").innerHTML = `<div style="display:flex;align-items:center"><h2>Historial</h2><button data-r="close" style="margin-left:auto">Cerrar</button></div>`
      + (rs.length ? `<p class="dim">${rs.length} partida${rs.length > 1 ? "s" : ""} contra la IA en este navegador.</p>`
        + `<h3>Por dificultad</h3><table class="rec">${head}${(["facil", "normal", "dificil"] as const).map((l) => row(LEVEL[l], byLevel.get(l))).join("")}${row("<b>Total</b>", all.get("x"))}</table>`
        + `<h3>Por bando</h3><table class="rec">${head}${(["legion", "swarm"] as const).map((f) => row(`<span style="color:${FACTIONS[f].color}">${FACTIONS[f].name}</span>`, bySide.get(f))).join("")}</table>`
        + `<h3>Últimas partidas</h3><table class="rec last">${last}</table>` + achievementsHtml()
        + `<div style="text-align:right;margin-top:10px"><button data-r="clear">${this.confirmClear ? "¿Seguro? Pulsa otra vez" : "Borrar historial"}</button></div>`
      : `<p class="dim">Aún no hay partidas. Cuando acabes una contra la IA, se apunta aquí.</p>` + achievementsHtml());
  }
}
