import { AttackLogEntry } from "../rules/shooting";
import { DATASHEETS, WEAPONS } from "../rules/datasheets";
import { GameState } from "../core/state";
import { DiceTray } from "./dice";

// Reproduce un ataque resuelto paso a paso: impactar → herir → salvar, cada uno con sus
// dados rodando en la bandeja y una línea en el informe. Al acabar avisa (para tumbar las bajas).

/** Los dados como fichas pequeñas, de mayor a menor; verdes los éxitos. */
function chips(dice: number[], good: (v: number) => boolean): string {
  if (!dice.length) return "";
  const shown = dice.slice().sort((a, b) => b - a);
  const max = 40;
  return `<div class="chips">${shown.slice(0, max).map((v) => `<span class="chip${good(v) ? " ok" : ""}">${v}</span>`).join("")}${shown.length > max ? ` <span class="dim">+${shown.length - max}</span>` : ""}</div>`;
}

interface Step {
  dice: number[];
  /** Qué dados son éxito para el que tira (verde en la bandeja). */
  good: (v: number) => boolean;
  line: string;
}

const PAUSE = 0.9;   // segundos entre pasos, con los dados quietos

export class ShotPlayer {
  private steps: Step[] = [];
  private i = -1;
  private wait = 0;
  private settled = false;
  private entry: AttackLogEntry | null = null;
  private header = "";
  private lines: string[] = [];
  private footer = "";
  onDone: () => void = () => {};

  constructor(private tray: DiceTray, private panel: HTMLElement) {
    panel.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      if (b.dataset.act === "skip") this.finish();
      if (b.dataset.act === "close") this.panel.hidden = true;
      if (b.dataset.act === "tray") this.onLookTray();
    });
  }

  get playing() { return this.i >= 0; }
  onLookTray: () => void = () => {};

  play(entry: AttackLogEntry, s: GameState) {
    if (this.playing) this.finish();
    this.entry = entry;
    const r = entry.result;
    const w = WEAPONS[entry.weapon];
    const tUnit = s.units.find((u) => u.id === entry.target)!;
    const aUnit = s.units.find((u) => u.id === entry.attacker)!;
    const tName = DATASHEETS[tUnit.datasheet].name;
    this.header = `<b>${DATASHEETS[aUnit.datasheet].name}</b> dispara con <b>${w.name}</b> (${entry.attackers} ${entry.attackers === 1 ? "miniatura" : "miniaturas"}) a <b>${tName}</b>${entry.cover ? " · <span class=\"cov\">en cobertura</span>" : ""}`;
    this.steps = [];
    const hitOn = entry.hitOn;
    if (hitOn === null) {
      this.lines = [`Impactos automáticos (Torrente): <b>${r.hits}</b>`];
    } else {
      this.lines = [];
      const extra = r.hits - r.hitRolls.filter((v) => v !== 1 && (v === 6 || v >= hitOn)).length;
      this.steps.push({
        dice: r.hitRolls, good: (v) => v !== 1 && (v === 6 || v >= hitOn),
        line: `Impactar (${hitOn}+): ${r.hitRolls.length} dados → <b>${r.hits} impacto${r.hits === 1 ? "" : "s"}</b>${extra > 0 ? ` (${extra} por Sostenida)` : ""}`,
      });
    }
    if (r.woundRolls.length || r.wounds) {
      const on = entry.woundOn;
      this.steps.push({
        dice: r.woundRolls, good: (v) => v !== 1 && (v === 6 || v >= on),
        line: `Herir (${on}+): ${r.woundRolls.length} dados → <b>${r.wounds} herida${r.wounds === 1 ? "" : "s"}</b>`,
      });
    }
    if (r.wounds) {
      const sv = r.saveTarget;
      this.steps.push({
        dice: r.saveRolls, good: (v) => sv !== null && v !== 1 && v >= sv,   // verde = salvada (éxito del defensor)
        line: sv === null
          ? `Sin salvación posible: <b>${r.failedSaves} fallada${r.failedSaves === 1 ? "" : "s"}</b>`
          : `Salvar (${sv}+): ${r.saveRolls.length} dados → <b>${r.failedSaves} fallada${r.failedSaves === 1 ? "" : "s"}</b>`,
      });
    }
    const left = s.pieces.filter((p) => p.unit === entry.target).length;
    this.footer = r.slain.length
      ? `Bajas: <b class="bad">${r.slain.length}</b> ${tName}${left === 0 ? " · <b class=\"bad\">unidad destruida</b>" : ` · quedan ${left}`}`
      : r.failedSaves ? `Sin bajas (daño repartido: ${r.damageRolls.reduce((a, b) => a + b, 0)})` : "Sin bajas";
    this.i = -1;
    this.panel.hidden = false;
    this.next();
  }

  /** Salta al final: el informe completo y los dados del último paso. */
  finish() {
    if (!this.playing) return;
    const full = (st: Step) => st.line + chips(st.dice, st.good);
    if (this.i < this.steps.length && !this.settled) this.lines.push(full(this.steps[this.i]));
    while (this.i < this.steps.length - 1) {
      this.i++;
      this.lines.push(full(this.steps[this.i]));
    }
    const last = this.steps.at(-1);
    if (last) { this.tray.show(this.record(last.dice), false); this.tray.setGood(last.good); }
    this.end();
  }

  update(dt: number) {
    if (!this.playing) return;
    const step = this.steps[this.i];
    if (!step) return;
    if (!this.settled) {
      if (this.tray.busy) return;
      this.settled = true;
      this.tray.setGood(step.good);
      this.lines.push(step.line + chips(step.dice, step.good));
      this.render(true);
      this.wait = PAUSE;
      return;
    }
    this.wait -= dt;
    if (this.wait <= 0) this.next();
  }

  private next() {
    this.i++;
    if (this.i >= this.steps.length) { this.end(); return; }
    const step = this.steps[this.i];
    this.settled = false;
    this.tray.setGood(null);
    if (step.dice.length) this.tray.show(this.record(step.dice), true);
    else { this.settled = true; this.lines.push(step.line); this.wait = 0.3; }
    this.render(true);
  }

  private end() {
    this.i = -1;
    this.render(false);
    this.onDone();
  }

  private record(dice: number[]) {
    return { player: this.entry?.player ?? 0, turn: this.entry?.turn ?? 0, sides: 6, results: dice };
  }

  private render(playing: boolean) {
    this.panel.innerHTML = `<div>${this.header}</div><ul>${this.lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      + (playing ? "" : `<div class="foot">${this.footer}</div>`)
      + `<div class="acts"><button data-act="tray">Ver bandeja</button> ${playing ? `<button data-act="skip">Saltar</button>` : `<button data-act="close">Cerrar</button>`}</div>`;
  }
}
