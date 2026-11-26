import * as THREE from "three";
import { GameState } from "../core/state";
import { DATASHEETS } from "../rules/datasheets";
import type { PiecesView } from "./piecesView";

// Vida de las miniaturas dañadas: una barra con las heridas que le quedan («3/11») flota sobre
// cada miniatura que ha perdido alguna herida y sigue en pie.

/** Miniaturas dañadas: id, heridas que le quedan y su máximo. */
export function woundedModels(s: GameState): { id: string; left: number; max: number }[] {
  const out: { id: string; left: number; max: number }[] = [];
  for (const p of s.pieces) {
    if (!p.unit || !(p.damage ?? 0)) continue;
    const u = s.units.find((x) => x.id === p.unit);
    const ds = u ? DATASHEETS[u.datasheet] : undefined;
    if (!ds) continue;
    const max = ds.profile.W;
    const left = Math.max(0, max - (p.damage ?? 0));
    if (left > 0 && left < max) out.push({ id: p.id, left, max });
  }
  return out;
}

/** Verde con toda la vida, ámbar a la mitad, rojo al final. */
export function woundColor(left: number, max: number): string {
  const f = left / max;
  return f > 0.66 ? "#6fdc7a" : f > 0.33 ? "#f2c14e" : "#ef5b4f";
}

function draw(left: number, max: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 48;
  const g = c.getContext("2d")!;
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  };
  g.fillStyle = "rgba(18,20,26,0.85)";
  round(2, 2, 124, 44, 10); g.fill();
  // Barra: un tramo por herida si caben; si no, continua
  const bx = 8, by = 30, bw = 112, bh = 10, col = woundColor(left, max);
  g.fillStyle = "rgba(255,255,255,0.12)";
  round(bx, by, bw, bh, 4); g.fill();
  g.fillStyle = col;
  if (max <= 16) {
    const seg = bw / max;
    for (let i = 0; i < left; i++) { round(bx + i * seg + 1, by, seg - 2, bh, 2); g.fill(); }
  } else { round(bx, by, (bw * left) / max, bh, 4); g.fill(); }
  g.fillStyle = "#f3f4f6";
  g.font = "bold 24px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(`${left}/${max}`, 64, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class WoundBars {
  readonly group = new THREE.Group();
  enabled = true;
  private mats = new Map<string, THREE.SpriteMaterial>();
  private pool: THREE.Sprite[] = [];
  private rows: { id: string; key: string }[] = [];
  private heights = new Map<string, number>();

  constructor() { this.group.renderOrder = 21; }

  private mat(left: number, max: number) {
    const key = `${left}/${max}`;
    let m = this.mats.get(key);
    if (!m) { m = new THREE.SpriteMaterial({ map: draw(left, max), depthTest: false, depthWrite: false, transparent: true }); this.mats.set(key, m); }
    return m;
  }

  sync(s: GameState) {
    this.rows = woundedModels(s).map((w) => { this.mat(w.left, w.max); return { id: w.id, key: `${w.left}/${w.max}` }; });
  }

  /** Coloca cada barra sobre su miniatura; `scale` crece al alejar la cámara. */
  update(view: PiecesView, scale = 1) {
    let n = 0;
    if (this.enabled) {
      for (const r of this.rows) {
        const g = view.groupOf(r.id);
        if (!g || !g.visible) continue;
        let sp = this.pool[n];
        if (!sp) { sp = new THREE.Sprite(); sp.renderOrder = 21; this.pool.push(sp); this.group.add(sp); }
        sp.material = this.mats.get(r.key)!;
        sp.visible = true;
        const h = 0.8 * scale;
        sp.scale.set(h * (128 / 48), h, 1);
        sp.position.set(g.position.x, g.position.y + this.heightOf(r.id, g) + 0.45 * scale, g.position.z);
        sp.userData.label = `Heridas: ${r.key}`;
        n++;
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
