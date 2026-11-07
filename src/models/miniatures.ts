import * as THREE from "three";
import { box, place, build, segment, spike, Part, V3 } from "./lowpoly";
import { ModelKind, BASE_RADIUS, Piece } from "../core/state";

// Miniaturas definitivas de la fase 1 (issue #11): legionario de la Escuadra de Asalto Táctico
// y Garra Menor del Enjambre, cada una con 3 poses y una versión de líder (sargento / alfa).
// Se modelan por articulaciones: cada pose es otro juego de puntos y `segment` pone los huesos.
// Escala: 1 = 1 pulgada; la miniatura mira hacia +z. Peanas de 32 mm y 25 mm.

export { BASE_RADIUS };

const LEG = {
  armor: "#2f56a8", armorD: "#26468a", trim: "#d6a83c", dark: "#25282e", metal: "#5d636b",
  visor: "#8fe4ff", red: "#b3332b", rim: "#3d6fd8", blade: "#c9ced6",
};
const SW = {
  flesh: "#c99a7e", fleshD: "#a87b62", shell: "#5d2a73", shellD: "#45205a", bone: "#ece0c8",
  eye: "#ff6a3d", glow: "#d56bff", rim: "#a24fc4",
};
const BASE_TOP = "#5a5648", BASE_SIDE = "#2b2d31", PEBBLE = "#6f6a5a";
const Y0 = 0.12;   // altura de la cara superior de la peana

// --- Peana ----------------------------------------------------------------
function peana(r: number, rim: string, seed: number): Part[] {
  const p: Part[] = [
    place(new THREE.CylinderGeometry(r * 0.95, r, 0.12, 16), BASE_SIDE, 0, 0.06, 0),
    place(new THREE.CylinderGeometry(r * 0.93, r * 0.93, 0.01, 16), BASE_TOP, 0, 0.122, 0),
    place(new THREE.CylinderGeometry(r * 1.0, r * 1.0, 0.03, 16), rim, 0, 0.015, 0),
  ];
  // Unas piedrecitas en la peana
  let s = seed;
  for (let i = 0; i < 3; i++) {
    s = (s * 9301 + 49297) % 233280;
    const a = (s / 233280) * Math.PI * 2, d = r * (0.45 + 0.3 * ((i * 37) % 10) / 10);
    p.push(place(new THREE.DodecahedronGeometry(0.05 + i * 0.015, 0), PEBBLE, Math.cos(a) * d, Y0 + 0.02, Math.sin(a) * d, a, a * 2, 0));
  }
  return p;
}

const y = (v: number) => Y0 + v;
const mirror = (p: V3): V3 => [-p[0], p[1], p[2]];

// --- Legionario -------------------------------------------------------------

interface LegPose {
  footL: V3; footR: V3; kneeL: V3; kneeR: V3;
  handL: V3; handR: V3;
  torsoLean: number;     // inclinación hacia delante del torso (z de los hombros)
  headTurn: number;
}

const LEG_POSES: LegPose[] = [
  // 0 · Apuntando: rifle al hombro, piernas abiertas y firmes
  { footL: [-0.17, y(0), 0.08], footR: [0.15, y(0), -0.1], kneeL: [-0.16, y(0.26), 0.1], kneeR: [0.15, y(0.26), -0.02],
    handR: [0.13, y(0.88), 0.18], handL: [0.04, y(0.93), 0.46], torsoLean: 0.04, headTurn: 0 },
  // 1 · En guardia: rifle cruzado sobre el pecho
  { footL: [-0.15, y(0), 0.02], footR: [0.15, y(0), -0.02], kneeL: [-0.15, y(0.27), 0.05], kneeR: [0.15, y(0.27), 0.03],
    handR: [0.2, y(0.6), 0.2], handL: [-0.12, y(0.86), 0.3], torsoLean: 0, headTurn: 0.35 },
  // 2 · Avanzando: zancada, rifle bajo
  { footL: [-0.15, y(0), 0.28], footR: [0.15, y(0.04), -0.24], kneeL: [-0.15, y(0.28), 0.22], kneeR: [0.15, y(0.24), -0.06],
    handR: [0.18, y(0.64), 0.14], handL: [0.06, y(0.66), 0.42], torsoLean: 0.08, headTurn: -0.2 },
];

