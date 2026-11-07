import * as THREE from "three";
import { box, build, place } from "../models/lowpoly";
import { BOARD, DEPLOY_DEPTH, FACTIONS } from "../core/state";

// La mesa: tablero de madera, tapete de batalla de 60" × 44", rejilla, zonas de despliegue
// y la sala alrededor. La superficie del tapete está en y = 0.

const WOOD = "#6b4a30", WOOD_DARK = "#4a3221", FLOOR = "#2a2421", FELT = "#5a2a2e";
const TOP = -0.12;   // altura del tablero de madera

/** Bandeja de dados, en un estante a la derecha de la mesa. Medidas interiores. */
export const TRAY = { x: 42, z: 0, w: 10.6, d: 14.6, floorY: TOP + 0.25, wall: 0.9 } as const;

export class Table {
  readonly group = new THREE.Group();
  readonly mat: THREE.Mesh;
  readonly grid: THREE.Group;

  constructor() {
    // Tablero, marco y patas
    const frameW = BOARD.w + 8, frameD = BOARD.d + 8, top = TOP;
    const shelfX0 = frameW / 2, shelfW = 16, shelfD = 20;
    const wood = build([
      box(frameW, 1.6, frameD, WOOD, 0, top - 1.6, 0),
      box(frameW + 0.6, 0.5, 0.8, WOOD_DARK, 0, top - 0.2, frameD / 2 + 0.1),
      box(frameW + 0.6, 0.5, 0.8, WOOD_DARK, 0, top - 0.2, -frameD / 2 - 0.1),
      box(0.8, 0.5, frameD + 0.6, WOOD_DARK, frameW / 2 + 0.1, top - 0.2, 0),
      box(0.8, 0.5, frameD + 0.6, WOOD_DARK, -frameW / 2 - 0.1, top - 0.2, 0),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) =>
        box(3, 28, 3, WOOD_DARK, sx * (frameW / 2 - 3), top - 29.6, sz * (frameD / 2 - 3))),
      // Estante lateral para la bandeja de dados
      box(shelfW, 1.4, shelfD, WOOD, shelfX0 + shelfW / 2, top - 1.4, 0),
      box(2, 28, 2, WOOD_DARK, shelfX0 + shelfW - 2, top - 29.4, shelfD / 2 - 2),
      box(2, 28, 2, WOOD_DARK, shelfX0 + shelfW - 2, top - 29.4, -shelfD / 2 + 2),
    ]);
    this.group.add(wood);

    // Tapete: plano subdividido con color por vértice (manchas de terreno baldío)
    const geo = new THREE.PlaneGeometry(BOARD.w, BOARD.d, BOARD.w, BOARD.d).toNonIndexed();
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute("position");
    const colors = new Float32Array(pos.count * 3);
    const a = new THREE.Color("#4b5244"), b = new THREE.Color("#5f5a48"), c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      // Un color por triángulo, como el terreno de Señorío
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const n = 0.5 + 0.38 * Math.sin(x * 0.13 + Math.cos(z * 0.11) * 2) * Math.cos(z * 0.15 - x * 0.04)
        + 0.06 * (hash(Math.floor(x), Math.floor(z)) - 0.5);
      c.copy(a).lerp(b, THREE.MathUtils.clamp(n, 0, 1));
      for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.mat = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
    this.mat.receiveShadow = true;
    this.mat.name = "tapete";
    this.group.add(this.mat);
    // Grosor del tapete (canto oscuro)
    const edge = build([box(BOARD.w, 0.1, BOARD.d, "#2f322b", 0, -0.12, 0)], false);
    edge.children.forEach((m) => ((m as THREE.Mesh).receiveShadow = true));
    this.group.add(edge);

    // Zonas de despliegue: franjas tintadas junto a cada borde largo
    const zone = (color: string, z: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(BOARD.w, DEPLOY_DEPTH),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.09, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.006, z);
      return m;
    };
    this.group.add(zone(FACTIONS.legion.color, BOARD.d / 2 - DEPLOY_DEPTH / 2));
    this.group.add(zone(FACTIONS.swarm.color, -BOARD.d / 2 + DEPLOY_DEPTH / 2));

    // Rejilla: cada pulgada tenue, cada 6" más marcada
    this.grid = new THREE.Group();
    this.grid.add(gridLines(1, 0.06), gridLines(6, 0.2));
    this.group.add(this.grid);

    // Bandeja de dados: fondo de fieltro y paredes de madera oscura
    const t = TRAY, wt = 0.4;
    const tray = build([
      box(t.w, 0.25, t.d, FELT, t.x, top, t.z),
      box(t.w + 2 * wt, t.wall, wt, WOOD_DARK, t.x, top, t.z - t.d / 2 - wt / 2),
      box(t.w + 2 * wt, t.wall, wt, WOOD_DARK, t.x, top, t.z + t.d / 2 + wt / 2),
      box(wt, t.wall, t.d, WOOD_DARK, t.x - t.w / 2 - wt / 2, top, t.z),
      box(wt, t.wall, t.d, WOOD_DARK, t.x + t.w / 2 + wt / 2, top, t.z),
    ]);
    this.group.add(tray);

    // Suelo de la sala
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = top - 29.6;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Unos dados de adorno junto al borde, para dar escala
    const deco = build([
      place(new THREE.BoxGeometry(0.62, 0.62, 0.62), "#d9d2c3", BOARD.w / 2 + 2, top + 0.31, BOARD.d / 2 + 1.5, 0, 0.4, 0),
      place(new THREE.BoxGeometry(0.62, 0.62, 0.62), "#b8463a", BOARD.w / 2 + 2.9, top + 0.31, BOARD.d / 2 + 2.2, 0, 1.1, 0),
    ]);
    this.group.add(deco);
  }

  setGridVisible(v: boolean) { this.grid.visible = v; }
}

function gridLines(step: number, opacity: number): THREE.LineSegments {
  const pts: number[] = [];
  const hw = BOARD.w / 2, hd = BOARD.d / 2;
  for (let x = -hw; x <= hw + 1e-6; x += step) pts.push(x, 0, -hd, x, 0, hd);
  for (let z = -hd; z <= hd + 1e-6; z += step) pts.push(-hw, 0, z, hw, 0, z);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#e8e4d4", transparent: true, opacity, depthWrite: false }));
  l.position.y = 0.01;
  return l;
}

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
