import { SavedTable } from "./commands";

// Guardado en el navegador.
//  - La mesa actual se guarda sola tras cada orden (semilla + lista de órdenes).
//  - La biblioteca guarda mesas con nombre para volver a ellas.
//  - Exportar/importar: un archivo .json con lo mismo, para pasarlo a otro ordenador.

const KEY = "mesa-de-guerra.mesa";
const NAME_KEY = "mesa-de-guerra.nombre";
const LIB_KEY = "mesa-de-guerra.biblioteca";
export const FILE_FORMAT = "mesa-de-guerra";

export interface TableMeta { round: number; active: 0 | 1; commands: number }

export interface LibraryEntry extends TableMeta {
  id: string;
  name: string;
  savedAt: number;    // ms desde 1970
  table: SavedTable;
}

/** Contenido de un archivo exportado. */
export interface TableFile {
  format: typeof FILE_FORMAT;
  version: 1;
  name: string;
  savedAt: string;    // ISO 8601
  table: SavedTable;
}

// --- Mesa actual -------------------------------------------------------------
export function readTable(): SavedTable | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? validTable(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeTable(t: SavedTable) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* sin almacenamiento: se juega igual */ }
}

export function clearTable() {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
}

export function readName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; }
}

export function writeName(name: string) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* nada */ }
}

// --- Biblioteca ---------------------------------------------------------------
export function readLibrary(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    const list = raw ? (JSON.parse(raw) as LibraryEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.name === "string" && validTable(e.table)) : [];
  } catch {
    return [];
  }
}

function writeLibrary(list: LibraryEntry[]): boolean {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** Guarda con ese nombre (si ya existe uno igual, lo sustituye). Devuelve false si no hay sitio. */
export function saveToLibrary(name: string, table: SavedTable, meta: TableMeta): LibraryEntry | null {
  const list = readLibrary();
  const clean = name.trim().slice(0, 60) || "Sin nombre";
  const old = list.find((e) => e.name.toLowerCase() === clean.toLowerCase());
  const entry: LibraryEntry = { id: old?.id ?? newId(), name: clean, savedAt: Date.now(), table, ...meta };
  const next = [entry, ...list.filter((e) => e !== old)];
  return writeLibrary(next) ? entry : null;
}

export function removeFromLibrary(id: string) {
  writeLibrary(readLibrary().filter((e) => e.id !== id));
}

function newId(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

// --- Archivos ----------------------------------------------------------------
export function toFile(name: string, table: SavedTable): TableFile {
  return { format: FILE_FORMAT, version: 1, name, savedAt: new Date().toISOString(), table };
}

/** Lee un archivo exportado. Lanza un Error con el motivo si no sirve. */
export function parseFile(text: string): { name: string; table: SavedTable } {
  let d: unknown;
  try { d = JSON.parse(text); } catch { throw new Error("El archivo no es JSON válido."); }
  const f = d as Partial<TableFile>;
  if (!f || typeof f !== "object") throw new Error("El archivo está vacío.");
  if (f.format !== FILE_FORMAT) throw new Error("No es un archivo de Mesa de Guerra.");
  if (f.version !== 1) throw new Error(`Versión de archivo no soportada (${String(f.version)}).`);
  const table = validTable(f.table);
  if (!table) throw new Error("La mesa del archivo está dañada.");
  return { name: typeof f.name === "string" && f.name.trim() ? f.name.trim().slice(0, 60) : "Importada", table };
}

/** Nombre de archivo seguro: «Mi partida» → mi-partida.mesa.json */
export function fileName(name: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mesa";
  return `${base}.mesa.json`;
}

/** Comprueba la forma de una mesa guardada; devuelve null si no es válida. */
export function validTable(t: unknown): SavedTable | null {
  const d = t as SavedTable;
  if (!d || d.v !== 1 || typeof d.seed !== "number" || !Number.isFinite(d.seed)) return null;
  if (!Array.isArray(d.log) || !d.log.every((c) => c && typeof c === "object" && typeof (c as { type: unknown }).type === "string")) return null;
  if (!Number.isInteger(d.cursor) || d.cursor < 0 || d.cursor > d.log.length) return null;
  return d;
}
