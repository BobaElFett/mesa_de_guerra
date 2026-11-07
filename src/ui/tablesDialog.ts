import { CommandBus } from "../core/commands";
import {
  readLibrary, saveToLibrary, removeFromLibrary, toFile, parseFile, fileName,
  readName, writeName, LibraryEntry,
} from "../core/save";
import { FACTIONS, PLAYERS } from "../core/state";
import { modal } from "./modal";

// Diálogo «Mesas»: guardar la mesa actual con nombre, cargar o borrar las guardadas,
// y exportar/importar archivos .json. Ctrl+S guarda deprisa con el nombre actual.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class TablesDialog {
  name = readName();
  onLoaded: () => void = () => {};
  private confirm: { id: string; action: "load" | "delete"; t: number } | null = null;

  constructor(private bus: CommandBus) {
    $("tables-open").addEventListener("click", () => this.show());
    $("tables-close").addEventListener("click", () => this.hide());
    $("tables-backdrop").addEventListener("pointerdown", (e) => { if (e.target === $("tables-backdrop")) this.hide(); });
    $("table-save").addEventListener("click", () => this.save($<HTMLInputElement>("table-name").value));
    $<HTMLInputElement>("table-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.save((e.target as HTMLInputElement).value);
      if (e.key === "Escape") this.hide();
      e.stopPropagation();
    });
    $("table-export").addEventListener("click", () => this.download(this.name || "Mesa sin nombre", this.bus.serialize()));
    $("table-import-btn").addEventListener("click", () => $<HTMLInputElement>("table-import").click());
    $<HTMLInputElement>("table-import").addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (file) file.text().then((t) => this.importText(t)).catch(() => this.msg("No se pudo leer el archivo.", true));
    });
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        if (this.name && !modal.open) this.save(this.name, true);
        else this.show();
      } else if (e.code === "Escape" && modal.open) {
        this.hide();
      }
    });
    this.renderTitle();
  }

  get isOpen() { return modal.open; }

  show() {
    modal.open = true;
    $("tables-backdrop").hidden = false;
    const input = $<HTMLInputElement>("table-name");
    input.value = this.name;
    this.msg("");
    this.renderList();
    setTimeout(() => input.focus(), 0);
  }

  hide() {
    modal.open = false;
    $("tables-backdrop").hidden = true;
    this.confirm = null;
  }

  /** Guarda la mesa actual con ese nombre. `quick`: desde Ctrl+S, avisa con un mensaje breve. */
  save(name: string, quick = false) {
    const s = this.bus.state;
    const entry = saveToLibrary(name, this.bus.serialize(), { round: s.turn, active: s.active, commands: this.bus.length });
    if (!entry) { this.msg("No queda sitio en el navegador para guardar.", true); return; }
    this.setName(entry.name);
    if (quick) toast(`Guardada «${entry.name}»`);
    else { this.msg(`Guardada «${entry.name}».`); this.renderList(); }
  }

  /** Importa el texto de un archivo .json: lo añade a la biblioteca y lo carga. */
  importText(text: string): boolean {
    try {
      const { name, table } = parseFile(text);
      const taken = new Set(readLibrary().map((e) => e.name.toLowerCase()));
      let n = name, k = 2;
      while (taken.has(n.toLowerCase())) n = `${name} (${k++})`;
      this.bus.load(table);
      const s = this.bus.state;
      saveToLibrary(n, table, { round: s.turn, active: s.active, commands: this.bus.length });
      this.setName(n);
      this.onLoaded();
      this.msg(`Importada y cargada «${n}».`);
      this.renderList();
      return true;
    } catch (err) {
      this.msg(err instanceof Error ? err.message : "No se pudo importar.", true);
      return false;
    }
  }

  setName(n: string) {
    this.name = n;
    writeName(n);
    $<HTMLInputElement>("table-name").value = n;
    this.renderTitle();
  }

  // --- Interno -----------------------------------------------------------
  private load(e: LibraryEntry) {
    this.bus.load(e.table);
    this.setName(e.name);
    this.onLoaded();
    this.hide();
    toast(`Cargada «${e.name}»`);
  }

  private download(name: string, table: ReturnType<CommandBus["serialize"]>) {
    const blob = new Blob([JSON.stringify(toFile(name, table), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.msg(`Exportada como ${a.download}.`);
  }

  /** Cargar y borrar piden un segundo clic en 3 segundos. */
  private confirmed(id: string, action: "load" | "delete"): boolean {
    const now = performance.now();
    const c = this.confirm;
    if (c && c.id === id && c.action === action && now - c.t < 3000) { this.confirm = null; return true; }
    this.confirm = { id, action, t: now };
    return false;
  }

  private renderList() {
    const list = readLibrary();
    const ul = $("tables-list");
    ul.innerHTML = "";
    if (!list.length) {
      ul.innerHTML = `<li class="dim">Todavía no hay mesas guardadas.</li>`;
      return;
    }
    for (const e of list) {
      const li = document.createElement("li");
      const f = FACTIONS[PLAYERS[e.active]];
      const when = new Date(e.savedAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      li.innerHTML = `<div class="t-name"></div>
        <div class="dim t-meta">Ronda ${e.round} · turno ${f.of} · ${e.commands} órdenes · ${when}</div>
        <div class="t-actions"></div>`;
      li.querySelector(".t-name")!.textContent = e.name + (e.name === this.name ? "  (actual)" : "");
      const actions = li.querySelector(".t-actions")!;
      const btn = (label: string, fn: (b: HTMLButtonElement) => void) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.addEventListener("click", () => fn(b));
        actions.appendChild(b);
      };
      btn("Cargar", (b) => {
        if (this.confirmed(e.id, "load")) this.load(e);
        else { b.textContent = "¿Seguro? La mesa actual se sustituye"; this.resetLater(b, "Cargar"); }
      });
      btn("Exportar", () => this.download(e.name, e.table));
      btn("Borrar", (b) => {
        if (this.confirmed(e.id, "delete")) { removeFromLibrary(e.id); this.msg(`Borrada «${e.name}».`); this.renderList(); }
        else { b.textContent = "¿Seguro?"; this.resetLater(b, "Borrar"); }
      });
      ul.appendChild(li);
    }
  }

  private resetLater(b: HTMLButtonElement, label: string) {
    setTimeout(() => { if (b.isConnected) b.textContent = label; }, 3000);
  }

  private msg(text: string, error = false) {
    const el = $("tables-msg");
    el.textContent = text;
    el.classList.toggle("error", error);
  }

  private renderTitle() {
    $("table-title").textContent = this.name || "Mesa sin nombre";
  }
}

let toastTimer = 0;
export function toast(text: string) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 2200);
}
