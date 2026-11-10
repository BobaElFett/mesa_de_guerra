import * as THREE from "three";
import { GameState, Piece } from "../core/state";
import { DATASHEETS, pieceWeaponIds, WEAPONS } from "../rules/datasheets";
import { reach } from "../rules/conditions";
import { disc, gap, sight, Sight } from "../rules/geometry";

// Línea de visión al apuntar (#60): desde cada miniatura propia a la miniatura objetivo más
// cercana que ve. Verde: la ve; naranja: la ve, pero con cobertura; rojo: no ve a ninguna;
// gris discontinuo: la ve, pero no llega con ninguna de sus armas a distancia.

const COLORS: Record<Sight | "lejos", string> = { visible: "#6dff8a", cobertura: "#ffb34a", oculta: "#ff4a3a", lejos: "#9aa3b2" };

export class LosView {
  readonly group = new THREE.Group();
  private mats = Object.fromEntries(Object.entries(COLORS).map(([k, c]) => [k, k === "lejos"
    ? new THREE.LineDashedMaterial({ color: c, dashSize: 0.6, gapSize: 0.45, transparent: true, opacity: 0.8, depthTest: false })
    : new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthTest: false })])) as Record<Sight | "lejos", THREE.LineBasicMaterial>;
  private key = "";
  /** Recuento de la última vista: cuántas tiradoras ven, con cobertura y no ven. */
  summary = { visible: 0, cobertura: 0, oculta: 0, lejos: 0 };

  update(s: GameState, shooters: string[] | null, target: string | null) {
    const on = !!(shooters && target && s.rulesMode && s.phase === "disparo");
    const key = on ? `${shooters!.join(",")}>${target}|${s.pieces.length}|${s.pieces.reduce((a, p) => a + p.x * 3 + p.z, 0).toFixed(2)}` : "";
    if (key === this.key) return;
    this.key = key;
    this.clear();
    this.summary = { visible: 0, cobertura: 0, oculta: 0, lejos: 0 };
    if (!on) return;
    const tps = s.pieces.filter((p) => p.unit === target);
    const own = s.pieces.filter((p) => shooters!.includes(p.unit ?? ""));
    if (!tps.length) return;
    for (const a of own) {
      const u = s.units.find((x) => x.id === a.unit)!;
      const reachIn = Math.max(0, ...s.pieces.filter((q) => q.id === a.id).flatMap((q) => pieceWeaponIds(DATASHEETS[u.datasheet], q)).map((w) => reach(s, WEAPONS[w])));
      if (!reachIn) continue;
      let best: { p: Piece; s: Sight; d: number } | null = null;
      let nearest: { p: Piece; d: number } | null = null;
      for (const b of tps) {
        const d = gap(disc(a), disc(b));
        if (!nearest || d < nearest.d) nearest = { p: b, d };
        const sg = sight(disc(a), disc(b), s.terrain);
        if (sg === "oculta") continue;
        const better = !best || (best.s === "cobertura" && sg === "visible") || (best.s === sg && d < best.d);
        if (better) best = { p: b, s: sg, d };
      }
      const kind: Sight | "lejos" = best ? (best.d > reachIn ? "lejos" : best.s) : "oculta";
      this.summary[kind]++;
      const to = best?.p ?? nearest!.p;
      this.line(a, to, kind);
    }
  }

  private line(a: Piece, b: Piece, kind: Sight | "lejos") {
    const y = 1.1;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(b.x, y, b.z)]);
    const l = new THREE.Line(geo, this.mats[kind]);
    if (kind === "lejos") l.computeLineDistances();
    l.renderOrder = 26;
    this.group.add(l);
  }

  private clear() {
    for (const c of [...this.group.children]) { this.group.remove(c); (c as THREE.Line).geometry.dispose(); }
  }
}
