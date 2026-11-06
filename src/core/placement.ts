import { BASE_RADIUS, BOARD, Piece } from "./state";
import { PieceMove } from "./commands";

// Colocación sin solapes: al soltar o girar un grupo, cada peana movida va al hueco libre
// más cercano a donde se soltó. Las quietas no se mueven nunca. Determinista: mismo
// resultado en cualquier navegador.

const GAP = 0.03;        // holgura entre peanas, en pulgadas
const STEP = 0.1;        // paso de la búsqueda en espiral
const MAX_SEARCH = 12;   // radio máximo de búsqueda (pulgadas)

interface Disc { x: number; z: number; r: number }

export function resolveOverlaps(all: Piece[], moves: PieceMove[]): PieceMove[] {
  const movedIds = new Set(moves.map((m) => m.id));
  const radius = new Map(all.map((p) => [p.id, BASE_RADIUS[p.model]]));
  const placed: Disc[] = all.filter((p) => !movedIds.has(p.id)).map((p) => ({ x: p.x, z: p.z, r: radius.get(p.id)! }));
  const hw = BOARD.w / 2, hd = BOARD.d / 2;

  // Primero las que caen más cerca del centro del grupo: el grupo se abre desde dentro
  const cx = moves.reduce((a, m) => a + m.x, 0) / Math.max(1, moves.length);
  const cz = moves.reduce((a, m) => a + m.z, 0) / Math.max(1, moves.length);
  const order = moves.map((m, i) => ({ m, i, d: Math.hypot(m.x - cx, m.z - cz) }))
    .sort((a, b) => a.d - b.d || (a.m.id < b.m.id ? -1 : 1));

  const out: PieceMove[] = moves.map((m) => ({ ...m }));
  for (const { i } of order) {
    const m = out[i];
    const r = radius.get(m.id) ?? 0.5;
    const inside = (x: number, z: number) => x >= -hw + r && x <= hw - r && z >= -hd + r && z <= hd - r;
    const free = (x: number, z: number) => inside(x, z) && placed.every((q) => Math.hypot(x - q.x, z - q.z) >= r + q.r + GAP);
    let x = clamp(m.x, -hw + r, hw - r), z = clamp(m.z, -hd + r, hd - r);
    if (!free(x, z)) {
      const best = search(x, z, free);
      if (best) { x = best[0]; z = best[1]; }
    }
    m.x = round2(x); m.z = round2(z);
    placed.push({ x: m.x, z: m.z, r });
  }
  return out;
}

/** Punto libre más cercano a (x, z), en anillos de radio creciente. */
function search(x: number, z: number, free: (x: number, z: number) => boolean): [number, number] | null {
  for (let ring = 1; ring * STEP <= MAX_SEARCH; ring++) {
    const rad = ring * STEP;
    const n = Math.max(8, Math.ceil((2 * Math.PI * rad) / STEP));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      if (free(px, pz)) return [px, pz];
    }
  }
  return null;
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
function round2(v: number) { return Math.round(v * 100) / 100; }
