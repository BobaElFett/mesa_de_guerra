import * as THREE from "three";
import { CommandBus } from "../core/commands";
import { BOARD } from "../core/state";
import { PiecesView } from "../view/piecesView";

// Coger y soltar miniaturas con el botón izquierdo. Mientras se arrastra solo cambia la vista;
// al soltar se envía una orden "move" (que se puede deshacer).

const LIFT = 0.6;   // la miniatura se levanta un poco al cogerla

export class DragControls {
  hovered: string | null = null;
  private dragId: string | null = null;
  private start = new THREE.Vector2();
  private offset = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  /** Distancia recorrida en el arrastre actual (pulgadas), o null si no se arrastra. */
  onDragInfo: (inches: number | null, clientX: number, clientY: number) => void = () => {};

  constructor(
    private dom: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private view: PiecesView,
    private bus: CommandBus,
  ) {
    dom.addEventListener("pointermove", (e) => this.move(e));
    dom.addEventListener("pointerdown", (e) => this.down(e));
    dom.addEventListener("pointerup", (e) => this.up(e));
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.dragId) this.cancel();
    });
  }

  private setRay(e: PointerEvent) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
  }

  private pick(): string | null {
    const hits = this.ray.intersectObjects(this.view.pickables(), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.pieceId === undefined) o = o.parent;
      if (o) return o.userData.pieceId as string;
    }
    return null;
  }

  private tablePoint(): THREE.Vector3 | null {
    return this.ray.ray.intersectPlane(this.plane, this.hit);
  }

  private down(e: PointerEvent) {
    if (e.button !== 0) return;
    this.setRay(e);
    const id = this.pick();
    const p = this.tablePoint();
    if (!id || !p) return;
    const g = this.view.groupOf(id)!;
    this.dragId = id;
    this.view.dragging = id;
    this.start.set(g.position.x, g.position.z);
    this.offset.set(g.position.x - p.x, g.position.z - p.z);
    this.dom.setPointerCapture(e.pointerId);
    this.dom.style.cursor = "grabbing";
  }

  private move(e: PointerEvent) {
    this.setRay(e);
    if (!this.dragId) {
      this.hovered = this.pick();
      this.dom.style.cursor = this.hovered ? "grab" : "default";
      return;
    }
    const p = this.tablePoint();
    if (!p) return;
    const g = this.view.groupOf(this.dragId)!;
    const x = THREE.MathUtils.clamp(p.x + this.offset.x, -BOARD.w / 2, BOARD.w / 2);
    const z = THREE.MathUtils.clamp(p.z + this.offset.y, -BOARD.d / 2, BOARD.d / 2);
    g.position.set(x, LIFT, z);
    this.onDragInfo(Math.hypot(x - this.start.x, z - this.start.y), e.clientX, e.clientY);
  }

  private up(e: PointerEvent) {
    if (e.button !== 0 || !this.dragId) return;
    const id = this.dragId;
    const g = this.view.groupOf(id)!;
    const moved = Math.hypot(g.position.x - this.start.x, g.position.z - this.start.y);
    this.dragId = null;
    this.view.dragging = null;
    this.onDragInfo(null, 0, 0);
    this.dom.style.cursor = "grab";
    if (moved > 0.05) this.bus.dispatch({ type: "move", id, x: round2(g.position.x), z: round2(g.position.z) });
  }

  private cancel() {
    this.dragId = null;
    this.view.dragging = null;
    this.onDragInfo(null, 0, 0);
  }

  /** Miniatura bajo el ratón o la que se arrastra, para resaltarla. */
  get active(): string | null { return this.dragId ?? this.hovered; }
}

function round2(v: number) { return Math.round(v * 100) / 100; }
