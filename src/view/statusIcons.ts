import * as THREE from "three";
import { GameState } from "../core/state";
import type { PiecesView } from "./piecesView";

// Marcadores sobre las unidades (#95): iconos pequeños que flotan encima de cada unidad
// y dicen de un vistazo qué ha hecho este turno y en qué estado está.

export type StatusIcon = "movio" | "avanzo" | "disparo" | "cargo" | "combatio" | "psiquico" | "estratagema" | "desmoralizada" | "llego" | "retiro";

export const ICON_LABEL: Record<StatusIcon, string> = {
  movio: "Ha movido", avanzo: "Ha avanzado", disparo: "Ha disparado", cargo: "Ha cargado",
  combatio: "Ha combatido", psiquico: "Ha usado su poder", estratagema: "Estratagema activa",
  desmoralizada: "Desmoralizada", llego: "Acaba de llegar de la reserva", retiro: "Se ha retirado del combate",
};

/** Iconos de una unidad, en el orden en que se dibujan. */
export function unitIcons(s: GameState, unitId: string): StatusIcon[] {
  const out: StatusIcon[] = [];
  const u = s.units.find((x) => x.id === unitId);
  if (!u || u.reserve) return out;
  const t = s.turnLog;
  const mv = t.moves[unitId];
  if (mv?.arrived) out.push("llego");
  else if (mv?.kind === "avanzar") out.push("avanzo");
  else if (mv?.kind === "retirarse") out.push("retiro");
  else if (mv) out.push("movio");
  if (t.shot?.[unitId]?.length) out.push("disparo");
  if (t.charges?.[unitId]?.success) out.push("cargo");
  if (t.fought?.includes(unitId)) out.push("combatio");
  if (t.psychic?.some((p) => p.unit === unitId)) out.push("psiquico");
  if (t.strats?.some((x) => x.unit === unitId)) out.push("estratagema");
  if (u.shocked) out.push("desmoralizada");
  return out;
}

const COLORS: Record<StatusIcon, string> = {
  movio: "#cfd8e3", avanzo: "#9fd3ff", disparo: "#ffcf6b", cargo: "#ff8a5b", combatio: "#ff6b6b",
  psiquico: "#c9a3ff", estratagema: "#f2d36b", desmoralizada: "#e0675a", llego: "#7be08a", retiro: "#b8b8b8",
};

function draw(icon: StatusIcon): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(18,20,26,0.82)";
  g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.fill();
  g.strokeStyle = COLORS[icon]; g.fillStyle = COLORS[icon];
  g.lineWidth = 4; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.lineWidth = 3; g.stroke(); g.lineWidth = 5;
  const path = (pts: number[][], close = false) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); if (close) g.closePath(); };
  const star = (n: number, r1: number, r2: number) => {
    const pts: number[][] = [];
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? r2 : r1; pts.push([32 + Math.cos(a) * r, 32 + Math.sin(a) * r]); }
    path(pts, true); g.fill();
  };
  switch (icon) {
    case "movio": path([[18, 32], [44, 32]]); g.stroke(); path([[34, 22], [45, 32], [34, 42]]); g.stroke(); break;
    case "avanzo": path([[16, 20], [28, 32], [16, 44]]); g.stroke(); path([[32, 20], [44, 32], [32, 44]]); g.stroke(); break;
    case "retiro": path([[46, 32], [20, 32]]); g.stroke(); path([[30, 22], [19, 32], [30, 42]]); g.stroke(); break;
    case "llego": path([[32, 16], [32, 42]]); g.stroke(); path([[22, 33], [32, 44], [42, 33]]); g.stroke(); break;
    case "disparo":
      g.beginPath(); g.arc(32, 32, 12, 0, Math.PI * 2); g.lineWidth = 4; g.stroke();
      for (const [a, b, c2, d] of [[32, 12, 32, 22], [32, 42, 32, 52], [12, 32, 22, 32], [42, 32, 52, 32]]) { path([[a, b], [c2, d]]); g.stroke(); }
      break;
    case "cargo": case "combatio":
      path([[18, 18], [46, 46]]); g.stroke(); path([[46, 18], [18, 46]]); g.stroke();
      if (icon === "cargo") { g.lineWidth = 3; path([[14, 30], [22, 22], [30, 14]]); g.stroke(); }
      break;
    case "psiquico": star(4, 20, 6); break;
    case "estratagema": star(5, 19, 8); break;
    case "desmoralizada":
      path([[32, 16], [32, 36]]); g.lineWidth = 7; g.stroke();
      g.beginPath(); g.arc(32, 46, 4, 0, Math.PI * 2); g.fill();
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class StatusIcons {
  readonly group = new THREE.Group();
  enabled = true;
  private mats = new Map<StatusIcon, THREE.SpriteMaterial>();
  private pool: THREE.Sprite[] = [];
  /** Por unidad: iconos y miniaturas, rehecho en cada cambio de estado. */
  private rows: { unit: string; icons: StatusIcon[]; pieces: string[] }[] = [];
  private heights = new Map<string, number>();

  constructor() { this.group.renderOrder = 20; }

  private mat(icon: StatusIcon) {
    let m = this.mats.get(icon);
    if (!m) { m = new THREE.SpriteMaterial({ map: draw(icon), depthTest: false, depthWrite: false, transparent: true }); this.mats.set(icon, m); }
    return m;
  }

  sync(s: GameState) {
    this.rows = [];
    if (!s.rulesMode) return;
    for (const u of s.units) {
      const icons = unitIcons(s, u.id);
      if (!icons.length) continue;
      const pieces = s.pieces.filter((p) => p.unit === u.id).map((p) => p.id);
      if (pieces.length) this.rows.push({ unit: u.id, icons, pieces });
    }
  }

  /** Coloca los iconos sobre cada unidad; `scale` crece al alejar la cámara. */
  update(view: PiecesView, scale = 1) {
    let n = 0;
    if (this.enabled) {
      for (const r of this.rows) {
        let x = 0, z = 0, top = 0, k = 0;
        for (const id of r.pieces) {
          const g = view.groupOf(id);
          if (!g) continue;
          x += g.position.x; z += g.position.z; k++;
          top = Math.max(top, this.heightOf(id, g) + g.position.y);
        }
        if (!k) continue;
        x /= k; z /= k;
        const size = 1.1 * scale, gap = size * 1.05;
        const x0 = x - ((r.icons.length - 1) * gap) / 2;
        r.icons.forEach((icon, i) => {
          let sp = this.pool[n];
          if (!sp) { sp = new THREE.Sprite(); sp.renderOrder = 20; this.pool.push(sp); this.group.add(sp); }
          sp.material = this.mat(icon);
          sp.visible = true;
          sp.scale.setScalar(size);
          sp.position.set(x0 + i * gap, top + 0.75 * scale + 0.2, z);
          sp.userData.label = ICON_LABEL[icon];
          n++;
        });
      }
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  private heightOf(id: string, g: THREE.Object3D): number {
    let h = this.heights.get(id);
    if (h === undefined) {
      const box = new THREE.Box3().setFromObject(g);
      h = Math.max(0.5, box.max.y - g.position.y);
      this.heights.set(id, h);
    }
    return h;
  }
}
