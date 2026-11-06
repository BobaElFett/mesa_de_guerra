import { CommandBus } from "../core/commands";
import { FACTIONS, GameState, PLAYERS, RollRecord } from "../core/state";

// Interfaz: turno, deshacer/rehacer, dados y medida al arrastrar.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

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
    $("end-turn").addEventListener("click", () => bus.dispatch({ type: "endTurn" }));
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

  render(s: GameState) {
    const f = FACTIONS[PLAYERS[s.active]];
    $("turn-text").innerHTML = `Ronda ${s.turn} · Turno ${f.of.replace(/(Legión Astral|Enjambre)/, `<b style="color:${f.color}">$1</b>`)}`;
    ($("undo") as HTMLButtonElement).disabled = !this.bus.canUndo;
    ($("redo") as HTMLButtonElement).disabled = !this.bus.canRedo;

    const last = s.rolls.at(-1);
    $("dice-result").innerHTML = last ? rollHtml(last, true) : `<span class="dim">Sin tiradas todavía</span>`;
    $("dice-history").innerHTML = s.rolls.slice(-6, -1).reverse()
      .map((r) => `<li>${rollHtml(r, false)}</li>`).join("");
  }

  /** Resumen de la selección, abajo a la izquierda. */
  renderSelection(s: GameState, selected: Set<string>) {
    const el = $("sel");
    if (!selected.size) { el.hidden = true; return; }
    const by = new Map<string, number>();
    for (const p of s.pieces) if (selected.has(p.id)) by.set(p.faction, (by.get(p.faction) ?? 0) + 1);
    const parts = [...by].map(([f, n]) => {
      const F = FACTIONS[f as keyof typeof FACTIONS];
      return `<b style="color:${F.color}">${n}</b> ${F.name}`;
    });
    el.innerHTML = `${selected.size === 1 ? "1 miniatura seleccionada" : `${selected.size} miniaturas seleccionadas`} · ${parts.join(" · ")}`
      + `<div class="dim">Arrastra para mover · <kbd>R</kbd> girar · <kbd>Esc</kbd> soltar</div>`;
    el.hidden = false;
  }

  /** Distancia recorrida junto al cursor mientras se arrastra una miniatura. */
  showMeasure(inches: number | null, x: number, y: number) {
    const el = $("measure");
    if (inches === null) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = `${inches.toFixed(1).replace(".", ",")}"`;
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
  const who = `<span style="color:${f.color}">${f.name}</span> · ronda ${r.turn}`;
  return big
    ? `<div class="dice">${dice}</div><div class="dim">${counts.join("  ")} — ${who}</div>`
    : `<span class="dim">${r.results.length}D${r.sides}:</span> ${counts.join("  ")}`;
}
