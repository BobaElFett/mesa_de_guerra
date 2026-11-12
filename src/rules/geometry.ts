import { BASE_RADIUS, Piece, TerrainKind, TerrainPiece, TERRAIN } from "../core/state";

// Geometría de las reglas: coherencia, trabamiento, línea de visión y cobertura.
// Pura y en 2D (planta del tapete). Medidas en pulgadas, de borde de peana a borde de peana.

export const COHERENCY = 2;     // una miniatura debe estar a 2" de otra de su unidad
export const ENGAGEMENT = 1;    // trabada a 1" o menos de una enemiga

/** Qué hace cada tipo de escenografía con la visión. */
// blocks: oculta (no se ve a través); cover: da cobertura; solid: no se puede atravesar ni ocupar
// (#49); noEnd: se puede cruzar pero no acabar encima (una barricada).
export const TERRAIN_RULES: Record<TerrainKind, { blocks: boolean; cover: boolean; solid: boolean; noEnd: boolean }> = {
  ruina: { blocks: true, cover: true, solid: true, noEnd: true },          // oculta; sólidos solo los muros: se entra por los huecos
  ruinaGrande: { blocks: true, cover: true, solid: true, noEnd: true },
  cajas: { blocks: true, cover: true, solid: true, noEnd: true },
  bunker: { blocks: true, cover: true, solid: true, noEnd: true },
  crater: { blocks: false, cover: true, solid: false, noEnd: false },      // baja: se ve por encima, pero da cobertura
  barricada: { blocks: false, cover: true, solid: false, noEnd: true },
  // Bosque (#84): se atraviesa y se puede acabar dentro; da cobertura dentro o detrás, y tapa la
  // visión si la línea cruza más de FOREST_DEPTH" de bosque (y ninguna de las dos está dentro)
  bosque: { blocks: true, cover: true, solid: false, noEnd: false },
  // Colina (#125): no tapa ni cubre; desde arriba se dispara mejor
  colina: { blocks: false, cover: false, solid: false, noEnd: false },
};
export const FOREST_DEPTH = 3;

/** ¿Pisa la peana (x, z, r) una parte sólida de la escenografía (muro, contenedor, búnker, barricada)? */
export function onForbiddenTerrain(terrain: TerrainPiece[], x: number, z: number, r: number): TerrainPiece | null {
  for (const t of terrain) {
    if (!TERRAIN_RULES[t.kind].noEnd || !insideTerrain(t, x, z, r + 0.5)) continue;
    if (TERRAIN_SOLIDS[t.kind].some((rect) => discHitsRect(t, rect, x, z, r * 0.92))) return t;
  }
  return null;
}

/** ¿Atraviesa el camino recto de a a b (con una peana de radio r) escenografía sólida? */
export function crossesSolid(terrain: TerrainPiece[], ax: number, az: number, bx: number, bz: number, r: number): TerrainPiece | null {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.05) return null;
  const nx = -(bz - az) / len, nz = (bx - ax) / len, o = r * 0.6;
  for (const t of terrain) {
    if (!TERRAIN_RULES[t.kind].solid) continue;
    for (const rect of TERRAIN_SOLIDS[t.kind]) {
      if (discHitsRect(t, rect, ax, az, r * 0.5)) continue;    // ya estaba metida: que pueda salir
      for (const k of [-o, 0, o]) if (segmentHitsRect(t, rect, ax + nx * k, az + nz * k, bx + nx * k, bz + nz * k)) return t;
    }
  }
  return null;
}

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

/** Altura de la meseta de la colina (#125), en pulgadas. */
export const HILL_HEIGHT = 0.45;

/** ¿Está el punto sobre una colina? (elipse inscrita en la huella) */
export function onHill(terrain: TerrainPiece[], x: number, z: number): boolean {
  return terrain.some((t) => {
    if (t.kind !== "colina") return false;
    const [lx, lz] = toLocal(t, x, z), f = TERRAIN[t.kind];
    return (lx / (f.w / 2)) ** 2 + (lz / (f.d / 2)) ** 2 <= 1;
  });
}

/** ¿Corta el segmento a→b la huella de la pieza? (método de las franjas en coordenadas locales) */
export function segmentHitsTerrain(t: TerrainPiece, ax: number, az: number, bx: number, bz: number): boolean {
  const f = TERRAIN[t.kind];
  return segmentHitsRect(t, { x: 0, z: 0, w: f.w, d: f.d }, ax, az, bx, bz);
}

