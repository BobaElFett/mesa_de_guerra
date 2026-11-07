import { BASE_RADIUS, Piece, TerrainKind, TerrainPiece, TERRAIN } from "../core/state";

// Geometría de las reglas: coherencia, trabamiento, línea de visión y cobertura.
// Pura y en 2D (planta del tapete). Medidas en pulgadas, de borde de peana a borde de peana.

export const COHERENCY = 2;     // una miniatura debe estar a 2" de otra de su unidad
export const ENGAGEMENT = 1;    // trabada a 1" o menos de una enemiga

/** Qué hace cada tipo de escenografía con la visión. */
export const TERRAIN_RULES: Record<TerrainKind, { blocks: boolean; cover: boolean }> = {
  ruina: { blocks: true, cover: true },        // oculta: no se ve a través salvo estando dentro
  ruinaGrande: { blocks: true, cover: true },
  cajas: { blocks: true, cover: true },
  bunker: { blocks: true, cover: true },
  crater: { blocks: false, cover: true },      // baja: se ve por encima, pero da cobertura
  barricada: { blocks: false, cover: true },
};

export interface Disc { x: number; z: number; r: number }

export const disc = (p: Piece): Disc => ({ x: p.x, z: p.z, r: BASE_RADIUS[p.model] });

/** Distancia de borde a borde entre dos peanas (0 si se tocan o pisan). */
export function gap(a: Disc, b: Disc): number {
  return Math.max(0, Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r);
}

// --- Coherencia y trabamiento -------------------------------------------------

/**
 * Miniaturas fuera de coherencia: cada una necesita otra de su unidad a 2" o menos;
 * con 6 o más miniaturas en la unidad, dos.
 */
export function outOfCoherency(models: Piece[]): string[] {
  if (models.length < 2) return [];
  const need = models.length >= 6 ? 2 : 1;
  const ds = models.map(disc);
  return models.filter((_, i) => {
    let near = 0;
    for (let j = 0; j < ds.length; j++) if (j !== i && gap(ds[i], ds[j]) <= COHERENCY + 1e-6) near++;
    return near < need;
  }).map((m) => m.id);
}

/** ¿Hay alguna miniatura de `a` a 1" o menos de alguna de `b`? */
export function engaged(a: Piece[], b: Piece[]): boolean {
  return a.some((p) => b.some((q) => gap(disc(p), disc(q)) <= ENGAGEMENT + 1e-6));
}

// --- Escenografía en planta ------------------------------------------------------

/** Pasa un punto del tapete a las coordenadas locales de una pieza de escenografía. */
function toLocal(t: TerrainPiece, x: number, z: number): [number, number] {
  const dx = x - t.x, dz = z - t.z, c = Math.cos(t.rot), s = Math.sin(t.rot);
  // inversa del giro de Three.js en Y: x' = x·cos + z·sin, z' = −x·sin + z·cos
  return [dx * c - dz * s, dx * s + dz * c];
}

/** ¿Está el punto dentro de la huella de la pieza? (`pad` agranda la huella) */
export function insideTerrain(t: TerrainPiece, x: number, z: number, pad = 0): boolean {
  const [lx, lz] = toLocal(t, x, z), f = TERRAIN[t.kind];
  return Math.abs(lx) <= f.w / 2 + pad && Math.abs(lz) <= f.d / 2 + pad;
}

/** ¿Corta el segmento a→b la huella de la pieza? (método de las franjas en coordenadas locales) */
export function segmentHitsTerrain(t: TerrainPiece, ax: number, az: number, bx: number, bz: number): boolean {
  const [x0, z0] = toLocal(t, ax, az), [x1, z1] = toLocal(t, bx, bz);
  const f = TERRAIN[t.kind], hw = f.w / 2, hd = f.d / 2;
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dz = z1 - z0;
  for (const [p, d, lo, hi] of [[x0, dx, -hw, hw], [z0, dz, -hd, hd]] as const) {
    if (Math.abs(d) < 1e-12) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

// --- Visión ----------------------------------------------------------------------

/** Tres líneas entre dos peanas: centro a centro y los dos bordes laterales. */
function sightLines(a: Disc, b: Disc): [number, number, number, number][] {
  const dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1;
  const px = -dz / n, pz = dx / n;
  const k = 0.9;   // un poco hacia dentro del borde
  return [
    [a.x, a.z, b.x, b.z],
    [a.x + px * a.r * k, a.z + pz * a.r * k, b.x + px * b.r * k, b.z + pz * b.r * k],
    [a.x - px * a.r * k, a.z - pz * a.r * k, b.x - px * b.r * k, b.z - pz * b.r * k],
  ];
}

/** ¿Tapa esta pieza la línea? No si una de las dos miniaturas está dentro de ella. */
function blocksLine(t: TerrainPiece, a: Disc, b: Disc, l: [number, number, number, number]): boolean {
  if (!TERRAIN_RULES[t.kind].blocks) return false;
  if (insideTerrain(t, a.x, a.z) || insideTerrain(t, b.x, b.z)) return false;
  return segmentHitsTerrain(t, ...l);
}

export type Sight = "visible" | "cobertura" | "oculta";

/**
 * Visión de la miniatura `a` (tiradora) a la `b` (objetivo):
 *  - oculta: todas las líneas las tapa escenografía que oculta;
 *  - cobertura: se ve, pero `b` está dentro de escenografía o alguna línea la cruza;
 *  - visible: a la vista y sin cobertura.
 */
export function sight(a: Disc, b: Disc, terrain: TerrainPiece[]): Sight {
  const lines = sightLines(a, b);
  const clear = lines.filter((l) => !terrain.some((t) => blocksLine(t, a, b, l)));
  if (!clear.length) return "oculta";
  // Cobertura: dentro de escenografía, o cualquier línea de visión la atraviesa (tapada a medias)
  const inCover = terrain.some((t) => TERRAIN_RULES[t.kind].cover && (
    insideTerrain(t, b.x, b.z, b.r * 0.5) ||
    (!insideTerrain(t, a.x, a.z) && lines.some((l) => segmentHitsTerrain(t, ...l)))
  ));
  return inCover ? "cobertura" : "visible";
}

/**
 * Visión de una unidad a otra: la mejor que tenga cualquier miniatura tiradora
 * con cualquier miniatura objetivo. Devuelve también qué miniaturas objetivo se ven.
 */
export function unitSight(shooters: Piece[], targets: Piece[], terrain: TerrainPiece[]): { best: Sight; visible: string[] } {
  const rank: Record<Sight, number> = { oculta: 0, cobertura: 1, visible: 2 };
  let best: Sight = "oculta";
  const visible = new Set<string>();
  for (const a of shooters) for (const b of targets) {
    const s = sight(disc(a), disc(b), terrain);
    if (s !== "oculta") visible.add(b.id);
    if (rank[s] > rank[best]) best = s;
  }
  return { best, visible: [...visible] };
}
