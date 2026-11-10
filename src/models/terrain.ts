import * as THREE from "three";
import { box, place, build, Part } from "./lowpoly";
import { TerrainKind } from "../core/state";

// Escenografía low poly de un mundo en guerra: ruinas de una ciudad colmena, contenedores,
// cráteres de bombardeo, un búnker y barricadas. Centradas en el origen, con la huella de
// TERRAIN (core/state.ts). Medidas en pulgadas.

const STONE = "#8b877e", STONE_D = "#6c6961", STONE_L = "#a29d92", RUBBLE = "#77736a";
const RUST = "#9a5a2e", OLIVE = "#69744b", METAL = "#555a60", DIRT = "#4c4537", DIRT_L = "#615848";
const CONCRETE = "#7d7e76", DARK = "#24262a", HAZARD = "#d7a531";

/** Pseudoaleatorio fijo, para que cada ruina salga siempre igual. */
function rnd(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Muro roto: tramos de alturas distintas a lo largo de x, con huecos de ventana. */
function wall(len: number, maxH: number, thick: number, x: number, z: number, ry: number, seed: number): Part[] {
  const r = rnd(seed), parts: Part[] = [];
  const seg = 0.75, n = Math.round(len / seg);
  const c = Math.cos(ry), s = Math.sin(ry);
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + seg * (i + 0.5);
    const px = x + t * c, pz = z - t * s;
    // Perfil roto: más alto en un extremo y mellado
    const shape = 0.35 + 0.65 * Math.sin(((i + 0.5) / n) * Math.PI * 0.9 + 0.2);
    const h = Math.max(0.5, maxH * shape * (0.7 + r() * 0.3));
    const window = h > 2.2 && i % 3 === 1;
    if (window) {
      parts.push(box(seg, 1.0, thick, STONE, px, 0, pz, 0, ry));
      parts.push(box(seg, h - 2.0, thick, STONE, px, 2.0, pz, 0, ry));
    } else {
      parts.push(box(seg, h, thick, i % 2 ? STONE : STONE_D, px, 0, pz, 0, ry));
    }
    // Remate superior para que no parezca un peine perfecto
    if (r() > 0.55) parts.push(box(seg * 0.6, 0.25, thick * 1.2, STONE_L, px, h - 0.05, pz, 0, ry + (r() - 0.5) * 0.3, (r() - 0.5) * 0.4));
  }
  // Pilar en el extremo
  parts.push(box(thick * 1.6, maxH * 0.95, thick * 1.6, STONE_L, x + (len / 2) * c, 0, z - (len / 2) * s, 0, ry));
  return parts;
}

function rubble(n: number, w: number, d: number, seed: number, color = RUBBLE): Part[] {
  const r = rnd(seed), parts: Part[] = [];
  for (let i = 0; i < n; i++) {
    const sz = 0.2 + r() * 0.45;
    parts.push(place(new THREE.DodecahedronGeometry(sz, 0), i % 3 ? color : STONE_D,
      (r() - 0.5) * w, sz * 0.5, (r() - 0.5) * d, r() * 3, r() * 3, r() * 3));
  }
  return parts;
}

function ruina(): Part[] {
  return [
    box(5.6, 0.15, 3.6, STONE_D, 0.1, 0, 0.1),                       // suelo de baldosas
    ...wall(6, 4.2, 0.45, 0, -1.8, 0, 11),                           // muro largo
    ...wall(4, 3.2, 0.45, -2.8, 0, Math.PI / 2, 23),                 // muro corto en L
    ...rubble(10, 4.5, 2.5, 7),
  ];
}

function ruinaGrande(): Part[] {
  const p: Part[] = [
    box(7.6, 0.15, 5.6, STONE_D, 0, 0, 0),
    ...wall(8, 6.2, 0.5, 0, -2.75, 0, 31),
    ...wall(6, 5.4, 0.5, -3.75, 0, Math.PI / 2, 37),
    ...wall(4, 3.0, 0.5, 3.75, -1, Math.PI / 2, 41),
    ...wall(3.5, 2.2, 0.5, -1.8, 2.75, 0, 43),
  ];
  // Primer piso a medias, con viga rota
  p.push(box(4.6, 0.25, 3.2, STONE, -1.5, 3.0, -1.1));
  p.push(box(0.35, 0.35, 3.6, METAL, 1.2, 3.0, -1.0, 0, 0, -0.25));
  for (const [x, z] of [[-3.5, 1.2], [0.6, 0.3]]) p.push(box(0.5, 3.0, 0.5, STONE_L, x, 0, z));
  p.push(...rubble(14, 6, 4, 13));
  return p;
}

function cajas(): Part[] {
  const p: Part[] = [];
  // Dos contenedores con nervios, uno encima girado
  const container = (x: number, y: number, z: number, ry: number, color: string) => {
    p.push(box(3.0, 1.3, 1.3, color, x, y, z, 0, ry));
    for (let i = -1; i <= 1; i++) {
      const c = Math.cos(ry), s = Math.sin(ry);
      p.push(box(0.08, 1.32, 1.34, METAL, x + i * 1.0 * c, y, z - i * 1.0 * s, 0, ry));
    }
  };
  container(-0.3, 0, 0.6, 0, RUST);
  container(0.1, 0, -0.75, 0.08, OLIVE);
  container(-0.1, 1.3, -0.1, -0.12, OLIVE);
  // Cajas sueltas
  p.push(box(0.8, 0.8, 0.8, "#8a6a42", 1.6, 0, 1.0, 0, 0.4));
  p.push(box(0.6, 0.6, 0.6, "#8a6a42", 1.65, 0.8, 1.05, 0, 0.9));
  return p;
}

