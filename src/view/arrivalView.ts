import * as THREE from "three";
import { BASE_RADIUS, GameState } from "../core/state";
import type { PieceMove } from "../core/commands";
import { ARRIVE_GAP } from "../rules/reserves";

// Colocación de una unidad que llega de la reserva (#56): zonas prohibidas (9" alrededor de
// cada enemigo) en rojo y, bajo el cursor, dónde caerían las miniaturas (verde) o una cruz
// roja si no caben.

export class ArrivalView {
  readonly group = new THREE.Group();
  private zones = new THREE.Group();
  private ghosts = new THREE.Group();
  private zoneMat = new THREE.MeshBasicMaterial({ color: "#ff4a3a", transparent: true, opacity: 0.12, depthWrite: false, depthTest: false });
  private ghostMat = new THREE.MeshBasicMaterial({ color: "#7dff9a", transparent: true, opacity: 0.55, depthWrite: false, depthTest: false });
  private badMat = new THREE.MeshBasicMaterial({ color: "#ff4a3a", transparent: true, opacity: 0.7, depthWrite: false, depthTest: false });
  private key = "";

  constructor() {
    this.group.add(this.zones, this.ghosts);
    this.group.visible = false;
  }

  /** Muestra las zonas prohibidas para el bando que llega (o lo oculta todo con null). */
  show(s: GameState | null, faction?: "legion" | "swarm") {
    if (!s || !faction) { this.group.visible = false; this.key = ""; this.clear(this.ghosts); return; }
    this.group.visible = true;
    const enemies = s.pieces.filter((p) => p.faction !== faction);
    const key = enemies.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join("|");
    if (key === this.key) return;
    this.key = key;
    this.clear(this.zones);
    for (const p of enemies) {
      const g = new THREE.CircleGeometry(BASE_RADIUS[p.model] + ARRIVE_GAP, 40).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.zoneMat);
      m.position.set(p.x, 0.05, p.z);
      m.renderOrder = 18;
      this.zones.add(m);
    }
  }

  /** Vista previa en (x, z): las miniaturas donde caerían, o una marca roja si no caben. */
  preview(x: number, z: number, moves: PieceMove[] | null, radius: number) {
    this.clear(this.ghosts);
    if (!moves) {
      const g = new THREE.RingGeometry(1.2, 1.7, 32).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.badMat);
      m.position.set(x, 0.08, z);
      m.renderOrder = 22;
      this.ghosts.add(m);
      return;
    }
    for (const mv of moves) {
      const g = new THREE.CircleGeometry(radius, 24).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.ghostMat);
      m.position.set(mv.x, 0.08, mv.z);
      m.renderOrder = 22;
      this.ghosts.add(m);
    }
  }

  private clear(g: THREE.Group) {
    for (const c of [...g.children]) { g.remove(c); (c as THREE.Mesh).geometry.dispose(); }
  }
}
