import * as THREE from "three";
import { BASE_RADIUS } from "../core/state";
import { PiecesView } from "./piecesView";

// Círculos de alcance (tecla C): alrededor de cada miniatura seleccionada, a N pulgadas
// del borde de su peana. Sirven para ver de un vistazo qué queda a tiro o a distancia de carga.

const WIDTH = 0.08;

export class RangeRings {
  readonly group = new THREE.Group();
  range = 0;
  private rings: THREE.Mesh[] = [];
  private geos = new Map<number, THREE.RingGeometry>();
  private mat = new THREE.MeshBasicMaterial({ color: "#f0c94a", transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });

  private geo(radius: number): THREE.RingGeometry {
    const k = Math.round(radius * 100);
    let g = this.geos.get(k);
    if (!g) {
      g = new THREE.RingGeometry(radius - WIDTH / 2, radius + WIDTH / 2, Math.max(48, Math.round(radius * 16)));
      g.rotateX(-Math.PI / 2);
      this.geos.set(k, g);
    }
    return g;
  }

  update(view: PiecesView, selected: Iterable<string>) {
    let n = 0;
    if (this.range > 0) {
      for (const id of selected) {
        const p = view.pieceOf(id), g = view.groupOf(id);
        if (!p || !g) continue;
        let ring = this.rings.at(n);
        if (!ring) {
          ring = new THREE.Mesh(this.geo(1), this.mat);
          ring.renderOrder = 2;
          this.group.add(ring);
          this.rings.push(ring);
        }
        ring.geometry = this.geo(BASE_RADIUS[p.model] + this.range);
        ring.position.set(g.position.x, 0.03, g.position.z);
        ring.visible = true;
        n++;
      }
    }
    for (let i = n; i < this.rings.length; i++) this.rings[i].visible = false;
  }
}
