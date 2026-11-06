import * as THREE from "three";
import { GameState, Piece } from "../core/state";
import { makeMiniature, BASE_RADIUS } from "../models/miniatures";

// Dibuja las miniaturas a partir del estado. Las posiciones se suavizan hacia las del estado,
// así que al deshacer se ve la miniatura volver a su sitio.

interface Entry { group: THREE.Group; piece: Piece }

const RING_SELECTED = "#f2d36b";
const RING_HOVER = "#e8e4d4";

export class PiecesView {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** Miniaturas que el jugador arrastra: la vista no las mueve hacia el estado. */
  readonly dragging = new Set<string>();
  private rings: THREE.Mesh[] = [];
  private ringGeo = new THREE.RingGeometry(1, 1.14, 32);
  private matSel = new THREE.MeshBasicMaterial({ color: RING_SELECTED, transparent: true, opacity: 0.95, depthWrite: false });
  private matHover = new THREE.MeshBasicMaterial({ color: RING_HOVER, transparent: true, opacity: 0.55, depthWrite: false });

  sync(state: GameState) {
    const seen = new Set<string>();
    for (const p of state.pieces) {
      seen.add(p.id);
      let e = this.entries.get(p.id);
      if (!e) {
        const g = makeMiniature(p.model);
        g.userData.pieceId = p.id;
        g.position.set(p.x, 0, p.z);
        g.rotation.y = p.rot;
        this.group.add(g);
        e = { group: g, piece: p };
        this.entries.set(p.id, e);
      }
      e.piece = p;
    }
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) { this.group.remove(e.group); this.entries.delete(id); }
    }
  }

  update(dt: number) {
    const k = Math.min(1, dt * 12);
    for (const [id, e] of this.entries) {
      if (this.dragging.has(id)) continue;
      const g = e.group;
      g.position.x += (e.piece.x - g.position.x) * k;
      g.position.z += (e.piece.z - g.position.z) * k;
      g.position.y += (0 - g.position.y) * k;
      g.rotation.y += shortAngle(g.rotation.y, e.piece.rot) * k;
    }
  }

  /** Grupos de las miniaturas, para el raycast. */
  pickables(): THREE.Object3D[] {
    return [...this.entries.values()].map((e) => e.group);
  }

  ids(): string[] { return [...this.entries.keys()]; }
  groupOf(id: string): THREE.Group | null { return this.entries.get(id)?.group ?? null; }
  pieceOf(id: string): Piece | null { return this.entries.get(id)?.piece ?? null; }

  /** Anillos bajo las miniaturas seleccionadas (dorados) y la del ratón (tenue). */
  highlight(selected: Iterable<string>, hovered: string | null) {
    let n = 0;
    const put = (id: string, mat: THREE.Material) => {
      const e = this.entries.get(id);
      if (!e) return;
      let ring = this.rings.at(n);
      if (!ring) {
        ring = new THREE.Mesh(this.ringGeo, mat);
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 1;
        this.group.add(ring);
        this.rings.push(ring);
      }
      ring.material = mat;
      ring.visible = true;
      ring.scale.setScalar(BASE_RADIUS[e.piece.model] + 0.08);
      ring.position.set(e.group.position.x, 0.02, e.group.position.z);
      n++;
    };
    const sel = new Set(selected);
    for (const id of sel) put(id, this.matSel);
    if (hovered && !sel.has(hovered)) put(hovered, this.matHover);
    for (let i = n; i < this.rings.length; i++) this.rings[i].visible = false;
  }
}

function shortAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
