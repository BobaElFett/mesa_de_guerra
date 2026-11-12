import { HILL_HEIGHT, onHill } from "../rules/geometry";
import * as THREE from "three";
import { GameState, Piece, TerrainPiece, TERRAIN } from "../core/state";
import { miniatureFor, BASE_RADIUS } from "../models/miniatures";
import { makeTerrain } from "../models/terrain";

// Dibuja las miniaturas y la escenografía a partir del estado. Las posiciones se suavizan
// hacia las del estado, así que al deshacer se ve cada cosa volver a su sitio.

type Item = { kind: "mini"; piece: Piece } | { kind: "terrain"; terrain: TerrainPiece };
interface Anim { kind: "lunge" | "recoil"; t: number; dx: number; dz: number }
interface Entry { group: THREE.Group; item: Item; dying?: number; look: string; base: THREE.Vector3; step: number; anims: Anim[] }

/** Posición y giro de cualquier cosa de la mesa. */
export interface Placed { id: string; x: number; z: number; rot: number }

const RING_SELECTED = "#f2d36b";
const RING_HOVER = "#e8e4d4";
const RING_WARN = "#e0675a";

export class PiecesView {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** Lo que el jugador arrastra: la vista no lo mueve hacia el estado. */
  readonly dragging = new Set<string>();
  /** Bajas que siguen en la mesa hasta que acaba la animación de los dados. */
  private held = new Set<string>();
  /** Con la escenografía bloqueada no se puede coger (se coge lo que hay detrás). */
  terrainLocked = true;
  private marks: THREE.Mesh[] = [];
  private ringGeo = new THREE.RingGeometry(1, 1.14, 32);
  private frameGeos = new Map<string, THREE.BufferGeometry>();
  private matSel = new THREE.MeshBasicMaterial({ color: RING_SELECTED, transparent: true, opacity: 0.95, depthWrite: false });
  private matHover = new THREE.MeshBasicMaterial({ color: RING_HOVER, transparent: true, opacity: 0.55, depthWrite: false });
  private matShocked = new THREE.MeshBasicMaterial({ color: "#9a2b2b", transparent: true, opacity: 0.8, depthWrite: false });
  private matTarget = new THREE.MeshBasicMaterial({ color: "#ff9a3d", transparent: true, opacity: 0.95, depthWrite: false });
  private matCanTarget = new THREE.MeshBasicMaterial({ color: "#ff9a3d", transparent: true, opacity: 0.35, depthWrite: false });
  /** Unidades que aún pueden actuar en la fase: anillo verde que late. */
  readonly matPending = new THREE.MeshBasicMaterial({ color: "#7be08a", transparent: true, opacity: 0.6, depthWrite: false });
  private matWarn = new THREE.MeshBasicMaterial({ color: RING_WARN, transparent: true, opacity: 0.95, depthWrite: false });