function legionario(pose: number, leader: boolean): Part[] {
  const P = LEG_POSES[pose % LEG_POSES.length];
  const A = LEG, p: Part[] = [];
  const hipY = y(0.5), lean = P.torsoLean;

  // Piernas: muslo, espinillera, rodillera y bota
  for (const [side, foot, knee] of [[-1, P.footL, P.kneeL], [1, P.footR, P.kneeR]] as [number, V3, V3][]) {
    const hip: V3 = [side * 0.13, hipY, 0];
    p.push(segment(hip, knee, 0.2, 0.22, A.armor));
    p.push(segment(knee, [foot[0], foot[1] + 0.1, foot[2] - 0.02], 0.18, 0.2, A.armorD));
    p.push(box(0.14, 0.12, 0.08, A.trim, knee[0], knee[1] - 0.06, knee[2] + 0.11));
    p.push(box(0.22, 0.12, 0.32, A.dark, foot[0], foot[1], foot[2] + 0.04));
  }
  // Cadera, abdomen y cinturón
  p.push(box(0.42, 0.14, 0.27, A.dark, 0, hipY - 0.05, 0));
  p.push(box(0.44, 0.05, 0.29, A.trim, 0, hipY + 0.06, 0));
  p.push(box(0.36, 0.16, 0.25, A.dark, 0, hipY + 0.1, lean * 0.5));
  // Pecho con águila
  const chestZ = lean;
  p.push(box(0.56, 0.32, 0.36, A.armor, 0, hipY + 0.24, chestZ));
  p.push(box(0.46, 0.1, 0.38, A.armorD, 0, hipY + 0.24, chestZ));
  for (const s of [-1, 1]) p.push(box(0.16, 0.06, 0.04, A.trim, s * 0.09, hipY + 0.42, chestZ + 0.18, 0, 0, s * -0.35));
  p.push(box(0.06, 0.1, 0.05, A.trim, 0, hipY + 0.38, chestZ + 0.18));
  // Gorjal
  p.push(box(0.3, 0.08, 0.3, A.dark, 0, hipY + 0.55, chestZ - 0.02));
  // Mochila de energía con toberas
  p.push(box(0.46, 0.42, 0.2, A.armor, 0, hipY + 0.16, chestZ - 0.27));
  p.push(box(0.34, 0.06, 0.04, A.dark, 0, hipY + 0.26, chestZ - 0.38), box(0.34, 0.06, 0.04, A.dark, 0, hipY + 0.38, chestZ - 0.38));
  for (const s of [-1, 1]) p.push(place(new THREE.CylinderGeometry(0.06, 0.05, 0.22, 6), A.metal, s * 0.14, hipY + 0.66, chestZ - 0.3));

  // Hombreras: semicilindros grandes (eje de delante a atrás) con ribete en el borde exterior
  const shY = hipY + 0.5;
  for (const s of [-1, 1]) {
    p.push(place(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 7, 1, false, Math.PI / 2, Math.PI), A.armor, s * 0.41, shY - 0.1, chestZ, Math.PI / 2));
    p.push(place(new THREE.CylinderGeometry(0.235, 0.235, 0.06, 7, 1, false, Math.PI / 2, Math.PI), A.trim, s * 0.41, shY - 0.1, chestZ + 0.2, Math.PI / 2));
    p.push(place(new THREE.CylinderGeometry(0.235, 0.235, 0.06, 7, 1, false, Math.PI / 2, Math.PI), A.trim, s * 0.41, shY - 0.1, chestZ - 0.2, Math.PI / 2));
  }
  // Emblema del capítulo en la hombrera izquierda
  p.push(box(0.05, 0.1, 0.12, A.trim, -0.6, shY - 0.04, chestZ));

  // Brazos: hombro → codo → mano (el codo se abre hacia fuera y abajo)
  const arm = (side: number, hand: V3) => {
    const sh: V3 = [side * 0.36, shY - 0.06, chestZ];
    const elbow: V3 = [(sh[0] + hand[0]) / 2 + side * 0.13, (sh[1] + hand[1]) / 2 - 0.1, (sh[2] + hand[2]) / 2 - 0.06];
    p.push(segment(sh, elbow, 0.15, 0.16, A.armor));
    p.push(segment(elbow, hand, 0.14, 0.15, A.armorD));
    p.push(box(0.13, 0.12, 0.13, A.dark, hand[0], hand[1] - 0.06, hand[2]));
  };

  if (!leader) {
    arm(1, P.handR);
    arm(-1, P.handL);
    // Rifle bólter: de la culata (detrás de la mano derecha) a la boca (más allá de la izquierda)
    const r = P.handR, l = P.handL;
    const d: V3 = [l[0] - r[0], l[1] - r[1], l[2] - r[2]];
    const n = Math.hypot(...d);
    const u: V3 = [d[0] / n, d[1] / n, d[2] / n];
    const at = (t: number): V3 => [r[0] + u[0] * t, r[1] + u[1] * t + 0.02, r[2] + u[2] * t];
    p.push(segment(at(-0.22), at(n + 0.12), 0.1, 0.14, A.dark));
    p.push(segment(at(n + 0.12), at(n + 0.32), 0.06, 0.06, A.metal));
    const mag = at(n * 0.45);
    p.push(segment(mag, [mag[0], mag[1] - 0.17, mag[2] - 0.03], 0.07, 0.09, A.metal));
    p.push(segment(at(0.05), at(0.25), 0.05, 0.05, A.trim));    // mira
  } else {
    // Sargento: pistola al frente y espada sierra en alto
    const pistol: V3 = [0.26, y(1.0), 0.48];
    const sword: V3 = [-0.3, y(0.86), 0.24];
    arm(1, pistol);
    arm(-1, sword);
    p.push(segment([pistol[0], pistol[1] + 0.03, pistol[2] - 0.08], [pistol[0], pistol[1] + 0.03, pistol[2] + 0.18], 0.08, 0.11, A.dark));
    p.push(segment([pistol[0], pistol[1] - 0.02, pistol[2] - 0.02], [pistol[0], pistol[1] - 0.14, pistol[2] - 0.05], 0.06, 0.07, A.metal));
    const tip: V3 = [-0.36, y(1.55), 0.52];
    p.push(segment([sword[0], sword[1] - 0.1, sword[2] - 0.04], [sword[0], sword[1] + 0.04, sword[2]], 0.06, 0.06, A.dark));
    p.push(box(0.2, 0.05, 0.08, A.trim, sword[0], sword[1] + 0.04, sword[2]));
    p.push(segment([sword[0], sword[1] + 0.08, sword[2]], tip, 0.05, 0.12, A.blade));
    p.push(segment([sword[0], sword[1] + 0.1, sword[2] - 0.05], [tip[0], tip[1] - 0.04, tip[2] - 0.07], 0.04, 0.04, A.red));
  }

  // Casco con rejilla y visor; el sargento lo lleva rojo con cresta y laurel
  const hx = Math.sin(P.headTurn) * 0.02, hz = chestZ + 0.04;
  const helm = leader ? A.red : A.armor;
  p.push(box(0.21, 0.22, 0.23, helm, hx, hipY + 0.6, hz, 0, P.headTurn));
  p.push(box(0.14, 0.09, 0.06, A.dark, hx + Math.sin(P.headTurn) * 0.11, hipY + 0.6, hz + Math.cos(P.headTurn) * 0.11, 0, P.headTurn));
  p.push(place(new THREE.BoxGeometry(0.17, 0.04, 0.03), A.visor,
    hx + Math.sin(P.headTurn) * 0.12, hipY + 0.74, hz + Math.cos(P.headTurn) * 0.12, 0, P.headTurn, 0, true));
  if (leader) {
    for (let i = 0; i < 5; i++) p.push(box(0.05, 0.08 + (i === 2 ? 0.04 : i % 2 ? 0.02 : 0), 0.07, A.red, hx, hipY + 0.82, hz - 0.12 + i * 0.06));
    p.push(box(0.23, 0.035, 0.25, A.trim, hx, hipY + 0.78, hz, 0, P.headTurn));
    // Estandarte pequeño en la mochila
    p.push(segment([0.18, hipY + 0.5, chestZ - 0.34], [0.18, hipY + 1.3, chestZ - 0.34], 0.03, 0.03, A.metal));
    p.push(box(0.02, 0.32, 0.24, A.red, 0.18, hipY + 0.94, chestZ - 0.22));
    p.push(box(0.025, 0.08, 0.1, A.trim, 0.18, hipY + 1.08, chestZ - 0.22));
  }
  return p;
}

