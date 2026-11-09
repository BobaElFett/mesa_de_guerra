import { CommandBus } from "../core/commands";
import { Faction, FACTIONS } from "../core/state";
import { DATASHEETS, DatasheetId, unitPoints } from "../rules/datasheets";
import { ArmyList, listPoints, validateList, POINTS_LIMIT, TEST_LEGION, TEST_SWARM } from "../rules/armies";
import { modal } from "./modal";

// Diálogo «Ejércitos»: una lista por bando con las hojas de datos de ese bando, puntos,
// validación del reglamento, listas guardadas en el navegador y botón para desplegar.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LISTS_KEY = "mesa-de-guerra.listas";
const SIDES: Faction[] = ["legion", "swarm"];

type Saved = Record<Faction, ArmyList[]>;

function readSaved(): Saved {
  try {
    const d = JSON.parse(localStorage.getItem(LISTS_KEY) ?? "null") as Saved | null;
    if (d && Array.isArray(d.legion) && Array.isArray(d.swarm)) return d;
  } catch { /* nada */ }
  return { legion: [], swarm: [] };
}
function writeSaved(d: Saved) {
  try { localStorage.setItem(LISTS_KEY, JSON.stringify(d)); } catch { /* nada */ }
}

const clone = (l: ArmyList): ArmyList => JSON.parse(JSON.stringify(l));

export class ArmyDialog {
  private lists: Record<Faction, ArmyList> = { legion: clone(TEST_LEGION), swarm: clone(TEST_SWARM) };
  onDeployed: () => void = () => {};
  onClosed: () => void = () => {};

