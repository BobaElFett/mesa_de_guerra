import * as THREE from "three";
import { GameState, Piece, TerrainPiece, TERRAIN } from "../core/state";
import { miniatureFor, BASE_RADIUS } from "../models/miniatures";
import { makeTerrain } from "../models/terrain";

// Dibuja las miniaturas y la escenografía a partir del estado. Las posiciones se suavizan
// hacia las del estado, así que al deshacer se ve cada cosa volver a su sitio.

type Item = { kind: "mini"; piece: Piece } | { kind: "terrain"; terrain: TerrainPiece };
interface Entry { group: THREE.Group; item: Item }

/** Posición y giro de cualquier cosa de la mesa. */
export interface Placed { id: string; x: number; z: number; rot: number }

const RING_SELECTED = "#f2d36b";
const RING_HOVER = "#e8e4d4";

export class PiecesView {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** Lo que el jugador arrastra: la vista no lo mueve hacia el estado. */
  readonly dragging = new Set<string>();
  /** Con la escenografía bloqueada no se puede coger (se coge lo que hay detrás). */
  terrainLocked = true;
  private marks: THREE.Mesh[] = [];
  private ringGeo = new THREE.RingGeometry(1, 1.14, 32);
  private frameGeos = new Map<string, THREE.BufferGeometry>();
  private matSel = new THREE.MeshBasicMaterial({ color: RING_SELECTED, transparent: true, opacity: 0.95, depthWrite: false });
  private matHover = new THREE.MeshBasicMaterial({ color: RING_HOVER, transparent: true, opacity: 0.55, depthWrite: false });

  sync(state: GameState) {
    const seen = new Set<string>();
    const upsert = (id: string, item: Item, make: () => THREE.Group, p: Placed) => {
      seen.add(id);
      let e = this.entries.get(id);
      if (!e) {
        const g = make();
        g.userData.pieceId = id;
        g.position.set(p.x, 0, p.z);
        g.rotation.y = p.rot;
        this.group.add(g);
        e = { group: g, item };
        this.entries.set(id, e);
      }
      e.item = item;
    };
    for (const t of state.terrain) upsert(t.id, { kind: "terrain", terrain: t }, () => shadowed(makeTerrain(t.kind)), t);
    for (const p of state.pieces) upsert(p.id, { kind: "mini", piece: p }, () => miniatureFor(p), p);
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) { this.group.remove(e.group); this.entries.delete(id); }
    }
  }

  update(dt: number) {
    const k = Math.min(1, dt * 12);
    for (const [id, e] of this.entries) {
      if (this.dragging.has(id)) continue;
      const g = e.group, p = placedOf(e.item);
      g.position.x += (p.x - g.position.x) * k;
      g.position.z += (p.z - g.position.z) * k;
      g.position.y += (0 - g.position.y) * k;
      g.rotation.y += shortAngle(g.rotation.y, p.rot) * k;
    }
  }

  /** Grupos que se pueden coger con el ratón. `minisOnly` para la cinta métrica. */
  pickables(minisOnly = false): THREE.Object3D[] {
    return [...this.entries.values()]
      .filter((e) => e.item.kind === "mini" || (!minisOnly && !this.terrainLocked))
      .map((e) => e.group);
  }

  /** Ids que puede abarcar un recuadro de selección. */
  ids(): string[] {
    return [...this.entries].filter(([, e]) => e.item.kind === "mini" || !this.terrainLocked).map(([id]) => id);
  }

  groupOf(id: string): THREE.Group | null { return this.entries.get(id)?.group ?? null; }
  /** La miniatura con ese id, o null (también si es escenografía). */
  pieceOf(id: string): Piece | null {
    const it = this.entries.get(id)?.item;
    return it?.kind === "mini" ? it.piece : null;
  }
  terrainOf(id: string): TerrainPiece | null {
    const it = this.entries.get(id)?.item;
    return it?.kind === "terrain" ? it.terrain : null;
  }
  /** Posición y giro según el estado, sea miniatura o escenografía. */
  placedOf(id: string): Placed | null {
    const e = this.entries.get(id);
    return e ? placedOf(e.item) : null;
  }

  /** Anillos bajo las miniaturas y marcos bajo la escenografía: dorado = seleccionado, tenue = ratón. */
  highlight(selected: Iterable<string>, hovered: string | null) {
    let n = 0;
    const put = (id: string, mat: THREE.Material) => {
      const e = this.entries.get(id);
      if (!e) return;
      let m = this.marks.at(n);
      if (!m) {
        m = new THREE.Mesh(this.ringGeo, mat);
        m.renderOrder = 1;
        this.group.add(m);
        this.marks.push(m);
      }
      m.material = mat;
      m.visible = true;
      m.position.set(e.group.position.x, 0.02, e.group.position.z);
      if (e.item.kind === "mini") {
        m.geometry = this.ringGeo;
        m.rotation.set(-Math.PI / 2, 0, 0);
        m.scale.setScalar(BASE_RADIUS[e.item.piece.model] + 0.08);
      } else {
        const t = TERRAIN[e.item.terrain.kind];
        m.geometry = this.frame(t.w, t.d);
        m.rotation.set(0, e.group.rotation.y, 0);
        m.scale.setScalar(1);
      }
      n++;
    };
    const sel = new Set(selected);
    for (const id of sel) put(id, this.matSel);
    if (hovered && !sel.has(hovered)) put(hovered, this.matHover);
    for (let i = n; i < this.marks.length; i++) this.marks[i].visible = false;
  }

  /** Marco rectangular plano alrededor de una huella w × d. */
  private frame(w: number, d: number): THREE.BufferGeometry {
    const key = `${w}x${d}`;
    let g = this.frameGeos.get(key);
    if (!g) {
      const t = 0.12, W = w + 0.5, D = d + 0.5;
      const shape = new THREE.Shape();
      shape.moveTo(-W / 2 - t, -D / 2 - t); shape.lineTo(W / 2 + t, -D / 2 - t);
      shape.lineTo(W / 2 + t, D / 2 + t); shape.lineTo(-W / 2 - t, D / 2 + t);
      const hole = new THREE.Path();
      hole.moveTo(-W / 2, -D / 2); hole.lineTo(-W / 2, D / 2); hole.lineTo(W / 2, D / 2); hole.lineTo(W / 2, -D / 2);
      shape.holes.push(hole);
      g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
      this.frameGeos.set(key, g);
    }
    return g;
  }
}

function placedOf(it: Item): Placed {
  return it.kind === "mini" ? it.piece : it.terrain;
}

function shadowed(g: THREE.Group): THREE.Group {
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function shortAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
