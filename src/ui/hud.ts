import { CommandBus } from "../core/commands";
import { FACTIONS, GameState, PLAYERS, RollRecord, TERRAIN } from "../core/state";
import { PHASES, PHASE_INFO, MAX_ROUNDS } from "../rules/turn";
import { DATASHEETS } from "../rules/datasheets";
import { allowance, isEngaged, movedSoFar, MoveKind } from "../rules/movement";
import { shootingOptions } from "../rules/shooting";
import { Weapon } from "../rules/datasheets";

// Interfaz: turno, deshacer/rehacer, dados y medida al arrastrar.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** En modo reglas, con una sola unidad seleccionada: su hoja y, en movimiento, cómo mueve. */
function unitCard(s: GameState, selected: Set<string>): string {
  if (!s.rulesMode) return "";
  const units = new Set(s.pieces.filter((p) => selected.has(p.id)).map((p) => p.unit));
  if (units.size !== 1) return "";
  const uid = [...units][0];
  if (!uid) return "";
  const unit = s.units.find((u) => u.id === uid);
  if (!unit) return "";
  const ds = DATASHEETS[unit.datasheet], P = ds.profile;
  const alive = s.pieces.filter((p) => p.unit === uid).length;
  let html = `<div class="unit-card"><b>${ds.name}</b> <span class="dim">· ${alive}/${unit.startingModels} miniaturas</span>`
    + `<div class="stats">M ${P.M}" · R ${P.T} · Sv ${P.Sv}+${P.Inv ? ` · Inv ${P.Inv}+` : ""} · H ${P.W} · L ${P.Ld}+ · CO ${P.OC}</div>`;
  if (s.phase === "movimiento" && unit.faction === PLAYERS[s.active] && !s.gameOver) {
    const mv = s.turnLog.moves[uid];
    const used = movedSoFar(s, uid), max = allowance(s, uid, mv);
    const engagedNow = isEngaged(s, uid);
    const fixed = mv?.kind === "avanzar" || used > 0.01;
    const label: Record<MoveKind, string> = { normal: "Mueve", avanzar: "Avanza", retirarse: "Se retira" };
    html += mv
      ? `<div>${label[mv.kind]}${mv.kind === "avanzar" ? ` (${P.M}" + ${mv.advance}")` : ""}: <b>${fmtIn(used)}</b> de ${fmtIn(max)}</div>`
      : `<div class="dim">${engagedNow ? "Trabada: solo puede retirarse o quedarse quieta." : "Elige cómo mueve, o arrástrala para un movimiento normal."}</div>`;
    if (!fixed) {
      const b = (k: MoveKind, text: string, on: boolean) =>
        `<button data-move="${k}" data-unit="${uid}"${on ? "" : " disabled"}${mv?.kind === k ? ' class="on"' : ""}>${text}</button>`;
      html += `<div class="move-btns">${b("normal", `Mover ${P.M}"`, !engagedNow)}${b("avanzar", "Avanzar +D6", !engagedNow)}${b("retirarse", "Retirarse", engagedNow)}</div>`;
    }
    if (mv?.kind === "avanzar") html += `<div class="dim">Tras avanzar no dispara (salvo armas de Asalto) ni carga${ds.abilities.includes("rapidez") ? " (Rapidez: esta sí puede cargar)" : ""}.</div>`;
    if (mv?.kind === "retirarse") html += `<div class="dim">Tras retirarse no dispara ni carga este turno.</div>`;
  }
  if (s.phase === "disparo" && unit.faction === PLAYERS[s.active] && !s.gameOver) {
    const o = shootingOptions(s, uid);
    if (o.blocked) html += `<div class="dim">${o.blocked}</div>`;
    if (!o.weapons.length) html += `<div class="dim">Sin armas a distancia.</div>`;
    for (const w of o.weapons) {
      html += `<div class="weapon"><b>${w.weapon.name}</b> <span class="dim">${weaponLine(w.weapon)} · ${w.carriers.length} ${w.carriers.length === 1 ? "miniatura" : "miniaturas"}</span>`;
      if (w.fired) html += `<div class="dim">Ya ha disparado.</div>`;
      else if (w.blocked) html += `<div class="dim">${w.blocked}</div>`;
      else for (const t of w.targets) {
        const ok = !t.blocked;
        const info = t.blocked ?? `${fmtIn(t.distance)}${t.cover ? " · en cobertura" : ""}${t.attackers.length < w.carriers.length ? ` · ${t.attackers.length} a tiro` : ""}`;
        html += `<div class="shoot-row"><button data-shoot="${uid}|${w.weapon.id}|${t.unit}" data-target="${t.unit}"${ok ? "" : " disabled"}>Disparar a ${t.name}</button> <span class="dim">${info}</span></div>`;
      }
      html += `</div>`;
    }
  }
  return html + "</div>";
}

