import * as THREE from "three";
import type { TerrainPiece } from "../core/state";
import { worldSolids } from "../rules/geometry";

// Las partes sólidas de la escenografía (#hitboxes), dibujadas sobre la mesa mientras se
// arrastran miniaturas en modo reglas o se edita la escenografía: lo rojo no se pisa ni se cruza.

export class SolidsView {
  readonly group = new THREE.Group();
  private key = "";
  // Por encima de todo (sin prueba de profundidad): se ven a través de los muros
  private fill = new THREE.MeshBasicMaterial({ color: "#ff4a3a", transparent: true, opacity: 0.3, depthWrite: false, depthTest: false });
  private line = new THREE.LineBasicMaterial({ color: "#ff8a7a", transparent: true, opacity: 0.95, depthTest: false });

  constructor() { this.group.visible = false; }

  sync(terrain: TerrainPiece[]) {
    const key = terrain.map((t) => `${t.kind}${t.x.toFixed(2)},${t.z.toFixed(2)},${t.rot.toFixed(3)}`).join("|");
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.group.children]) { this.group.remove(c); ((c as THREE.Mesh).geometry as THREE.BufferGeometry)?.dispose(); }
    for (const t of terrain) for (const r of worldSolids(t)) {
      const g = new THREE.PlaneGeometry(r.w, r.d).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.fill);
      m.position.set(r.x, 0.06, r.z);
      m.rotation.y = r.rot;
      m.renderOrder = 20;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), this.line);
      e.position.copy(m.position);
      e.rotation.y = r.rot;
      e.position.y = 0.07;
      e.renderOrder = 21;
      this.group.add(m, e);
    }
  }
}
