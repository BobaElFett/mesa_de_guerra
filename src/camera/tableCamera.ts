import * as THREE from "three";
import { BOARD } from "../core/state";

/**
 * Cámara de mesa (adaptada de la RtsCamera de Señorío).
 *  - Desplazar: WASD / flechas, o arrastrar con el botón central
 *  - Girar: Q / E, o arrastrar con el botón derecho
 *  - Zoom: rueda (de 8" a 120")
 *  - V: vista cenital · Inicio: vista inicial
 * Orbita alrededor de un punto del tapete (`target`, en y = 0).
 */
export class TableCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3(0, 0, 6);
  topDown = false;

  private yaw = 0;
  private distance = 62;
  private targetDistance = 62;
  private pitch = 0.9;
  private readonly minDistance = 8;
  private readonly maxDistance = 120;
  private keys = new Set<string>();
  private drag: { button: number; x: number; y: number } | null = null;

  constructor(private dom: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
    this.bindInput();
    this.update(1);
  }

  reset() {
    this.target.set(0, 0, 6);
    this.yaw = 0;
    this.targetDistance = 62;
    this.topDown = false;
  }

  /** Acerca la cámara a un punto (p. ej. la bandeja de dados). */
  focus(x: number, z: number, distance: number) {
    this.target.set(x, 0, z);
    this.targetDistance = THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance);
    this.topDown = false;
  }

  /** Mira desde el lado de un jugador (0 = Legión, +z; 1 = Enjambre, −z). */
  sideOf(player: 0 | 1) {
    this.yaw = player === 0 ? 0 : Math.PI;
    this.target.set(0, 0, player === 0 ? 6 : -6);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private bindInput() {
    window.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.ctrlKey || e.metaKey) return;
      this.keys.add(e.code);
      if (e.code === "KeyV") this.topDown = !this.topDown;
      if (e.code === "Home") this.reset();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => { this.keys.clear(); this.drag = null; });

    this.dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.0012);
      this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * f, this.minDistance, this.maxDistance);
    }, { passive: false });

    this.dom.addEventListener("pointerdown", (e) => {
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        this.drag = { button: e.button, x: e.clientX, y: e.clientY };
        this.dom.setPointerCapture(e.pointerId);
      }
    });
    this.dom.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      if (this.drag.button === 2) {
        this.yaw -= dx * 0.006;
      } else {
        // Desplazar arrastrando: el tapete sigue al ratón
        const k = this.distance * 0.0016;
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        this.target.x -= (dx * cos + dy * sin) * k;
        this.target.z -= (-dx * sin + dy * cos) * k;
      }
    });
    this.dom.addEventListener("pointerup", (e) => {
      if (this.drag && e.button === this.drag.button) this.drag = null;
    });
    this.dom.addEventListener("contextmenu", (e) => e.preventDefault());
    this.dom.addEventListener("auxclick", (e) => e.preventDefault());
  }

  update(dt: number) {
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 10);

    let mx = 0, mz = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) mz -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) mz += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) mx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) mx += 1;
    if (this.keys.has("KeyQ")) this.yaw += dt * 1.5;
    if (this.keys.has("KeyE")) this.yaw -= dt * 1.5;

    const speed = 0.8 * this.distance + 6;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.target.x += (mx * cos + mz * sin) * speed * dt;
    this.target.z += (-mx * sin + mz * cos) * speed * dt;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -BOARD.w / 2 - 4, BOARD.w / 2 + 18);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -BOARD.d / 2 - 4, BOARD.d / 2 + 4);

    // Cerca se ve de lado, a la altura de las miniaturas; lejos, más desde arriba
    const t = THREE.MathUtils.clamp((this.distance - this.minDistance) / (this.maxDistance - this.minDistance), 0, 1);
    const want = this.topDown ? 1.54 : THREE.MathUtils.lerp(0.42, 1.12, Math.sqrt(t));
    this.pitch += (want - this.pitch) * Math.min(1, dt * 8);

    const horiz = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horiz,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horiz,
    );
    if (this.camera.position.y < 1.2) this.camera.position.y = 1.2;
    this.camera.lookAt(this.target);
  }
}