  sync(state: GameState) {
    const seen = new Set<string>();
    const upsert = (id: string, item: Item, make: () => THREE.Group, p: Placed, look: string) => {
      seen.add(id);
      let e = this.entries.get(id);
      // Mismo id pero otro aspecto (p. ej. tras desplegar listas nuevas): se rehace el modelo
      if (e && e.look !== look) { this.group.remove(e.group); this.entries.delete(id); e = undefined; }
      if (!e) {
        const g = make();
        g.userData.pieceId = id;
        g.position.set(p.x, 0, p.z);
        g.rotation.y = p.rot;
        this.group.add(g);
        e = { group: g, item, look, base: g.position.clone(), step: 0, anims: [] };
        this.entries.set(id, e);
      }
      e.item = item;
    };
    for (const t of state.terrain) upsert(t.id, { kind: "terrain", terrain: t }, () => shadowed(makeTerrain(t.kind)), t, `t:${t.kind}`);
    const vets = new Set(state.units.filter((u) => u.veteran).map((u) => u.id));
    for (const p of state.pieces) {
      const vet = !!p.unit && vets.has(p.unit);
      upsert(p.id, { kind: "mini", piece: p }, () => { const g = miniatureFor(p); if (vet) g.add(veteranMark(BASE_RADIUS[p.model])); return g; }, p, `m:${p.model}:${p.pose ?? 0}:${p.leader ? 1 : 0}:${vet ? "v" : ""}`);
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) { e.dying = undefined; e.group.scale.setScalar(1); continue; }
      if (this.held.has(id)) continue;
      if (e.dying === undefined) { this.group.remove(e.group); this.entries.delete(id); }
    }
  }

  /** Retiene estas bajas en la mesa (se quitarán al llamar a `release`). */
  hold(ids: string[]) { for (const id of ids) this.held.add(id); }

  /** Suelta las bajas retenidas: las que ya no están en el estado caen y desaparecen. */
  release(state: GameState) {
    const alive = new Set([...state.pieces.map((p) => p.id), ...state.terrain.map((t) => t.id)]);
    for (const id of this.held) {
      const e = this.entries.get(id);
      if (e && !alive.has(id)) e.dying = 0;
    }
    this.held.clear();
  }

  update(dt: number) {
    const k = Math.min(1, dt * 12);
    for (const [id, e] of this.entries) {
      if (e.dying !== undefined) {
        // Baja: se inclina, se hunde y desaparece
        e.dying += dt / 0.6;
        e.group.rotation.z = Math.min(1, e.dying) * 1.3;
        e.group.position.y = -Math.max(0, e.dying - 0.4) * 1.5;
        if (e.dying >= 1) { this.group.remove(e.group); this.entries.delete(id); }
        continue;
      }
      const g = e.group;
      if (this.dragging.has(id)) { e.base.copy(g.position); e.anims.length = 0; continue; }
      const p = placedOf(e.item), b = e.base;
      const dx = p.x - b.x, dz = p.z - b.z;
      b.x += dx * k; b.z += dz * k; b.y += ((this.hills.length && onHill(this.hills, p.x, p.z) ? HILL_HEIGHT : 0) - b.y) * k;
      g.rotation.y += shortAngle(g.rotation.y, p.rot) * k;
      let ox = 0, oy = 0, oz = 0, tilt = 0;
      // Al andar: pasitos (sube y baja) y un leve balanceo
      if (this.animate && e.item.kind === "mini") {
        const moved = Math.hypot(dx, dz) * k;
        const walking = Math.hypot(dx, dz) > 0.08;
        if (walking) e.step += moved * 2.4 + dt * 6;
        const amp = walking ? Math.min(1, Math.hypot(dx, dz) / 0.6) : 0;
        oy += Math.abs(Math.sin(e.step)) * 0.18 * amp;
        tilt = Math.sin(e.step) * 0.08 * amp;
        if (!walking) e.step = 0;
        for (const a of e.anims) {
          a.t += dt;
          if (a.t < 0) continue;
          const dur = a.kind === "lunge" ? 0.32 : 0.26;
          const u = Math.min(1, a.t / dur);
          // Embiste: sale rápido y vuelve; retroceso: golpe seco hacia atrás
          const f = a.kind === "lunge" ? Math.sin(u * Math.PI) * 0.55 : Math.sin(u * Math.PI) * (1 - u) * 0.7;
          ox += a.dx * f; oz += a.dz * f;
          if (a.kind === "recoil") tilt += Math.sin(u * Math.PI) * 0.12;
        }
        e.anims = e.anims.filter((a) => a.t < 0.4);
      }
      g.position.set(b.x + ox, b.y + oy, b.z + oz);
      g.rotation.z = tilt;
    }
  }

  /** Colinas de la mesa (#125): las miniaturas que están encima se suben a la meseta. */
  hills: import("../core/state").TerrainPiece[] = [];

  /** Animaciones de miniaturas; se pueden apagar. */
  animate = true;

  /** La miniatura da un embiste hacia un punto (combate). */
  lunge(id: string, to: { x: number; z: number }, delay = 0) { this.push(id, "lunge", to, delay, 1); }

  /** La miniatura retrocede, alejándose de un punto (recibe un impacto). */
  recoil(id: string, from: { x: number; z: number }, delay = 0) { this.push(id, "recoil", from, delay, -1); }

  private push(id: string, kind: Anim["kind"], at: { x: number; z: number }, delay: number, sign: number) {
    const e = this.entries.get(id);
    if (!e || !this.animate || e.item.kind !== "mini" || e.dying !== undefined) return;
    const dx = at.x - e.base.x, dz = at.z - e.base.z, d = Math.hypot(dx, dz) || 1;
    if (e.anims.length >= 3) return;
    e.anims.push({ kind, t: -delay, dx: (dx / d) * sign, dz: (dz / d) * sign });
  }

  /** Grupos que se pueden coger con el ratón. `minisOnly` para la cinta métrica. */
  pickables(minisOnly = false): THREE.Object3D[] {
    return [...this.entries.values()]
      .filter((e) => e.dying === undefined && !this.held.has(placedOf(e.item).id))
      .filter((e) => e.item.kind === "mini" || (!minisOnly && !this.terrainLocked))
      .map((e) => e.group);
  }

  /** Ids que puede abarcar un recuadro de selección. */
  ids(): string[] {
    return [...this.entries].filter(([, e]) => e.item.kind === "mini" || !this.terrainLocked).map(([id]) => id);
  }

  groupOf(id: string): THREE.Group | null { return this.entries.get(id)?.group ?? null; }
  /** La miniatura con ese id, o null (también si es escenografía). */
  pieceOf(id: string): Piece | null {
    const it = this.entries.get(id)?.item;
    return it?.kind === "mini" ? it.piece : null;
  }
  terrainOf(id: string): TerrainPiece | null {
    const it = this.entries.get(id)?.item;
    return it?.kind === "terrain" ? it.terrain : null;
  }
  /** Posición y giro según el estado, sea miniatura o escenografía. */
  placedOf(id: string): Placed | null {
    const e = this.entries.get(id);
    return e ? placedOf(e.item) : null;
  }

  /** Anillos bajo las miniaturas y marcos bajo la escenografía: dorado = seleccionado, tenue = ratón. */
  highlight(selected: Iterable<string>, hovered: string | null, warn: Set<string> = new Set(), targets: Set<string> = new Set(), shocked: Set<string> = new Set(),
    canTarget: Set<string> = new Set(), pending: Set<string> = new Set()) {
    let n = 0;
    const put = (id: string, mat: THREE.Material) => {
      const e = this.entries.get(id);
      if (!e) return;
      let m = this.marks.at(n);
      if (!m) {
        m = new THREE.Mesh(this.ringGeo, mat);
        m.renderOrder = 1;
        this.group.add(m);
        this.marks.push(m);
      }
      m.material = mat;
      m.visible = true;
      m.position.set(e.group.position.x, 0.02, e.group.position.z);
      if (e.item.kind === "mini") {
        m.geometry = this.ringGeo;
        m.rotation.set(-Math.PI / 2, 0, 0);
        m.scale.setScalar(BASE_RADIUS[e.item.piece.model] + 0.08);
      } else {
        const t = TERRAIN[e.item.terrain.kind];
        m.geometry = this.frame(t.w, t.d);
        m.rotation.set(0, e.group.rotation.y, 0);
        m.scale.setScalar(1);
      }
      n++;
    };
    const sel = new Set(selected);
    for (const id of sel) put(id, warn.has(id) ? this.matWarn : this.matSel);
    for (const id of warn) if (!sel.has(id)) put(id, this.matWarn);
    for (const id of targets) if (!sel.has(id) && !warn.has(id)) put(id, this.matTarget);
    for (const id of shocked) if (!sel.has(id) && !warn.has(id) && !targets.has(id)) put(id, this.matShocked);
    for (const id of canTarget) if (!sel.has(id) && !warn.has(id) && !targets.has(id)) put(id, this.matCanTarget);
    for (const id of pending) if (!sel.has(id) && !warn.has(id) && !targets.has(id) && !shocked.has(id)) put(id, this.matPending);
    if (hovered && !sel.has(hovered) && !warn.has(hovered)) put(hovered, this.matHover);
    for (let i = n; i < this.marks.length; i++) this.marks[i].visible = false;
  }

  /** Marco rectangular plano alrededor de una huella w × d. */
  private frame(w: number, d: number): THREE.BufferGeometry {
    const key = `${w}x${d}`;
    let g = this.frameGeos.get(key);
    if (!g) {
      const t = 0.12, W = w + 0.5, D = d + 0.5;
      const shape = new THREE.Shape();
      shape.moveTo(-W / 2 - t, -D / 2 - t); shape.lineTo(W / 2 + t, -D / 2 - t);
      shape.lineTo(W / 2 + t, D / 2 + t); shape.lineTo(-W / 2 - t, D / 2 + t);
      const hole = new THREE.Path();
      hole.moveTo(-W / 2, -D / 2); hole.lineTo(-W / 2, D / 2); hole.lineTo(W / 2, D / 2); hole.lineTo(W / 2, -D / 2);
      shape.holes.push(hole);
      g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
      this.frameGeos.set(key, g);
    }
    return g;
  }
}

function placedOf(it: Item): Placed {
  return it.kind === "mini" ? it.piece : it.terrain;
}

function shadowed(g: THREE.Group): THREE.Group {
  // Lo que brilla (ojos, visores) no hace falta que proyecte sombra: una llamada menos por miniatura
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const glow = ((m.material as THREE.MeshStandardMaterial).emissiveIntensity ?? 0) > 0; m.castShadow = !glow; m.receiveShadow = !glow; } });
  return g;
}

function shortAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Veterana (#71): anillo dorado en el borde de la peana y tres galones
const VET_MAT = new THREE.MeshStandardMaterial({ color: "#e8b84a", emissive: "#6a4a10", emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.6 });
function veteranMark(r: number): THREE.Object3D {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.045, 4, 28).rotateX(Math.PI / 2), VET_MAT);
  ring.position.y = 0.2;
  g.add(ring);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), VET_MAT);
    c.position.set(-0.22 + i * 0.22, 0.24, r - 0.02);
    g.add(c);
  }
  return g;
}
