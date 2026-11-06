import * as THREE from "three";
import { GameState, Piece } from "../core/state";
import { makeMiniature, BASE_RADIUS } from "../models/miniatures";

// Dibuja las miniaturas a partir del estado. Las posiciones se suavizan hacia las del estado,
// así que al deshacer se ve la miniatura volver a su sitio.

interface Entry { group: THREE.Group; piece: Piece }

export class PiecesView {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** Miniatura que el jugador arrastra: la vista no la mueve hacia el estado. */
  dragging: string | null = null;
  private ring: THREE.Mesh;

  constructor() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.16, 32),
      new THREE.MeshBasicMaterial({ color: "#f2e7a1", transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

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
      if (id === this.dragging) continue;
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

  groupOf(id: string): THREE.Group | null { return this.entries.get(id)?.group ?? null; }
  pieceOf(id: string): Piece | null { return this.entries.get(id)?.piece ?? null; }

  /** Anillo de resaltado bajo una miniatura (o ninguno). */
  highlight(id: string | null) {
    const e = id ? this.entries.get(id) : null;
    this.ring.visible = !!e;
    if (!e) return;
    const r = BASE_RADIUS[e.piece.model] + 0.08;
    this.ring.scale.setScalar(r);
    this.ring.position.set(e.group.position.x, 0.02, e.group.position.z);
  }
}

function shortAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