const fmtIn = (v: number) => `${v.toFixed(1).replace(".", ",")}"`;

/** Perfil corto de un arma: 24" A2 3+ F4 FP−1 D1 (Asalto). */
export function weaponLine(w: Weapon): string {
  const ab = w.abilities.map((a) => ({ asalto: "Asalto", pesada: "Pesada", pistola: "Pistola", rafaga: `Ráfaga ${"x" in a ? a.x : ""}`,
    sostenida: `Sostenida ${"x" in a ? a.x : ""}`, letal: "Letal", devastadora: "Devastadora", explosiva: "Explosiva", torrente: "Torrente" })[a.kind]);
  return `${w.range === "CC" ? "CC" : `${w.range}"`} A${w.attacks} ${w.skill ? `${w.skill}+` : "—"} F${w.strength} FP${w.ap === 0 ? "0" : `−${-w.ap}`} D${w.damage}${ab.length ? ` (${ab.join(", ")})` : ""}`;
}

export interface HudActions {
  toggleGrid(): boolean;
  toggleTopDown(): boolean;
  newTable(): void;
}

export class Hud {
  private diceCount = 5;
  private confirmNew = 0;

  constructor(private bus: CommandBus, private actions: HudActions) {
    $("undo").addEventListener("click", () => bus.undo());
    $("redo").addEventListener("click", () => bus.redo());
    $("end-turn").addEventListener("click", () => this.advance());
    $("mode").addEventListener("click", () => bus.dispatch({ type: "setRulesMode", on: !bus.state.rulesMode }));
    $("sel").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-move]") as HTMLButtonElement | null;
      if (b && !b.disabled) this.onDeclareMove(b.dataset.unit!, b.dataset.move as MoveKind);
      const sh = (e.target as HTMLElement).closest("button[data-shoot]") as HTMLButtonElement | null;
      if (sh && !sh.disabled) { const [u, w, t] = sh.dataset.shoot!.split("|"); this.onShoot(u, w, t); }
    });
    $("sel").addEventListener("mouseover", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-target]") as HTMLButtonElement | null;
      this.onTargetHover(b ? b.dataset.target! : null);
    });
    $("sel").addEventListener("mouseleave", () => this.onTargetHover(null));
    $("grid").addEventListener("click", () => $("grid").classList.toggle("on", actions.toggleGrid()));
    $("topdown").addEventListener("click", () => $("topdown").classList.toggle("on", actions.toggleTopDown()));
    $("new").addEventListener("click", () => {
      const now = performance.now();
      if (this.confirmNew > 0 && now - this.confirmNew < 3000) {
        this.confirmNew = 0;
        $("new").textContent = "Nueva mesa";
        actions.newTable();
      } else {
        this.confirmNew = now;
        $("new").textContent = "¿Seguro? Otra vez";
        setTimeout(() => { if (this.confirmNew === now) { this.confirmNew = 0; $("new").textContent = "Nueva mesa"; } }, 3000);
      }
    });
    $("dice-minus").addEventListener("click", () => this.setCount(this.diceCount - 1));
    $("dice-plus").addEventListener("click", () => this.setCount(this.diceCount + 1));
    $("roll").addEventListener("click", () => bus.dispatch({ type: "roll", count: this.diceCount, sides: 6 }));
    for (const b of document.querySelectorAll<HTMLButtonElement>("button")) {
      b.addEventListener("mouseup", () => b.blur());   // que Espacio no vuelva a pulsar el botón
    }
    this.setCount(this.diceCount);
  }

  private setCount(n: number) {
    this.diceCount = Math.max(1, Math.min(40, n));
    $("dice-count").textContent = String(this.diceCount);
    $("roll").textContent = `Tirar ${this.diceCount}D6`;
  }

  rollMore(delta: number) { this.setCount(this.diceCount + delta); }
  rollNow() { this.bus.dispatch({ type: "roll", count: this.diceCount, sides: 6 }); }

  /** Intro / botón: siguiente fase en modo reglas; siguiente turno en mesa libre. */
  advance() {
    this.bus.dispatch(this.bus.state.rulesMode ? { type: "nextPhase" } : { type: "endTurn" });
  }

  render(s: GameState) {
    const f = FACTIONS[PLAYERS[s.active]];
    const who = f.of.replace(/(Legión Astral|Enjambre)/, `<b style="color:${f.color}">$1</b>`);
    const rounds = s.rulesMode ? `${s.turn}/${MAX_ROUNDS}` : `${s.turn}`;
    $("turn-text").innerHTML = s.gameOver ? `<b>Fin de la partida</b> · 5 rondas jugadas` : `Ronda ${rounds} · Turno ${who}`;
    $("mode").textContent = s.rulesMode ? "Modo reglas" : "Mesa libre";
    $("mode").classList.toggle("on", s.rulesMode);
    const btn = $<HTMLButtonElement>("end-turn");
    btn.textContent = s.rulesMode ? (s.phase === "combate" ? "Terminar turno" : "Siguiente fase") : "Pasar turno";
    btn.disabled = s.gameOver;
    const phases = $("phases");
    phases.hidden = !s.rulesMode;
    if (s.rulesMode) {
      phases.innerHTML = PHASES.map((p) => `<span class="ph${p === s.phase && !s.gameOver ? " now" : ""}">${PHASE_INFO[p].name}</span>`).join("")
        + `<span class="cp" title="Puntos de mando">PM <b style="color:${FACTIONS.legion.color}">${s.cp[0]}</b> · <b style="color:${FACTIONS.swarm.color}">${s.cp[1]}</b></span>`;
      $("phase-hint").textContent = s.gameOver ? "Partida terminada. Deshacer (Ctrl+Z) vuelve atrás; Nueva mesa empieza otra." : PHASE_INFO[s.phase].hint;
    }
    $("phase-hint").hidden = !s.rulesMode;
    ($("undo") as HTMLButtonElement).disabled = !this.bus.canUndo;
    ($("redo") as HTMLButtonElement).disabled = !this.bus.canRedo;

    const last = s.rolls.at(-1);
    $("dice-result").innerHTML = last ? rollHtml(last, true) : `<span class="dim">Sin tiradas todavía</span>`;
    $("dice-history").innerHTML = s.rolls.slice(-6, -1).reverse()
      .map((r) => `<li>${rollHtml(r, false)}</li>`).join("");
  }

  /** Resumen de la selección, abajo a la izquierda. */
  /** El jugador elige cómo mueve una unidad (botones del panel de unidad). */
  onDeclareMove: (unit: string, kind: MoveKind) => void = () => {};
  /** El jugador dispara un arma de una unidad a una unidad enemiga. */
  onShoot: (unit: string, weapon: string, target: string) => void = () => {};
  /** El ratón pasa por encima de un botón de objetivo (para resaltar esa unidad). */
  onTargetHover: (unit: string | null) => void = () => {};

  renderSelection(s: GameState, selected: Set<string>, incoherent: Set<string> = new Set()) {
    const el = $("sel");
    if (!selected.size) { el.hidden = true; return; }
    const by = new Map<string, number>();
    for (const p of s.pieces) if (selected.has(p.id)) by.set(p.faction, (by.get(p.faction) ?? 0) + 1);
    const parts = [...by].map(([f, n]) => {
      const F = FACTIONS[f as keyof typeof FACTIONS];
      return `<b style="color:${F.color}">${n}</b> ${F.name}`;
    });
    const terr = s.terrain.filter((t) => selected.has(t.id));
    if (terr.length) parts.push(`<b style="color:#c9c3b4">${terr.length}</b> ${terr.length === 1 ? TERRAIN[terr[0].kind].name.toLowerCase() : "piezas de escenografía"}`);
    el.innerHTML = `${selected.size === 1 ? "1 seleccionada" : `${selected.size} seleccionadas`} · ${parts.join(" · ")}`
      + unitCard(s, selected)
      + (incoherent.size ? `<div class="warn">${incoherent.size} fuera de coherencia (más de 2" de su unidad)</div>` : "")
      + `<div class="dim">Arrastra para mover · <kbd>R</kbd> girar · <kbd>Esc</kbd> soltar</div>`;
    el.hidden = false;
  }

  /** Distancia recorrida junto al cursor mientras se arrastra una miniatura. */
  showMeasure(text: string | null, x: number, y: number) {
    const el = $("measure");
    if (text === null) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = text;
    el.style.left = `${x + 16}px`;
    el.style.top = `${y - 10}px`;
  }
}

function rollHtml(r: RollRecord, big: boolean): string {
  const f = FACTIONS[PLAYERS[r.player]];
  const sorted = r.results.slice().sort((a, b) => b - a);
  const dice = sorted.map((v) => `<span class="die${v === 6 ? " six" : v === 1 ? " one" : ""}">${v}</span>`).join("");
  const counts: string[] = [];
  for (let v = r.sides; v >= 1; v--) {
    const n = r.results.filter((x) => x === v).length;
    if (n) counts.push(`${n}×${v}`);
  }
  const re = r.rerolled?.length ? ` · ${r.rerolled.length} repetido${r.rerolled.length > 1 ? "s" : ""}` : "";
  const who = `<span style="color:${f.color}">${f.name}</span> · ronda ${r.turn}${re}`;
  return big
    ? `<div class="dice">${dice}</div><div class="dim">${counts.join("  ")} — ${who}</div>`
    : `<span class="dim">${r.results.length}D${r.sides}:</span> ${counts.join("  ")}`;
}
