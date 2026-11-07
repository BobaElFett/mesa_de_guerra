import * as THREE from "three";
import { CommandBus, PieceMove } from "../core/commands";
import { BOARD, PLAYERS } from "../core/state";
import { resolveOverlaps } from "../core/placement";
import { PiecesView } from "../view/piecesView";
import { Picker } from "./picker";
import { modal } from "../ui/modal";

// Selección y movimiento de miniaturas con el botón izquierdo.
//  - Clic en una miniatura: seleccionarla · Mayús+clic: añadirla o quitarla
//  - Arrastrar desde el tapete: recuadro de selección (Mayús: añade)
//  - Arrastrar una miniatura: mueve toda la selección conservando la formación
//  - R / Mayús+R: girar 45° la selección alrededor de su centro
//  - Ctrl+A: seleccionar las del bando que juega · Esc: cancelar o deseleccionar
// La selección es de la vista (no va en el estado); cada movimiento o giro es UNA orden.

const LIFT = 0.6;        // altura a la que se levantan las miniaturas al arrastrarlas
const CLICK_PX = 4;      // menos de esto es un clic, no un arrastre

type Gesture =
  | { kind: "none" }
  | { kind: "piece"; id: string; sx: number; sy: number; dragging: boolean;
      start: Map<string, { x: number; z: number }>; grab: THREE.Vector2; additive: boolean }
  | { kind: "box"; sx: number; sy: number; additive: boolean };

export class PieceControls {
  readonly selected = new Set<string>();
  hovered: string | null = null;
  onSelectionChange: () => void = () => {};
  /** Distancia que lleva la miniatura que más se ha movido (pulgadas), o null si no se arrastra. */
  onDragInfo: (inches: number | null, clientX: number, clientY: number) => void = () => {};

  /** Mientras devuelva true (p. ej. con la cinta métrica), el botón izquierdo no es nuestro. */
  blocked: () => boolean = () => false;

  private g: Gesture = { kind: "none" };
  private box: HTMLElement;

  constructor(
    private dom: HTMLElement,
    private picker: Picker,
    private view: PiecesView,
    private bus: CommandBus,
  ) {
    this.box = document.getElementById("selbox")!;
    dom.addEventListener("pointerdown", (e) => this.down(e));
    dom.addEventListener("pointermove", (e) => this.move(e));
    dom.addEventListener("pointerup", (e) => this.up(e));
    window.addEventListener("keydown", (e) => this.key(e));
  }

  // --- Entrada -----------------------------------------------------------
  private down(e: PointerEvent) {
    if (e.button !== 0 || this.blocked()) return;
    this.setRay(e);
    const id = this.pick();
    const p = this.tablePoint();
    this.dom.setPointerCapture(e.pointerId);
    if (!id || !p) {
      this.g = { kind: "box", sx: e.clientX, sy: e.clientY, additive: e.shiftKey };
      return;
    }
    // Mayús+clic sobre una seleccionada la quita (sin arrastre)
    if (e.shiftKey && this.selected.has(id)) {
      this.selected.delete(id);
      this.changed();
      this.g = { kind: "none" };
      return;
    }
    if (e.shiftKey) this.selected.add(id);
    else if (!this.selected.has(id)) { this.selected.clear(); this.selected.add(id); }
    this.changed();
    const start = new Map<string, { x: number; z: number }>();
    for (const s of this.selected) {
      const gr = this.view.groupOf(s);
      if (gr) start.set(s, { x: gr.position.x, z: gr.position.z });
    }
    const me = start.get(id)!;
    this.g = {
      kind: "piece", id, sx: e.clientX, sy: e.clientY, dragging: false, start,
      grab: new THREE.Vector2(me.x - p.x, me.z - p.z), additive: e.shiftKey,
    };
  }

