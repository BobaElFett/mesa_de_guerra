import { SavedTable } from "./commands";

// Guardado automático en el navegador: la semilla y la lista de órdenes.

const KEY = "mesa-de-guerra.mesa";

export function readTable(): SavedTable | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SavedTable;
    if (d?.v !== 1 || typeof d.seed !== "number" || !Array.isArray(d.log)) return null;
    return d;
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