  constructor(private bus: CommandBus, private notify: (m: string) => void) {
    $("armies-open").addEventListener("click", () => this.show());
    $("armies-close").addEventListener("click", () => this.hide());
    $("armies-backdrop").addEventListener("pointerdown", (e) => { if (e.target === $("armies-backdrop")) this.hide(); });
    $("armies-deploy").addEventListener("click", () => this.deploy());
    window.addEventListener("keydown", (e) => { if (e.code === "Escape" && !$("armies-backdrop").hidden) this.hide(); });
    $("armies").addEventListener("click", (e) => this.click(e));
    $("armies").addEventListener("change", (e) => this.change(e));
    $("armies").addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.name) this.lists[t.dataset.name as Faction].name = t.value;
    });
  }

  show() {
    modal.open = true;
    $("armies-backdrop").hidden = false;
    this.render();
  }

  hide() {
    modal.open = false;
    $("armies-backdrop").hidden = true;
    this.onClosed();
  }

  /** Listas actuales (para pruebas). */
  current() { return this.lists; }

  private deploy() {
    const errs = SIDES.flatMap((f) => validateList(this.lists[f], f));
    if (errs.length) { this.notify("Corrige las listas antes de desplegar."); return; }
    this.bus.dispatch({ type: "setArmies", legion: clone(this.lists.legion), swarm: clone(this.lists.swarm) });
    if (!this.bus.state.rulesMode) this.bus.dispatch({ type: "setRulesMode", on: true });
    this.hide();
    this.notify(`Ejércitos desplegados: ${listPoints(this.lists.legion)} y ${listPoints(this.lists.swarm)} puntos`);
    this.onDeployed();
  }

  private click(e: Event) {
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!b) return;
    const f = b.dataset.side as Faction | undefined;
    if (!f) return;
    const list = this.lists[f];
    if (b.dataset.act === "add") {
      const sel = $<HTMLSelectElement>(`add-${f}`);
      const ds = DATASHEETS[sel.value as DatasheetId];
      if (ds) list.units.push({ datasheet: ds.id, models: ds.sizes[0].models });
    } else if (b.dataset.act === "remove") {
      const gone = Number(b.dataset.i);
      list.units.splice(gone, 1);
      // Los líderes siguen apuntando a la misma escuadra (o a ninguna si era esa)
      for (const u of list.units) if (u.leads !== undefined) {
        if (u.leads === gone) delete u.leads;
        else if (u.leads > gone) u.leads--;
      }
    } else if (b.dataset.act === "save") {
      const saved = readSaved();
      const name = (list.name ?? "").trim() || `${FACTIONS[f].name} ${listPoints(list)} pts`;
      list.name = name;
      saved[f] = [clone(list), ...saved[f].filter((x) => x.name !== name)].slice(0, 20);
      writeSaved(saved);
      this.notify(`Lista guardada: «${name}»`);
    } else if (b.dataset.act === "clear") {
      this.lists[f] = { name: "", units: [] };
    } else if (b.dataset.act === "delete-saved") {
      const sel = $<HTMLSelectElement>(`load-${f}`);
      const saved = readSaved();
      saved[f] = saved[f].filter((x) => x.name !== sel.value);
      writeSaved(saved);
    }
    this.render();
  }

  private change(e: Event) {
    const t = e.target as HTMLSelectElement;
    if (t.dataset.leads !== undefined) {
      const [f, i] = t.dataset.leads.split("|");
      const u = this.lists[f as Faction].units[Number(i)];
      if (t.value === "") delete u.leads; else u.leads = Number(t.value);
      this.render();
    } else if (t.dataset.size !== undefined) {
      const [f, i] = t.dataset.size.split("|");
      this.lists[f as Faction].units[Number(i)].models = Number(t.value);
      this.render();
    } else if (t.id.startsWith("load-") && t.value) {
      const f = t.id.slice(5) as Faction;
      const found = readSaved()[f].find((x) => x.name === t.value);
      if (found) { this.lists[f] = clone(found); this.render(); }
    }
  }

  private render() {
    const saved = readSaved();
    let allOk = true;
    $("armies-cols").innerHTML = SIDES.map((f) => {
      const F = FACTIONS[f], list = this.lists[f];
      const pts = listPoints(list), errs = validateList(list, f);
      if (errs.length) allOk = false;
      const rows = list.units.map((u, i) => {
        const ds = DATASHEETS[u.datasheet];
        const sizes = ds.sizes.map((s) => `<option value="${s.models}"${s.models === u.models ? " selected" : ""}>${s.models}</option>`).join("");
        // Personaje que puede liderar: a qué escuadra de la lista se une
        const squads = ds.leads ? list.units.map((x, j) => ({ x, j })).filter(({ x }) => ds.leads!.includes(x.datasheet)) : [];
        const leads = ds.leads ? `<div class="lead-pick">Lidera a <select data-leads="${f}|${i}"><option value="">— nadie —</option>`
          + squads.map(({ x, j }) => `<option value="${j}"${u.leads === j ? " selected" : ""}>${j + 1}. ${DATASHEETS[x.datasheet].name} (${x.models})</option>`).join("")
          + `</select></div>` : "";
        return `<tr><td><span class="dim">${i + 1}.</span> ${ds.name}${ds.character ? ' <span class="dim">(personaje)</span>' : ""}${leads}</td>`
          + `<td>${ds.sizes.length > 1 ? `<select data-size="${f}|${i}">${sizes}</select>` : u.models}</td>`
          + `<td class="pts">${unitPoints(ds, u.models) ?? "—"}</td>`
          + `<td><button data-side="${f}" data-act="remove" data-i="${i}" title="Quitar">×</button></td></tr>`;
      }).join("");
      const options = Object.values(DATASHEETS).filter((d) => d.faction === f)
        .map((d) => `<option value="${d.id}">${d.name} — ${d.sizes.map((s) => `${s.models}: ${s.points}`).join(" / ")} pts</option>`).join("");
      const loads = saved[f].map((l) => `<option value="${l.name}">${l.name} (${listPoints(l)} pts)</option>`).join("");
      return `<div class="army-col">
        <div class="title" style="color:${F.color};font-size:17px">${F.name}</div>
        <input data-name="${f}" value="${(list.name ?? "").replace(/"/g, "&quot;")}" placeholder="Nombre de la lista" maxlength="40">
        <table class="army-table"><tr><th>Unidad</th><th>Mini.</th><th>Pts</th><th></th></tr>${rows || `<tr><td colspan="4" class="dim">Sin unidades</td></tr>`}</table>
        <div class="row"><select id="add-${f}">${options}</select><button data-side="${f}" data-act="add">Añadir</button></div>
        <div class="army-total ${pts > POINTS_LIMIT ? "bad" : ""}"><b>${pts}</b> / ${POINTS_LIMIT} puntos</div>
        ${errs.length ? `<ul class="army-errs">${errs.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<div class="ok">Lista válida</div>`}
        <div class="row army-saved">
          <select id="load-${f}"><option value="">Cargar lista guardada…</option>${loads}</select>
          <button data-side="${f}" data-act="save">Guardar</button>
          <button data-side="${f}" data-act="delete-saved" title="Borra la lista elegida en el desplegable">Borrar</button>
          <button data-side="${f}" data-act="clear" title="Vaciar">Vaciar</button>
        </div>
      </div>`;
    }).join("");
    $<HTMLButtonElement>("armies-deploy").disabled = !allOk;
  }
}
