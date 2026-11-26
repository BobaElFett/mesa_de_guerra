import type { CommandBus } from "../core/commands";
import { GameState, PLAYERS } from "../core/state";
import { DATASHEETS, pieceWeaponIds, Weapon, WEAPONS } from "../rules/datasheets";
import { chargeOptions, fightOptions, fightSteps } from "../rules/melee";
import { chance2d6, previewAttacks, StepPreview } from "../rules/preview";
import { shootingOptions, shootSteps } from "../rules/shooting";
import { hasStrat, STRAT_IDS, StratId, STRATAGEMS, stratBlocked, stratCost } from "../rules/stratagems";
import { actionsAgainst } from "../rules/actions";
import { expectedAttack } from "../ai/evaluate";
import { weaponLine } from "./hud";

// Panel de ataque (#127, #128): al elegir un enemigo, lo que va a pasar antes de tirar.
// Disparo: todas las armas de la unidad, cada una con su tirada para impactar, herir y salvar y
// las bajas esperadas; se desmarcan las que no se quieran usar y un solo botón dispara las demás.
// Combate: los golpes de cada arma y sus bajas. Carga: distancia, tirada y probabilidad.

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const nm = (s: GameState, u: string) => DATASHEETS[s.units.find((x) => x.id === u)!.datasheet].name;
const n1 = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const pct = (p: number) => `${Math.round(p * 100)} %`;
const roll = (v: number | "auto" | null) => (v === "auto" ? "solo" : v === null ? "—" : v >= 7 ? "no" : `${v}+`);

type Kind = "disparo" | "carga" | "combate";

export class AttackPanel {
  private kind: Kind | null = null;
  private actor: string[] = [];
  private target = "";
  /** Armas desmarcadas, por «unidad|arma». */
  private off = new Set<string>();
  private key = "";
  /** Heridas por miniatura del objetivo (para enseñar heridas además de bajas). */
  private W = 1;

  /** ¿Puede este jugador dar órdenes a esa unidad? */
  canAct: (unit: string) => boolean = () => true;
  /** Avisa al terminar (para limpiar la selección, etc.). */
  onDone: () => void = () => {};