function crater(): Part[] {
  const p: Part[] = [];
  p.push(place(new THREE.CylinderGeometry(2.1, 2.3, 0.06, 12), DIRT, 0, 0.03, 0));
  p.push(place(new THREE.CylinderGeometry(1.2, 1.5, 0.08, 10), "#3b3529", 0, 0.05, 0));
  // Borde levantado: losas de tierra inclinadas hacia fuera
  const r = rnd(5);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r() * 0.2;
    const rad = 2.15 + r() * 0.2;
    p.push(box(1.1 + r() * 0.4, 0.35 + r() * 0.3, 0.6, i % 2 ? DIRT_L : DIRT,
      Math.cos(a) * rad, 0, Math.sin(a) * rad, 0.35, -a + Math.PI / 2, 0));
  }
  p.push(...rubble(6, 3, 3, 3, DIRT_L));
  return p;
}

function bunker(): Part[] {
  const p: Part[] = [];
  p.push(box(6, 0.3, 4, CONCRETE, 0, 0, 0));                       // zócalo
  p.push(box(5.2, 1.9, 3.2, CONCRETE, 0, 0.3, 0));                 // cuerpo
  p.push(box(5.6, 0.35, 3.6, "#6f7069", 0, 2.2, 0));               // losa del techo
  p.push(box(4.4, 0.25, 2.6, CONCRETE, 0, 2.55, 0));
  // Troneras (franjas oscuras) en los lados largos y puerta en un lado corto
  p.push(box(3.6, 0.3, 0.06, DARK, 0, 1.5, 1.62), box(3.6, 0.3, 0.06, DARK, 0, 1.5, -1.62));
  p.push(box(0.06, 1.4, 1.0, DARK, 2.62, 0.3, 0));
  // Bandas de peligro en las esquinas
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box(0.3, 1.9, 0.3, HAZARD, sx * 2.5, 0.3, sz * 1.5));
  // Antena
  p.push(box(0.08, 1.6, 0.08, METAL, -1.8, 2.8, -1.0));
  return p;
}

function barricada(): Part[] {
  const p: Part[] = [];
  p.push(box(3.6, 0.9, 0.5, CONCRETE, 0, 0, 0));
  for (let i = -1; i <= 1; i++) p.push(box(0.5, 0.92, 0.52, i === 0 ? HAZARD : DARK, i * 1.3, 0, 0));
  p.push(box(0.25, 1.4, 0.25, METAL, -1.9, 0, 0), box(0.25, 1.4, 0.25, METAL, 1.9, 0, 0));
  p.push(...rubble(3, 3.5, 0.9, 19));
  return p;
}

/** Bosque (#84): suelo de hojarasca y una docena de árboles low poly (copas en capas). */
function bosque(): Part[] {
  const p: Part[] = [];
  const r = rnd(11);
  p.push(place(new THREE.CylinderGeometry(1, 1, 0.05, 14).scale(3.5, 1, 2.5), "#3d4a2a", 0, 0.025, 0));
  for (let i = 0; i < 18; i++) p.push(box(0.3 + r() * 0.4, 0.06, 0.3 + r() * 0.4, i % 2 ? "#4f5a30" : "#5c4a2c", (r() - 0.5) * 6.2, 0.04, (r() - 0.5) * 4.2, 0, r() * 3, 0));
  const spots: [number, number][] = [];
  for (let tries = 0; spots.length < 11 && tries < 200; tries++) {
    const x = (r() - 0.5) * 6, z = (r() - 0.5) * 4;
    if ((x / 3.2) ** 2 + (z / 2.2) ** 2 > 1) continue;
    if (spots.some(([a, b]) => Math.hypot(a - x, b - z) < 1.2)) continue;
    spots.push([x, z]);
  }
  for (const [x, z] of spots) {
    const h = 2.4 + r() * 1.6, s = 0.8 + r() * 0.4;
    const green = ["#2f5a2c", "#3a6b33", "#2a4d29"][Math.floor(r() * 3)];
    p.push(place(new THREE.CylinderGeometry(0.1, 0.14, h * 0.45, 6), "#5a4029", x, h * 0.225, z));
    for (let k = 0; k < 3; k++) {
      const cr = (0.9 - k * 0.22) * s, ch = 0.9 * s;
      p.push(place(new THREE.ConeGeometry(cr, ch, 7), k === 1 ? green : "#336130", x, h * 0.4 + k * ch * 0.55 + ch / 2, z, 0, r() * 3, 0));
    }
  }
  return p;
}

const BUILDERS: Record<TerrainKind, () => Part[]> = { ruina, ruinaGrande, cajas, crater, bunker, barricada, bosque };

export function makeTerrain(kind: TerrainKind): THREE.Group {
  return build(BUILDERS[kind]());
}