// --- Garra Menor --------------------------------------------------------------

interface ClawPose {
  thorax: V3;        // pecho (los hombros salen de aquí)
  head: V3;
  elbow: V3;         // codo del brazo-guadaña derecho (el izquierdo es su espejo)
  tip: V3;           // punta de la guadaña
  crouch: number;    // cuánto bajan las caderas
}

const CLAW_POSES: ClawPose[] = [
  // 0 · Acechando: guadañas en alto
  { thorax: [0, y(0.66), 0.16], head: [0, y(0.74), 0.4], elbow: [0.3, y(0.98), 0.18], tip: [0.3, y(0.62), 0.62], crouch: 0 },
  // 1 · Lanzándose: cuerpo bajo y estirado, guadañas al frente
  { thorax: [0, y(0.56), 0.24], head: [0, y(0.6), 0.5], elbow: [0.28, y(0.8), 0.42], tip: [0.24, y(0.72), 0.86], crouch: 0.08 },
  // 2 · Erguida: chillando, guadañas muy arriba
  { thorax: [0, y(0.8), 0.1], head: [0, y(0.98), 0.28], elbow: [0.32, y(1.14), 0.12], tip: [0.36, y(1.26), 0.5], crouch: -0.04 },
];

function garra(pose: number, leader: boolean): Part[] {
  const P = CLAW_POSES[pose % CLAW_POSES.length];
  const C = SW, p: Part[] = [];
  const shell = leader ? C.shellD : C.shell;
  const hip: V3 = [0, y(0.48 - P.crouch), -0.14];

  // Patas traseras digitígradas: muslo hacia delante, tarso hacia atrás, dedos
  for (const s of [-1, 1]) {
    const h: V3 = [s * 0.11, hip[1], hip[2]];
    const knee: V3 = [s * 0.18, y(0.3 - P.crouch * 0.6), 0.06];
    const ankle: V3 = [s * 0.17, y(0.1), -0.2];
    const toe: V3 = [s * 0.18, y(0.01), 0.04];
    p.push(segment(h, knee, 0.15, 0.17, C.flesh));
    p.push(segment(knee, ankle, 0.09, 0.1, C.fleshD));
    p.push(segment(ankle, toe, 0.07, 0.08, C.fleshD));
    p.push(spike(toe, [toe[0] + s * 0.03, y(0.0), toe[2] + 0.1], 0.03, C.bone, 4));
    p.push(box(0.12, 0.06, 0.16, shell, knee[0], knee[1] - 0.02, knee[2], 0.4, 0, 0));   // placa de la rodilla
  }

  // Tronco: abdomen → pecho, con placas de quitina encima
  p.push(segment(hip, P.thorax, 0.3, 0.26, C.flesh));
  const mid = (t: number): V3 => [hip[0] + (P.thorax[0] - hip[0]) * t, hip[1] + (P.thorax[1] - hip[1]) * t, hip[2] + (P.thorax[2] - hip[2]) * t];
  for (const t of [0.1, 0.45, 0.8]) {
    const m = mid(t);
    p.push(segment([m[0], m[1] + 0.12, m[2] - 0.08], [m[0], m[1] + 0.16, m[2] + 0.08], 0.34 - t * 0.06, 0.12, shell));
  }
  // Cola segmentada
  const t1: V3 = [0, hip[1] - 0.04, hip[2] - 0.24], t2: V3 = [0.04, hip[1] - 0.14, hip[2] - 0.44];
  p.push(segment(hip, t1, 0.16, 0.14, C.fleshD));
  p.push(segment(t1, t2, 0.1, 0.1, shell));
  p.push(spike(t2, [0.08, hip[1] - 0.26, hip[2] - 0.62], 0.05, C.bone, 4));

  // Cuello y cabeza alargada con cresta, mandíbulas y ojos
  p.push(segment(P.thorax, P.head, 0.14, 0.14, C.fleshD));
  const hd = P.head;
  p.push(spike([hd[0], hd[1], hd[2] - 0.08], [hd[0], hd[1] - 0.02, hd[2] + 0.26], 0.12, shell, 5));
  p.push(spike([hd[0], hd[1] + 0.06, hd[2] - 0.06], [hd[0], hd[1] + (leader ? 0.36 : 0.2), hd[2] - 0.3], leader ? 0.09 : 0.06, shell, 4));
  for (const s of [-1, 1]) {
    p.push(spike([hd[0] + s * 0.05, hd[1] - 0.06, hd[2] + 0.08], [hd[0] + s * 0.03, hd[1] - 0.14, hd[2] + 0.24], 0.025, C.bone, 3));
    p.push(place(new THREE.BoxGeometry(0.04, 0.035, 0.04), leader ? C.glow : C.eye, hd[0] + s * 0.065, hd[1] + 0.04, hd[2] + 0.08, 0, 0, 0, true));
  }

  // Brazos-guadaña: hombro → codo → hoja (dos tramos para que se curve)
  for (const s of [-1, 1]) {
    const sh: V3 = [s * 0.17, P.thorax[1] + 0.06, P.thorax[2] - 0.02];
    const el: V3 = [s * P.elbow[0], P.elbow[1], P.elbow[2]];
    const tip: V3 = [s * P.tip[0], P.tip[1], P.tip[2]];
    const bend: V3 = [(el[0] + tip[0]) / 2 + s * 0.03, Math.max(el[1], tip[1]) + 0.06, (el[2] + tip[2]) / 2];
    p.push(segment(sh, el, 0.09, 0.1, C.flesh));
    p.push(box(0.1, 0.08, 0.12, shell, el[0], el[1] - 0.04, el[2]));
    p.push(segment(el, bend, 0.04, 0.13, C.bone));
    p.push(spike(bend, tip, 0.05, C.bone, 3));
    // Bracitos con garras bajo el pecho
    const fa: V3 = [s * 0.1, P.thorax[1] - 0.1, P.thorax[2] + 0.04];
    const fh: V3 = [s * 0.13, P.thorax[1] - 0.2, P.thorax[2] + 0.18];
    p.push(segment(fa, fh, 0.05, 0.05, C.fleshD));
    p.push(spike(fh, [fh[0], fh[1] - 0.04, fh[2] + 0.1], 0.03, C.bone, 3));
  }

  // Alfa: espinas de hueso en el lomo y sacos que brillan
  if (leader) {
    for (const t of [0.2, 0.5, 0.8]) {
      const m = mid(t);
      p.push(spike([m[0], m[1] + 0.2, m[2]], [m[0], m[1] + 0.42, m[2] - 0.1], 0.05, C.bone, 4));
    }
    for (const s of [-1, 1]) {
      const m = mid(0.35);
      p.push(place(new THREE.DodecahedronGeometry(0.06, 0), C.glow, m[0] + s * 0.17, m[1] + 0.04, m[2], 0, 0, 0, true));
    }
  }
  return p;
}

// --- Fábrica con caché ----------------------------------------------------------

const cache = new Map<string, THREE.Group>();

/** Crea una miniatura (comparte geometría con las de su mismo modelo, pose y rango). */
export function makeMiniature(kind: ModelKind, pose = 0, leader = false): THREE.Group {
  const key = `${kind}:${pose % 3}:${leader ? 1 : 0}`;
  let proto = cache.get(key);
  if (!proto) {
    proto = new THREE.Group();
    const r = BASE_RADIUS[kind];
    const rim = kind === "legionario" ? LEG.rim : SW.rim;
    proto.add(build(peana(r, leader ? (kind === "legionario" ? LEG.trim : SW.glow) : rim, pose * 7 + 3)));
    const body = build(kind === "legionario" ? legionario(pose, leader) : garra(pose, leader));
    // El alfa es un poco más grande que sus hermanas
    if (kind === "garra" && leader) { body.scale.setScalar(1.15); body.position.y = -Y0 * 0.15; }
    proto.add(body);
    cache.set(key, proto);
  }
  return proto.clone();
}

/** Para la vista: miniatura de una pieza del estado. */
export function miniatureFor(p: Piece): THREE.Group {
  return makeMiniature(p.model, p.pose ?? 0, !!p.leader);
}