  constructor(private bus: CommandBus) {
    const el = $("attack-panel");
    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest("button") as HTMLButtonElement | null;
      if (t instanceof HTMLInputElement && t.dataset.w) {
        if (t.checked) this.off.delete(t.dataset.w); else this.off.add(t.dataset.w);
        this.render(true);
        return;
      }
      if (!b || b.disabled) return;
      if (b.dataset.act === "close") this.close();
      else if (b.dataset.act === "fire") this.fire();
      else if (b.dataset.act === "fight") { this.bus.dispatch({ type: "fight", unit: b.dataset.unit!, target: this.target }); this.done(); }
      else if (b.dataset.act === "charge") { this.bus.dispatch({ type: "charge", unit: b.dataset.unit!, target: this.target }); this.done(); }
      else if (b.dataset.act === "impetu") { this.bus.dispatch({ type: "stratagem", id: b.dataset.id as never, unit: b.dataset.unit! }); this.render(true); }
      else if (b.dataset.cmd) { this.bus.dispatch(JSON.parse(b.dataset.cmd)); this.render(true); }
    });
    window.addEventListener("keydown", (e) => {
      if (!this.isOpen) return;
      if (e.code === "Escape") this.close();
      if (e.code === "Enter" && !(e.target as HTMLElement).closest("input, select, textarea")) {
        e.preventDefault(); e.stopPropagation();
        (el.querySelector("button.primary:not([disabled])") as HTMLButtonElement | null)?.click();
      }
    }, true);
  }

  get isOpen() { return !$("attack-panel").hidden; }
  get targetUnit() { return this.isOpen ? this.target : null; }

  open(kind: Kind, actor: string[], target: string) {
    if (this.kind !== kind || this.target !== target || this.actor.join() !== actor.join()) this.off.clear();
    this.kind = kind; this.actor = actor; this.target = target;
    $("attack-panel").hidden = false;
    this.render(true);
  }

  close() { $("attack-panel").hidden = true; this.kind = null; }

  /** Tras cada cambio de estado: se rehace, o se cierra si ya no tiene sentido. */
  refresh() {
    if (!this.isOpen) return;
    const s = this.bus.state;
    if (!s.rulesMode || s.gameOver || s.phase !== this.kind || !s.pieces.some((p) => p.unit === this.target)
      || !this.actor.some((u) => s.pieces.some((p) => p.unit === u))) { this.close(); return; }
    this.render(false);
  }

  private done() { this.close(); this.onDone(); }

  private fire() {
    for (const u of this.actor) {
      const ws = this.chosen(u);
      if (ws.length) this.bus.dispatch({ type: "shootAll", unit: u, target: this.target, weapons: ws });
    }
    this.done();
  }

  /** Armas marcadas de la unidad que pueden disparar al objetivo. */
  private chosen(u: string): string[] {
    const s = this.bus.state;
    return shootSteps(s, u, this.target, this.rangedIds(s, u)).map((st) => st.weapon.id).filter((id) => !this.off.has(`${u}|${id}`));
  }

  private rangedIds(s: GameState, u: string): string[] {
    return shootingOptions(s, u).weapons.map((w) => w.weapon.id);
  }

  private render(force: boolean) {
    const s = this.bus.state;
    const key = `${this.bus.length}|${this.kind}|${this.actor}|${this.target}|${[...this.off]}`;
    if (!force && key === this.key) return;
    this.key = key;
    const el = $("attack-panel");
    const tModels = s.pieces.filter((p) => p.unit === this.target).length;
    const tName = nm(s, this.target);
    this.W = DATASHEETS[s.units.find((u) => u.id === this.target)!.datasheet].profile.W;
    const title = this.kind === "disparo" ? "Disparar a" : this.kind === "carga" ? "Cargar a" : "Combatir contra";
    let body = "";
    if (this.kind === "disparo") body = this.shootBody(s);
    else if (this.kind === "combate") body = this.fightBody(s);
    else body = this.chargeBody(s);
    // Justo encima del panel de turno, que cambia de alto según la fase
    const turn = document.getElementById("turn")?.getBoundingClientRect();
    const z = Number(getComputedStyle(document.documentElement).getPropertyValue("--ui")) || 1;
    if (turn) el.style.bottom = `${(innerHeight - turn.top + 8) / z}px`;
    el.innerHTML = `<div class="ap-head"><span class="ap-verb">${title}</span> <b>${esc(tName)}</b>
      <span class="dim">${tModels} miniatura${tModels === 1 ? "" : "s"} · ${this.profileLine(s)}</span>
      <button data-act="close" title="Esc">×</button></div>${body}`;
  }

  /** Estratagemas de la fase que mejoran este ataque (sin objetivo): se activan aquí y el panel se rehace. */
  private stratRow(s: GameState, units: string[]): string {
    const skip = new Set(["granadas", "oleada", "valor", "repeticion", "hambre", "avanceTactico", "fuegoDefensivo", "humo", "intervencion", "impacto", "contraofensiva"]);
    const bs: string[] = [];
    for (const u of units) {
      if (!this.canAct(u)) continue;
      const fac = s.units.find((x) => x.id === u)!.faction;
      for (const id of STRAT_IDS) {
        const st = STRATAGEMS[id];
        if (skip.has(id) || st.phase !== s.phase || (st.faction && st.faction !== fac)) continue;
        if (hasStrat(s, id, u)) { bs.push(`<span class="badge lead">${esc(st.name)} activa</span>`); continue; }
        if (stratBlocked(s, id, u)) continue;
        bs.push(`<button data-act="impetu" data-id="${id}" data-unit="${u}" title="${esc(st.text)}">${esc(st.name)} · ${stratCost(s, id as StratId, u)} PM${units.length > 1 ? ` <span class="dim">(${esc(nm(s, u))})</span>` : ""}</button>`);
      }
    }
    return bs.length ? `<div class="ap-other"><span class="dim">Estratagemas:</span>${bs.join("")}</div>` : "";
  }

  private profileLine(s: GameState): string {
    const P = DATASHEETS[s.units.find((u) => u.id === this.target)!.datasheet].profile;
    return `R${P.T} · Sv${P.Sv}+${P.Inv ? `/${P.Inv}++` : ""} · ${P.W} H`;
  }

  private row(p: StepPreview, w: Weapon, models: number, check: string | null, on: boolean): string {
    const box = check === null ? "" : `<input type="checkbox" data-w="${check}"${on ? " checked" : ""}>`;
    return `<tr class="${on ? "" : "off"}"><td>${box}</td><td><b>${esc(w.name)}</b><div class="dim">${weaponLine(w)}</div></td>
      <td>${models} × ${n1(p.attacks / Math.max(1, models))}</td><td>${roll(p.hitOn)}</td><td>${roll(p.woundOn)}</td><td>${roll(p.saveOn)}</td>
      <td class="ap-exp">${on ? `≈ ${n1(p.kills)}${this.W > 1 ? `<div class="dim">${n1(p.damage)} H</div>` : ""}` : "—"}</td></tr>`;
  }

  private table(rows: string): string {
    return `<table class="ap-table"><thead><tr><th></th><th>Arma</th><th title="Miniaturas × ataques de cada una">Ataques</th><th>Impacta</th><th>Hiere</th><th title="Salvación del objetivo">Salva</th><th>Bajas</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private notes(list: string[]): string {
    const u = [...new Set(list)];
    return u.length ? `<div class="ap-notes">${u.map((n) => `<span>${esc(n)}</span>`).join("")}</div>` : "";
  }

  private total(kills: number, wipe: number, models: number, button: string, damage = 0): string {
    return `<div class="ap-foot"><div><b>≈ ${n1(kills)}</b> baja${Math.round(kills) === 1 ? "" : "s"} de ${models}${this.W > 1 ? ` <span class="dim">(≈ ${n1(damage)} heridas)</span>` : ""}
      <span class="dim">· ${wipe >= 0.995 ? "la destruye seguro" : wipe < 0.005 ? "no la destruye" : `${pct(wipe)} de destruirla`}</span></div>${button}</div>`;
  }

  private shootBody(s: GameState): string {
    let rows = "", notes: string[] = [], allSteps: ReturnType<typeof shootSteps> = [];
    let can = false;
    const multi = this.actor.length > 1;
    for (const u of this.actor) {
      const o = shootingOptions(s, u);
      if (multi) rows += `<tr class="ap-sub"><td colspan="7">${esc(nm(s, u))}</td></tr>`;
      if (o.blocked) { rows += `<tr class="off"><td></td><td colspan="6" class="dim">${esc(o.blocked)}</td></tr>`; continue; }
      if (!this.canAct(u)) continue;
      for (const w of o.weapons) {
        const t = w.targets.find((x) => x.unit === this.target);
        const why = w.fired ? "Ya ha disparado." : w.blocked ?? (t ? t.blocked : "Fuera de alcance o sin visión.");
        if (why || !t) { rows += `<tr class="off"><td></td><td><b>${esc(w.weapon.name)}</b></td><td colspan="5" class="dim">${esc(why ?? "")}</td></tr>`; continue; }
        const step = shootSteps(s, u, this.target, [w.weapon.id]);
        const on = !this.off.has(`${u}|${w.weapon.id}`);
        const p = previewAttacks(s, step, 200).steps[0];
        rows += this.row(p, w.weapon, t.attackers.length, `${u}|${w.weapon.id}`, on);
        if (on) { allSteps = allSteps.concat(step); notes = notes.concat(p.notes); can = true; }
      }
    }
    const pv = previewAttacks(s, allSteps, 300);
    const others = actionsAgainst(s, this.actor, this.target).filter((a) => a.cmd && a.cmd.type !== "shoot");
    const extra = others.length ? `<div class="ap-other"><span class="dim">También:</span>${others.map((a) => `<button data-cmd='${JSON.stringify(a.cmd).replace(/'/g, "&#39;")}' title="${esc(a.detail)}">${esc(a.label)}</button>`).join("")}</div>` : "";
    const able = this.actor.filter((u) => shootSteps(s, u, this.target, this.rangedIds(s, u)).length);
    return this.table(rows) + this.notes(notes) + this.stratRow(s, able) + extra
      + this.total(pv.kills, pv.wipe, pv.models, `<button class="primary" data-act="fire"${can ? "" : " disabled"}>Disparar${allSteps.length > 1 ? ` (${allSteps.length} armas)` : ""}</button>`, pv.damage);
  }

  private fightBody(s: GameState): string {
    let html = "";
    const order = this.actor.filter((u) => fightOptions(s, u).targets.some((t) => t.unit === this.target));
    if (!order.length) return `<div class="dim ap-msg">No está trabada con esa unidad.</div>`;
    for (const u of order) {
      const o = fightOptions(s, u);
      const { state, steps } = fightSteps(s, u, this.target);
      const pv = previewAttacks(state, steps, 300);
      let rows = "";
      steps.forEach((st, i) => { rows += this.row(pv.steps[i], st.weapon, st.attackers.length, null, true); });
      if (!steps.length) {
        const ds = DATASHEETS[s.units.find((x) => x.id === u)!.datasheet];
        const ws = [...new Set(s.pieces.filter((p) => p.unit === u).flatMap((p) => pieceWeaponIds(ds, p)))].map((id) => WEAPONS[id]).filter((w) => w.range === "CC");
        rows = ws.map((w) => `<tr class="off"><td></td><td><b>${esc(w.name)}</b></td><td colspan="5" class="dim">ninguna miniatura llega</td></tr>`).join("");
      }
      const why = o.fought ? "Ya ha combatido." : o.blocked;
      html += `${order.length > 1 ? `<div class="ap-subhead">${esc(nm(s, u))}</div>` : ""}${this.table(rows)}${this.notes(pv.steps.flatMap((x) => x.notes))}${o.fought ? "" : this.stratRow(s, [u])}
        ${why ? `<div class="dim ap-msg">${esc(why)}</div>` : ""}
        ${this.total(pv.kills, pv.wipe, pv.models, `<button class="primary" data-act="fight" data-unit="${u}"${why || !this.canAct(u) ? " disabled" : ""}>Combatir</button>`, pv.damage)}`;
    }
    return html + `<div class="dim ap-msg">Antes de golpear se agrupa hasta 3" hacia el enemigo; después se consolida.</div>`;
  }

  private chargeBody(s: GameState): string {
    const head = this.actor[0];
    const o = chargeOptions(s, head);
    const t = o.targets.find((x) => x.unit === this.target);
    const why = o.done ? "Ya ha cargado este turno." : o.blocked ?? (t ? t.blocked : "Demasiado lejos (más de 12\").");
    if (why || !t) return `<div class="dim ap-msg">${esc(why ?? "")}</div>`;
    const imp = hasStrat(s, "repeticion", head);
    const need = t.need - (hasStrat(s, "hambre", head) ? 2 : 0);
    const p = chance2d6(need, imp);
    const fac = s.units.find((u) => u.id === head)!.faction;
    const dmg = 0, enemyCp = 0;   // 11.ª: el fuego defensivo ya no responde a la carga
    void fac;
    const boosts = ["repeticion", "hambre"].filter((id) => !stratBlocked(s, id as never, head))
      .map((id) => id === "repeticion"
        ? `<button data-act="impetu" data-id="repeticion" data-unit="${head}">Repetición de mando · 1 PM <span class="dim">(repetir: ${pct(chance2d6(need, true))})</span></button>`
        : `<button data-act="impetu" data-id="hambre" data-unit="${head}">Hambre voraz · 1 PM <span class="dim">(+2: ${pct(chance2d6(need - 2, imp))})</span></button>`).join("");
    return `<div class="ap-charge">
        <div>Distancia <b>${n1(t.distance)}"</b> · necesitas <b>${need}+</b> en 2D6${imp ? " (con Repetición de mando: repite si falla)" : ""}${hasStrat(s, "hambre", head) ? " (con Hambre voraz)" : ""}</div>
        <div class="ap-bar"><span style="width:${Math.round(p * 100)}%"></span></div>
        <div><b>${pct(p)}</b> de llegar</div>
        ${dmg > 0.05 && enemyCp > 0 ? `<div class="dim">Si te responde con fuego defensivo (1 PM, le quedan ${enemyCp}): ≈ ${n1(dmg)} heridas.</div>` : ""}
      </div>${boosts ? `<div class="ap-other"><span class="dim">Mejorarla:</span>${boosts}</div>` : ""}
      <div class="ap-foot"><div class="dim">Si llega, combate primero en la fase de combate.</div>
      <button class="primary" data-act="charge" data-unit="${head}"${this.canAct(head) ? "" : " disabled"}>Cargar</button></div>`;
  }
}