// --- Partes sólidas (hitboxes) ----------------------------------------------------
// Las partes de cada pieza que no se pueden atravesar ni ocupar, medidas sobre su modelo
// (models/terrain.ts), en coordenadas de la pieza: los muros de las ruinas (se puede entrar
// por los huecos), los contenedores y las cajas sueltas, el cuerpo del búnker y la barricada.
// El cráter no tiene: se entra y da cobertura.

export interface LocalRect { x: number; z: number; w: number; d: number }

export const TERRAIN_SOLIDS: Record<TerrainKind, LocalRect[]> = {
  ruina: [
    { x: 0, z: -1.8, w: 6.3, d: 0.5 },           // muro largo (con su pilar)
    { x: -2.8, z: 0, w: 0.5, d: 4.3 },           // muro corto en L
  ],
  ruinaGrande: [
    { x: 0, z: -2.75, w: 8.3, d: 0.55 },
    { x: -3.75, z: 0, w: 0.55, d: 6.3 },
    { x: 3.75, z: -1, w: 0.55, d: 4.3 },
    { x: -1.8, z: 2.75, w: 3.8, d: 0.55 },
    { x: -3.5, z: 1.2, w: 0.5, d: 0.5 },           // pilares
    { x: 0.6, z: 0.3, w: 0.5, d: 0.5 },
  ],
  cajas: [
    { x: -0.3, z: 0.6, w: 3.0, d: 1.35 },          // contenedor de abajo
    { x: 0.1, z: -0.75, w: 3.1, d: 1.45 },         // el otro (algo girado)
    { x: 1.6, z: 1.0, w: 1.05, d: 1.05 },          // cajas sueltas
  ],
  crater: [],
  bosque: [],
  colina: [],
  bunker: [{ x: 0, z: 0, w: 5.6, d: 3.6 }],        // cuerpo y losa del techo
  barricada: [{ x: 0, z: 0, w: 4.05, d: 0.55 }],
};

/** ¿Corta el segmento a→b el rectángulo `r` de la pieza? */
export function segmentHitsRect(t: TerrainPiece, r: LocalRect, ax: number, az: number, bx: number, bz: number): boolean {
  const [x0, z0] = toLocal(t, ax, az), [x1, z1] = toLocal(t, bx, bz);
  const hw = r.w / 2, hd = r.d / 2;
  return clipSegment(x0 - r.x, z0 - r.z, x1 - r.x, z1 - r.z, hw, hd);
}

/** ¿Se solapa la peana (x, z, rad) con el rectángulo `r` de la pieza? */
export function discHitsRect(t: TerrainPiece, r: LocalRect, x: number, z: number, rad: number): boolean {
  const [lx, lz] = toLocal(t, x, z);
  const dx = Math.max(0, Math.abs(lx - r.x) - r.w / 2), dz = Math.max(0, Math.abs(lz - r.z) - r.d / 2);
  return dx * dx + dz * dz < rad * rad;
}

/** Rectángulos sólidos de la pieza en coordenadas del mundo (centro, medidas y giro), para dibujarlos. */
export function worldSolids(t: TerrainPiece): { x: number; z: number; w: number; d: number; rot: number }[] {
  const c = Math.cos(t.rot), s = Math.sin(t.rot);
  // giro de Three.js en Y: x = lx·cos + lz·sin, z = −lx·sin + lz·cos
  return TERRAIN_SOLIDS[t.kind].map((r) => ({ x: t.x + r.x * c + r.z * s, z: t.z - r.x * s + r.z * c, w: r.w, d: r.d, rot: t.rot }));
}

function clipSegment(x0: number, z0: number, x1: number, z1: number, hw: number, hd: number): boolean {
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
  if (t.kind === "bosque") return lengthInside(t, ...l) > FOREST_DEPTH;
  return segmentHitsTerrain(t, ...l);
}

/** Cuánto del segmento a→b queda dentro de la huella de la pieza (recorte de Liang-Barsky). */
export function lengthInside(t: TerrainPiece, ax: number, az: number, bx: number, bz: number): number {
  const [x0, z0] = toLocal(t, ax, az), [x1, z1] = toLocal(t, bx, bz), f = TERRAIN[t.kind];
  const dx = x1 - x0, dz = z1 - z0;
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, x0 + f.w / 2], [dx, f.w / 2 - x0], [-dz, z0 + f.d / 2], [dz, f.d / 2 - z0]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return 0; continue; }
    const r = q / p;
    if (p < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r);
    if (lo > hi) return 0;
  }
  return (hi - lo) * Math.hypot(dx, dz);
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
