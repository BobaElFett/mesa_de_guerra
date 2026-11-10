import * as THREE from "three";
import { BASE_RADIUS, GameState } from "../core/state";
import type { Command } from "../core/commands";

// Dibuja la jugada sugerida (#59): un anillo dorado en la unidad que actúa, sus destinos si se
// mueve y una flecha hacia el objetivo si dispara, carga o combate.

const GOLD = "#ffd36b";

export class SuggestView {
  readonly group = new THREE.Group();
  private mat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.75, depthWrite: false, depthTest: false });
  private ghostMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false });
  private lineMat = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9, depthTest: false });

  clear() {
    for (const c of [...this.group.children]) { this.group.remove(c); (c as THREE.Mesh).geometry.dispose(); }
  }

  show(s: GameState, unit: string | null, cmds: Command[]) {
    this.clear();
    if (!unit) return;
    const ring = (x: number, z: number, r: number, m: THREE.Material, inner = r + 0.12, outer = r + 0.32) => {
      const g = new THREE.RingGeometry(inner, outer, 32).rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, 0.09, z);
      mesh.renderOrder = 24;
      this.group.add(mesh);
    };
    const own = s.pieces.filter((p) => p.unit === unit);
    for (const p of own) ring(p.x, p.z, BASE_RADIUS[p.model], this.mat);
    const centre = (ps: { x: number; z: number }[]) => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length });
    let from = own.length ? centre(own) : null;
    for (const c of cmds) {
      if (c.type === "moveMany") {
        for (const mv of c.moves) {
          const p = s.pieces.find((q) => q.id === mv.id);
          if (!p) continue;
          const g = new THREE.CircleGeometry(BASE_RADIUS[p.model], 24).rotateX(-Math.PI / 2);
          const m = new THREE.Mesh(g, this.ghostMat);
          m.position.set(mv.x, 0.08, mv.z);
          m.renderOrder = 23;
          this.group.add(m);
        }
        if (c.moves.length && from) { const to = centre(c.moves); this.arrow(from, to); from = to; }
      } else if (c.type === "arrive") {
        ring(c.x, c.z, 2.5, this.mat);
      } else if ((c.type === "shoot" || c.type === "charge" || c.type === "fight" || (c.type === "stratagem" && c.target)) && from) {
        const tgt = s.pieces.filter((p) => p.unit === c.target);
        if (tgt.length) this.arrow(from, centre(tgt));
      }
    }
  }

  private arrow(a: { x: number; z: number }, b: { x: number; z: number }) {
    const y = 0.35;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(b.x, y, b.z)]);
    const line = new THREE.Line(geo, this.lineMat);
    line.renderOrder = 25;
    this.group.add(line);
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < 0.5) return;
    const head = new THREE.ConeGeometry(0.45, 1.1, 10).rotateX(Math.PI / 2);
    const m = new THREE.Mesh(head, this.mat);
    m.position.set(b.x, y, b.z);
    m.lookAt(b.x + (b.x - a.x) / d, y, b.z + (b.z - a.z) / d);
    m.renderOrder = 25;
    this.group.add(m);
  }
}
