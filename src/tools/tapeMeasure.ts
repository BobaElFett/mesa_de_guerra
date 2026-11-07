import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BASE_RADIUS } from "../core/state";
import { measure, inchesText, Spot, Measurement } from "../core/measure";
import { PiecesView } from "../view/piecesView";
import { Picker } from "../input/picker";

// Cinta métrica (tecla M): con la herramienta activa, clic y arrastre mide en pulgadas.
// Si un extremo cae en una miniatura, se mide desde el borde de su peana y la cinta la sigue
// aunque la miniatura se mueva. La medida se queda en la mesa hasta Esc o hasta medir otra vez.
// Es solo de la vista: no es una orden ni se guarda.

const TAPE_Y = 0.06;
const TAPE_W = 0.16;
const YELLOW = "#f0c94a", INK = "#2a2418";

interface End { x: number; z: number; pieceId: string | null }

export class TapeMeasure {
  readonly group = new THREE.Group();
  active = false;
  onActiveChange: (on: boolean) => void = () => {};

  private a: End | null = null;
  private b: End | null = null;
  private dragging = false;
  private key = "";
  private label: HTMLElement;
  private matTape = new THREE.MeshBasicMaterial({ color: YELLOW, depthTest: false, transparent: true, opacity: 0.95 });
  private matInk = new THREE.MeshBasicMaterial({ color: INK, depthTest: false, transparent: true });
  private matCap = new THREE.MeshBasicMaterial({ color: YELLOW, depthTest: false, transparent: true, opacity: 0.8, side: THREE.DoubleSide });

  constructor(private dom: HTMLElement, private picker: Picker, private view: PiecesView) {
    this.label = document.getElementById("tape-label")!;
    this.group.renderOrder = 10;
    dom.addEventListener("pointerdown", (e) => this.down(e));
    dom.addEventListener("pointermove", (e) => this.move(e));
    dom.addEventListener("pointerup", (e) => this.up(e));
  }

  toggle(on = !this.active) {
    this.active = on;
    this.dom.style.cursor = on ? "crosshair" : "default";
    if (!on) this.clear();
    this.onActiveChange(on);
  }

  /** Esc: primero borra la medida; si no hay, sale de la herramienta. Devuelve si hizo algo. */
  escape(): boolean {
    if (this.a) { this.clear(); return true; }
    if (this.active) { this.toggle(false); return true; }
    return false;
  }

  clear() {
    this.a = this.b = null;
    this.dragging = false;
    this.key = "";
    this.rebuild(null);
    this.label.hidden = true;
  }

  /** Medida actual (para pruebas y, más adelante, para las reglas). */
  current(): Measurement | null {
    if (!this.a || !this.b) return null;
    return measure(this.spot(this.a), this.spot(this.b));
  }

  private end(): End | null {
    const id = this.picker.piece();
    if (id) {
      const g = this.view.groupOf(id)!;
      return { x: g.position.x, z: g.position.z, pieceId: id };
    }
    const p = this.picker.table();
    return p ? { x: p.x, z: p.z, pieceId: null } : null;
  }

  private down(e: PointerEvent) {
    if (!this.active || e.button !== 0) return;
    this.picker.set(e);
    const s = this.end();
    if (!s) return;
    this.a = s;
    this.b = { ...s, pieceId: null };
    this.dragging = true;
    this.dom.setPointerCapture(e.pointerId);
  }

  private move(e: PointerEvent) {
    if (!this.active) return;
    this.dom.style.cursor = "crosshair";
    if (!this.dragging || !this.a) return;
    this.picker.set(e);
    const s = this.end();
    if (!s) return;
    // Medir de una miniatura a sí misma no tiene sentido: ese extremo es un punto del tapete
    if (s.pieceId && s.pieceId === this.a.pieceId) {
      const p = this.picker.table();
      if (p) { s.x = p.x; s.z = p.z; s.pieceId = null; }
    }
    this.b = s;
  }

  private up(e: PointerEvent) {
    if (e.button !== 0 || !this.dragging) return;
    this.dragging = false;
    // Un clic sin arrastrar borra la medida
    if (this.a && this.b && !this.b.pieceId && Math.hypot(this.a.x - this.b.x, this.a.z - this.b.z) < 0.05) this.clear();
  }

  /** Extremo con la posición actual de su miniatura (si la tiene). */
  private spot(e: End): Spot {
    if (e.pieceId) {
      const g = this.view.groupOf(e.pieceId);
      const p = this.view.pieceOf(e.pieceId);
      if (g && p) return { x: g.position.x, z: g.position.z, r: BASE_RADIUS[p.model] };
    }
    return { x: e.x, z: e.z, r: 0 };
  }

  /** Cada fotograma: sigue a las miniaturas y coloca la etiqueta. */
  update() {
    const m = this.current();
    if (!m) return;
    const key = `${m.from[0].toFixed(3)},${m.from[1].toFixed(3)},${m.to[0].toFixed(3)},${m.to[1].toFixed(3)}`;
    if (key !== this.key) { this.key = key; this.rebuild(m); }
    const mx = (m.from[0] + m.to[0]) / 2, mz = (m.from[1] + m.to[1]) / 2;
    const s = this.picker.toScreen(mx, TAPE_Y, mz);
    if (!s) { this.label.hidden = true; return; }
    const both = this.a?.pieceId && this.b?.pieceId;
    this.label.innerHTML = `${inchesText(m.inches)}${both ? `<span> borde a borde</span>` : ""}`;
    this.label.style.left = `${s.x}px`;
    this.label.style.top = `${s.y}px`;
    this.label.hidden = false;
  }

  private rebuild(m: Measurement | null) {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
    if (!m) return;
    const [x0, z0] = m.from, [x1, z1] = m.to;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const along = (t: number, side = 0): [number, number] => [
      x0 + Math.cos(ang) * t - Math.sin(ang) * side,
      z0 + Math.sin(ang) * t + Math.cos(ang) * side,
    ];
    const piece = (w: number, d: number, t: number, side: number) => {
      const g = new THREE.BoxGeometry(w, 0.01, d);
      g.rotateY(-ang);
      const [x, z] = along(t, side);
      g.translate(x, TAPE_Y, z);
      return g;
    };
    if (len > 1e-3) {
      const tape = new THREE.Mesh(piece(len, TAPE_W, len / 2, 0), this.matTape);
      // Marcas: cada pulgada en un borde; cada 6" de lado a lado
      const ticks: THREE.BufferGeometry[] = [];
      for (let i = 1; i < len; i++) {
        const big = i % 6 === 0;
        ticks.push(piece(0.03, big ? TAPE_W : TAPE_W * 0.45, i, big ? 0 : -TAPE_W * 0.275));
      }
      tape.renderOrder = 10;
      this.group.add(tape);
      if (ticks.length) {
        const ink = new THREE.Mesh(mergeGeometries(ticks)!, this.matInk);
        ink.renderOrder = 11;
        this.group.add(ink);
        ticks.forEach((t) => t.dispose());
      }
    }
    // Puntitos en los extremos
    for (const [x, z] of [m.from, m.to]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16).rotateX(-Math.PI / 2).translate(x, TAPE_Y, z), this.matCap);
      cap.renderOrder = 10;
      this.group.add(cap);
    }
  }
}
