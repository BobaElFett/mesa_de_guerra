import * as THREE from "three";
import { PiecesView } from "../view/piecesView";

// Rayo desde el ratón: qué miniatura hay debajo y en qué punto del tapete (y = 0).

export class Picker {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();

  constructor(private dom: HTMLElement, private camera: THREE.PerspectiveCamera, private view: PiecesView) {}

  set(e: { clientX: number; clientY: number }) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
  }

  /** Id de lo que hay bajo el ratón (miniatura, o escenografía si está desbloqueada), o null. */
  piece(minisOnly = false): string | null {
    const hits = this.ray.intersectObjects(this.view.pickables(minisOnly), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.pieceId === undefined) o = o.parent;
      if (o) return o.userData.pieceId as string;
    }
    return null;
  }

  /** Objetos de la lista que corta el rayo, del más cercano al más lejano. */
  intersect(objects: THREE.Object3D[]): THREE.Intersection[] {
    return this.ray.intersectObjects(objects, true);
  }

  /** Punto del tapete bajo el ratón (se reutiliza el mismo vector), o null. */
  table(): THREE.Vector3 | null {
    return this.ray.ray.intersectPlane(this.plane, this.hit);
  }

  /** Posición en pantalla de un punto del mundo, o null si queda detrás de la cámara. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    const r = this.dom.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
}