  private move(e: PointerEvent) {
    this.setRay(e);
    const g = this.g;
    if (g.kind === "none") {
      this.hovered = this.blocked() ? null : this.pick();
      if (!this.blocked()) this.dom.style.cursor = this.hovered ? "grab" : "default";
      return;
    }
    if (g.kind === "box") {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < CLICK_PX) return;
      const r = rect(g.sx, g.sy, e.clientX, e.clientY);
      Object.assign(this.box.style, { left: `${r.x0}px`, top: `${r.y0}px`, width: `${r.x1 - r.x0}px`, height: `${r.y1 - r.y0}px` });
      this.box.hidden = false;
      return;
    }
    // Arrastre de la selección
    if (!g.dragging) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < CLICK_PX) return;
      g.dragging = true;
      for (const id of g.start.keys()) this.view.dragging.add(id);
      this.dom.style.cursor = "grabbing";
    }
    const p = this.tablePoint();
    if (!p) return;
    const me = g.start.get(g.id)!;
    let dx = p.x + g.grab.x - me.x, dz = p.z + g.grab.y - me.z;
    // Que ninguna miniatura del grupo se salga del tapete
    for (const s of g.start.values()) {
      dx = THREE.MathUtils.clamp(dx, -BOARD.w / 2 - s.x, BOARD.w / 2 - s.x);
      dz = THREE.MathUtils.clamp(dz, -BOARD.d / 2 - s.z, BOARD.d / 2 - s.z);
    }
    for (const [id, s] of g.start) this.view.groupOf(id)?.position.set(s.x + dx, LIFT, s.z + dz);
    this.onDragInfo(Math.hypot(dx, dz), e.clientX, e.clientY);
  }

  private up(e: PointerEvent) {
    if (e.button !== 0) return;
    const g = this.g;
    this.g = { kind: "none" };
    if (g.kind === "box") {
      this.box.hidden = true;
      if (!g.additive) this.selected.clear();
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) >= CLICK_PX) {
        const r = rect(g.sx, g.sy, e.clientX, e.clientY);
        for (const id of this.view.ids()) {
          const s = this.toScreen(id);
          if (s && s.x >= r.x0 && s.x <= r.x1 && s.y >= r.y0 && s.y <= r.y1) this.selected.add(id);
        }
      }
      this.changed();
      return;
    }
    if (g.kind !== "piece") return;
    this.dom.style.cursor = "grab";
    this.onDragInfo(null, 0, 0);
    if (!g.dragging) {
      // Clic sin arrastre sobre una ya seleccionada (sin Mayús): queda solo esa
      if (!g.additive) { this.selected.clear(); this.selected.add(g.id); this.changed(); }
      return;
    }
    const moves: PieceMove[] = [];
    for (const id of g.start.keys()) {
      const gr = this.view.groupOf(id)!;
      moves.push({ id, x: gr.position.x, z: gr.position.z });
    }
    this.view.dragging.clear();
    this.commit(moves, g.start);
  }

  private key(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === "INPUT" || modal.open) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === "KeyA") {
      e.preventDefault();
      const f = PLAYERS[this.bus.state.active];
      this.selected.clear();
      for (const p of this.bus.state.pieces) if (p.faction === f) this.selected.add(p.id);
      this.changed();
      return;
    }
    if (mod) return;
    if (e.code === "Escape" && !this.blocked()) {
      if (this.g.kind === "piece" && this.g.dragging) {
        this.view.dragging.clear();
        this.onDragInfo(null, 0, 0);
      } else {
        this.selected.clear();
        this.changed();
      }
      this.box.hidden = true;
      this.g = { kind: "none" };
    }
    if (e.code === "KeyR" && this.g.kind === "none" && !this.blocked()) this.rotate(e.shiftKey ? -Math.PI / 4 : Math.PI / 4);
  }

  // --- Acciones ----------------------------------------------------------
  /** Gira la selección (o la miniatura bajo el ratón) alrededor de su centro. */
  rotate(angle: number) {
    const ids = this.selected.size ? [...this.selected] : this.hovered ? [this.hovered] : [];
    const ps = ids.map((id) => this.view.placedOf(id)).filter((p) => p !== null);
    if (!ps.length) return;
    const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const cz = ps.reduce((a, p) => a + p.z, 0) / ps.length;
    const c = Math.cos(angle), s = Math.sin(angle);
    const moves = ps.map((p) => {
      const dx = p.x - cx, dz = p.z - cz;
      return { id: p.id, x: cx + dx * c + dz * s, z: cz - dx * s + dz * c, rot: p.rot + angle };
    });
    this.commit(moves, null);
  }

  /** Separa las peanas que se pisen y envía una sola orden (la escenografía no se separa). */
  private commit(moves: PieceMove[], start: Map<string, { x: number; z: number }> | null) {
    const minis = moves.filter((m) => this.view.pieceOf(m.id));
    const rest = moves.filter((m) => !this.view.pieceOf(m.id)).map((m) => ({ ...m, x: round2(m.x), z: round2(m.z) }));
    const fixed = [...resolveOverlaps(this.bus.state.pieces, minis), ...rest];
    const real = fixed.filter((m) => {
      const p = this.view.placedOf(m.id);
      const from = start?.get(m.id) ?? p;
      return !from || Math.hypot(m.x - from.x, m.z - from.z) > 0.01 || (m.rot !== undefined && m.rot !== p?.rot);
    });
    if (real.length) this.bus.dispatch({ type: "moveMany", moves: real });
  }

  /** Deja seleccionado solo `id` (p. ej. la escenografía recién puesta). */
  selectOnly(id: string) {
    this.selected.clear();
    this.selected.add(id);
    this.changed();
  }

  /** Quita de la selección lo que ya no se puede coger (p. ej. al bloquear la escenografía). */
  prune(keep: (id: string) => boolean) {
    for (const id of [...this.selected]) if (!keep(id)) this.selected.delete(id);
    this.changed();
  }

  // --- Utilidades --------------------------------------------------------
  private changed() {
    for (const id of [...this.selected]) if (!this.view.placedOf(id)) this.selected.delete(id);
    this.onSelectionChange();
  }

  private setRay(e: PointerEvent) { this.picker.set(e); }
  private pick(): string | null { return this.picker.piece(); }
  private tablePoint(): THREE.Vector3 | null { return this.picker.table(); }

  private toScreen(id: string): { x: number; y: number } | null {
    const gr = this.view.groupOf(id);
    return gr ? this.picker.toScreen(gr.position.x, 0.5, gr.position.z) : null;
  }
}

function rect(ax: number, ay: number, bx: number, by: number) {
  return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
}

function round2(v: number) { return Math.round(v * 100) / 100; }
