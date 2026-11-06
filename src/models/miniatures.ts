import * as THREE from "three";
import { box, place, build, Part } from "./lowpoly";
import { ModelKind, BASE_RADIUS } from "../core/state";

// Miniaturas provisionales de la fase 0 (las definitivas llegan en la fase 1, issue #11).
// Escala: 1 = 1 pulgada. Peanas de 32 mm (r 0,63") para la Legión y 25 mm (r 0,49") para las Garras.
// La miniatura mira hacia +z.

export { BASE_RADIUS };

const LEG = {
  armor: "#2f56a8", trim: "#d6a83c", dark: "#24272d", visor: "#8fe4ff", base: "#2b2d31", rim: "#3d6fd8",
};
const SW = {
  flesh: "#c99a7e", shell: "#5d2a73", claw: "#ece0c8", eye: "#ff6a3d", base: "#2b2d31", rim: "#a24fc4",
};

function peana(r: number, rim: string): Part[] {
  return [
    place(new THREE.CylinderGeometry(r * 0.94, r, 0.12, 14), LEG.base, 0, 0.06, 0),
    place(new THREE.CylinderGeometry(r * 1.0, r * 1.0, 0.03, 14), rim, 0, 0.015, 0),
  ];
}

function legionario(): Part[] {
  const p: Part[] = [...peana(BASE_RADIUS.legionario, LEG.rim)];
  const y0 = 0.12;
  // Piernas y botas
  p.push(box(0.2, 0.5, 0.24, LEG.armor, -0.14, y0, 0), box(0.2, 0.5, 0.24, LEG.armor, 0.14, y0, 0));
  p.push(box(0.24, 0.12, 0.3, LEG.dark, -0.14, y0, 0.03), box(0.24, 0.12, 0.3, LEG.dark, 0.14, y0, 0.03));
  // Cintura y torso
  p.push(box(0.46, 0.12, 0.3, LEG.dark, 0, y0 + 0.48, 0));
  p.push(box(0.56, 0.46, 0.38, LEG.armor, 0, y0 + 0.58, 0));
  p.push(box(0.36, 0.2, 0.06, LEG.trim, 0, y0 + 0.78, 0.2));               // águila del pecho
  // Hombreras grandes con ribete
  for (const s of [-1, 1]) {
    p.push(box(0.3, 0.26, 0.4, LEG.armor, s * 0.42, y0 + 0.86, 0, 0, 0, s * -0.18));
    p.push(box(0.32, 0.05, 0.42, LEG.trim, s * 0.43, y0 + 1.1, 0, 0, 0, s * -0.18));
  }
  // Mochila de energía
  p.push(box(0.46, 0.42, 0.2, LEG.armor, 0, y0 + 0.66, -0.27));
  p.push(box(0.34, 0.08, 0.04, LEG.dark, 0, y0 + 0.74, -0.38), box(0.34, 0.08, 0.04, LEG.dark, 0, y0 + 0.88, -0.38));
  p.push(place(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6), LEG.trim, -0.14, y0 + 1.12, -0.3));
  p.push(place(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6), LEG.trim, 0.14, y0 + 1.12, -0.3));
  // Casco con visor
  p.push(box(0.24, 0.26, 0.26, LEG.armor, 0, y0 + 1.04, 0.02));
  p.push(place(new THREE.BoxGeometry(0.18, 0.05, 0.04), LEG.visor, 0, y0 + 1.18, 0.16, 0, 0, 0, true));
  // Brazos y rifle sujeto delante
  p.push(box(0.14, 0.4, 0.16, LEG.armor, -0.36, y0 + 0.5, 0.08, -0.6));
  p.push(box(0.14, 0.4, 0.16, LEG.armor, 0.36, y0 + 0.5, 0.08, -0.6));
  p.push(box(0.12, 0.14, 0.78, LEG.dark, 0.1, y0 + 0.66, 0.36));
  p.push(box(0.08, 0.08, 0.2, LEG.dark, 0.1, y0 + 0.69, 0.84));
  return p;
}

function garra(): Part[] {
  const p: Part[] = [...peana(BASE_RADIUS.garra, SW.rim)];
  const y0 = 0.12;
  // Patas traseras, en ángulo
  for (const s of [-1, 1]) {
    p.push(box(0.1, 0.42, 0.12, SW.flesh, s * 0.18, y0, -0.1, 0.35, 0, s * 0.25));
    p.push(box(0.1, 0.42, 0.12, SW.flesh, s * 0.16, y0, 0.12, -0.3, 0, s * 0.25));
  }
  // Cuerpo encorvado hacia delante y placas de quitina
  p.push(box(0.4, 0.32, 0.6, SW.flesh, 0, y0 + 0.34, 0, -0.35));
  p.push(box(0.46, 0.12, 0.34, SW.shell, 0, y0 + 0.6, -0.12, -0.35));
  p.push(box(0.4, 0.12, 0.28, SW.shell, 0, y0 + 0.72, 0.12, -0.35));
  // Cola
  p.push(place(new THREE.ConeGeometry(0.1, 0.5, 5), SW.shell, 0, y0 + 0.36, -0.42, -1.9));
  // Cabeza alargada con ojos
  p.push(place(new THREE.ConeGeometry(0.14, 0.42, 5), SW.shell, 0, y0 + 0.66, 0.42, 1.35));
  p.push(place(new THREE.BoxGeometry(0.05, 0.05, 0.05), SW.eye, -0.07, y0 + 0.72, 0.38, 0, 0, 0, true));
  p.push(place(new THREE.BoxGeometry(0.05, 0.05, 0.05), SW.eye, 0.07, y0 + 0.72, 0.38, 0, 0, 0, true));
  // Garras como guadañas
  for (const s of [-1, 1]) {
    p.push(box(0.08, 0.36, 0.1, SW.flesh, s * 0.24, y0 + 0.5, 0.18, -0.7, 0, s * -0.3));
    p.push(place(new THREE.ConeGeometry(0.05, 0.46, 4), SW.claw, s * 0.3, y0 + 0.86, 0.46, 0.5, 0, 0));
  }
  return p;
}

const BUILDERS: Record<ModelKind, () => Part[]> = { legionario, garra };

/** Crea una miniatura nueva (un grupo con una malla por color). */
export function makeMiniature(kind: ModelKind): THREE.Group {
  return build(BUILDERS[kind]());
}
