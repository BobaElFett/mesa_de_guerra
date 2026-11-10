import { BOARD, exampleMap, TERRAIN, TerrainKind, TerrainPiece } from "../core/state";
import { MISSIONS } from "./missions";
import { DEPLOY_DEPTH } from "../core/state";
import { TERRAIN_RULES } from "./geometry";

// Mapas (#51): el de ejemplo o uno aleatorio simétrico respecto al centro (lo que hay en una
// mitad se repite girado en la otra), sin tapar objetivos de ninguna misión ni meter
// escenografía sólida en las zonas de despliegue.

export type MapId = "actual" | "ejemplo" | "aleatorio" | "urbano" | "llanura" | "bosque";

export const MAP_NAME: Record<MapId, string> = {
  actual: "La mesa actual", ejemplo: "Mapa de ejemplo", aleatorio: "Aleatorio (simétrico)",
  urbano: "Ruinas urbanas (densa)", llanura: "Llanura (abierta)", bosque: "Bosque",
};

/** Tipos de mapa (#85): qué piezas, cuántas por mitad y si hay búnker en el centro. */
type MapStyle = "aleatorio" | "urbano" | "llanura" | "bosque";
const STYLES: Record<MapStyle, { pool: TerrainKind[]; min: number; extra: number; center: number }> = {
  aleatorio: { pool: ["ruinaGrande", "ruina", "ruina", "cajas", "crater", "barricada", "barricada", "cajas", "bosque"], min: 5, extra: 2, center: 0.8 },
  urbano: { pool: ["ruinaGrande", "ruina", "ruina", "ruina", "barricada", "barricada", "crater"], min: 6, extra: 2, center: 1 },
  llanura: { pool: ["crater", "crater", "barricada", "cajas"], min: 2, extra: 2, center: 0.4 },
  bosque: { pool: ["bosque", "bosque", "bosque", "bosque", "ruina", "crater"], min: 5, extra: 2, center: 0.5 },
};

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Radio de la huella (círculo que la contiene) para separar piezas. */
const reach = (k: TerrainKind) => Math.hypot(TERRAIN[k].w, TERRAIN[k].d) / 2;

export function randomMap(seed: number, style: MapStyle = "aleatorio"): TerrainPiece[] {
  const S = STYLES[style];
  const rnd = mulberry(seed);
  const objectives = Object.values(MISSIONS).flatMap((m) => m.objectives.flatMap((o) => [{ x: o.x, z: o.z }, { x: -o.x, z: -o.z }]));
  const out: TerrainPiece[] = [];
  const add = (kind: TerrainKind, x: number, z: number, rot: number) => out.push({ id: `T${out.length + 1}`, kind, x, z, rot });
  // El centro: búnker (casi siempre: es el «Corazón» de una misión) o nada
  const center = rnd() < S.center;
  if (center) add("bunker", 0, 0, rnd() < 0.5 ? 0 : Math.PI / 2);
  const pool = S.pool;
  const want = S.min + Math.floor(rnd() * S.extra);    // por mitad (se repite girado en la otra)
  const hw = BOARD.w / 2, hd = BOARD.d / 2;
  for (let tries = 0, placed = 0; placed < want && tries < 800; tries++) {
    const kind = pool[Math.floor(rnd() * pool.length)];
    const f = TERRAIN[kind], r = reach(kind);
    const x = (rnd() * 2 - 1) * (hw - f.w / 2 - 1);
    const z = -(1.5 + rnd() * (hd - f.d / 2 - 2.5));    // la mitad del Enjambre (z < 0)
    const rot = Math.floor(rnd() * 8) * (Math.PI / 4);
    // Sólida: fuera de las zonas de despliegue
    if (TERRAIN_RULES[kind].solid && Math.abs(z) + r > hd - DEPLOY_DEPTH - 0.5) continue;
    // Ni encima de un objetivo (deja 2" libres alrededor del marcador)
    if (objectives.some((o) => Math.hypot(o.x - x, o.z - z) < r + 2.2)) continue;
    // Ni pegada a otra pieza (ni a su simétrica)
    const others = out.flatMap((t) => [t, { ...t, x: -t.x, z: -t.z }]);
    if (others.some((t) => Math.hypot(t.x - x, t.z - z) < r + reach(t.kind) + (style === "urbano" ? 1.2 : 1.5))) continue;
    if (Math.hypot(x, z) < r + reach("bunker") + 1.5 && center) continue;
    add(kind, x, z, rot);
    add(kind, -x, -z, rot + Math.PI);
    placed++;
  }
  return out;
}

export function mapFor(id: MapId, seed: number, current: TerrainPiece[]): TerrainPiece[] {
  if (id === "ejemplo") return exampleMap();
  if (id === "aleatorio" || id === "urbano" || id === "llanura" || id === "bosque") return randomMap(seed, id);
  return current;
}
