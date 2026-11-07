import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RollRecord } from "../core/state";
import { TRAY } from "../world/table";

// Dados en 3D en la bandeja. El resultado lo decide el estado (dados con semilla); esto solo
// lo enseña: se simula una tirada con física sencilla, se mira qué cara quedó arriba y se gira
// el dibujo del dado para que esa cara sea el resultado. Así la animación nunca contradice al estado.

const S = 0.62;            // lado del dado (16 mm)
const H = S / 2;
const G = 140;             // gravedad «de mesa» en pulgadas/s² (la real, 386, es demasiado rápida para verla)
const DT = 1 / 240;
const MAX_T = 3.2;         // segundos simulados como mucho
const SETTLE_STEPS = 60;   // pasos para asentar el dado plano al final
const INERTIA = (S * S) / 6;

// Cara → normal local. Las opuestas suman 7.
const FACE_NORMAL: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 1, 0), 6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(1, 0, 0), 5: new THREE.Vector3(-1, 0, 0),
  3: new THREE.Vector3(0, 0, 1), 4: new THREE.Vector3(0, 0, -1),
};
const NORMALS = Object.values(FACE_NORMAL);
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]], 5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};
const UP = new THREE.Vector3(0, 1, 0);

function dieGeometries(): { body: THREE.BufferGeometry; pips: THREE.BufferGeometry } {
  const body = new THREE.BoxGeometry(S, S, S);
  const parts: THREE.BufferGeometry[] = [];
  const step = S * 0.27, pip = S * 0.16;
  for (let v = 1; v <= 6; v++) {
    const n = FACE_NORMAL[v];
    // Dos ejes sobre la cara
    const u = Math.abs(n.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const w = new THREE.Vector3().crossVectors(n, u);
    for (const [a, b] of PIPS[v]) {
      const g = new THREE.BoxGeometry(pip, pip, pip);
      const c = n.clone().multiplyScalar(H - pip / 2 + 0.012).addScaledVector(u, a * step).addScaledVector(w, b * step);
      g.translate(c.x, c.y, c.z);
      parts.push(g);
    }
  }
  return { body, pips: mergeGeometries(parts)! };
}

interface Frame { p: THREE.Vector3; q: THREE.Quaternion }

interface Die {
  outer: THREE.Group;           // posición y giro «físicos»
  inner: THREE.Group;           // giro fijo que pone el resultado arriba
  body: THREE.Mesh;
  value: number;
  frames: Frame[];              // animación pregrabada (vacía si está quieto)
  rest: Frame;                  // pose final
  topLocal: THREE.Vector3;      // normal local que quedó arriba en la simulación
}

interface Body { p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; w: THREE.Vector3; still: number }

export class DiceTray {
  readonly group = new THREE.Group();
  /** Índices de los dados marcados para repetir. */
  readonly marked = new Set<number>();
  onMarkedChange: () => void = () => {};

  private dice: Die[] = [];
  private geos = dieGeometries();
  private matBody = new THREE.MeshStandardMaterial({ color: "#ece6d8", flatShading: true, roughness: 0.55 });
  private matMarked = new THREE.MeshStandardMaterial({ color: "#f0c94a", flatShading: true, roughness: 0.55, emissive: new THREE.Color("#5a4410") });
  private matPips = new THREE.MeshStandardMaterial({ color: "#1d1e24", roughness: 0.8 });
  private shownKey = "";
  private t = 0;
  private playing = false;
  private sortT = -1;
  private sortFrom: Frame[] = [];
  private sortTo: Frame[] = [];

  get count() { return this.dice.length; }
  get busy() { return this.playing; }

  /** Muestra la última tirada: animada si es nueva, quieta si viene de deshacer o de cargar. */
  show(roll: RollRecord | undefined, animate: boolean, rethrow: number[] | null = null) {
    const key = roll ? `${roll.turn}:${roll.player}:${roll.results.join("")}:${(roll.rerolled ?? []).join(",")}` : "";
    if (key === this.shownKey && !animate) return;
    this.shownKey = key;
    if (!roll) { this.clear(); return; }

    if (rethrow && rethrow.length && this.dice.length === roll.results.length) {
      // Solo se lanzan otra vez los marcados; el resto se queda donde está
      const statics = this.dice.filter((_, i) => !rethrow.includes(i)).map((d) => d.rest.p);
      const sims = simulate(rethrow.length, statics);
      rethrow.forEach((i, k) => this.place(this.dice[i], roll.results[i], sims[k]));
    } else {
      this.clear();
      const sims = animate ? simulate(roll.results.length, []) : restLayout(roll.results.length);
      roll.results.forEach((v, i) => {
        const d = this.makeDie();
        this.dice.push(d);
        this.place(d, v, sims[i]);
      });
    }
    this.marked.clear();
    this.onMarkedChange();
    this.applyMarks();
    this.t = 0;
    this.sortT = -1;
    this.playing = animate;
    if (!animate) for (const d of this.dice) this.pose(d, d.rest);
  }

  clear() {
    for (const d of this.dice) this.group.remove(d.outer);
    this.dice = [];
    this.marked.clear();
    this.playing = false;
    this.onMarkedChange();
  }

  /** Quita los dados de la bandeja (la tirada sigue en el registro). */
  remove() { this.clear(); this.shownKey = "removed"; }

  /** Coloca los dados en filas por resultado, de mayor a menor. */
  sort() {
    if (!this.dice.length || this.playing) return;
    const order = this.dice.map((d, i) => ({ d, i })).sort((a, b) => b.d.value - a.d.value || a.i - b.i);
    const perRow = Math.floor((TRAY.w - 0.6) / (S + 0.22));
    const x0 = TRAY.x - TRAY.w / 2 + 0.3 + H, z0 = TRAY.z - TRAY.d / 2 + 0.3 + H;
    const to: Frame[] = new Array(this.dice.length);
    let row = 0, col = 0, last = -1;
    for (const { d, i } of order) {
      if (last !== -1 && (d.value !== last || col >= perRow)) { row++; col = 0; }
      last = d.value;
      const q = new THREE.Quaternion().setFromUnitVectors(d.topLocal, UP);
      to[i] = { p: new THREE.Vector3(x0 + col * (S + 0.22), TRAY.floorY + H, z0 + row * (S + 0.3)), q };
      col++;
    }
    this.sortFrom = this.dice.map((d) => ({ p: d.outer.position.clone(), q: d.outer.quaternion.clone() }));
    this.sortTo = to;
    this.sortT = 0;
  }

  /** Clic: marca o desmarca el dado bajo el ratón. Devuelve si había un dado. */
  toggleAt(hits: THREE.Intersection[]): boolean {
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.dieIndex === undefined) o = o.parent;
      if (o) {
        const i = o.userData.dieIndex as number;
        if (this.marked.has(i)) this.marked.delete(i); else this.marked.add(i);
        this.applyMarks();
        this.onMarkedChange();
        return true;
      }
    }
    return false;
  }

  /** Marca los dados con resultado ≤ v (p. ej. los fallos). */
  markAtMost(v: number) {
    this.marked.clear();
    this.dice.forEach((d, i) => { if (d.value <= v) this.marked.add(i); });
    this.applyMarks();
    this.onMarkedChange();
  }

  pickables(): THREE.Object3D[] { return this.dice.map((d) => d.outer); }

  /** Pose actual de cada dado: qué valor enseña arriba (para pruebas). */
  faceUpValues(): number[] {
    return this.dice.map((d) => {
      const q = new THREE.Quaternion().multiplyQuaternions(d.outer.quaternion, d.inner.quaternion);
      let best = 0, bestY = -2;
      for (let v = 1; v <= 6; v++) {
        const y = FACE_NORMAL[v].clone().applyQuaternion(q).y;
        if (y > bestY) { bestY = y; best = v; }
      }
      return best;
    });
  }

  update(dt: number) {
    if (this.playing) {
      this.t += dt;
      const f = Math.floor(this.t / DT);
      let done = true;
      for (const d of this.dice) {
        if (!d.frames.length) continue;
        if (f < d.frames.length) { this.pose(d, d.frames[f]); done = false; }
        else this.pose(d, d.rest);
      }
      if (done) {
        this.playing = false;
        for (const d of this.dice) d.frames = [];
      }
    }
    if (this.sortT >= 0) {
      this.sortT = Math.min(1, this.sortT + dt / 0.35);
      const k = this.sortT * this.sortT * (3 - 2 * this.sortT);
      this.dice.forEach((d, i) => {
        d.outer.position.lerpVectors(this.sortFrom[i].p, this.sortTo[i].p, k);
        d.outer.quaternion.slerpQuaternions(this.sortFrom[i].q, this.sortTo[i].q, k);
      });
      if (this.sortT >= 1) {
        this.dice.forEach((d, i) => { d.rest = { p: this.sortTo[i].p.clone(), q: this.sortTo[i].q.clone() }; });
        this.sortT = -1;
      }
    }
  }

  // --- Interno -----------------------------------------------------------
  private makeDie(): Die {
    const outer = new THREE.Group(), inner = new THREE.Group();
    const body = new THREE.Mesh(this.geos.body, this.matBody);
    const pips = new THREE.Mesh(this.geos.pips, this.matPips);
    body.castShadow = true;
    inner.add(body, pips);
    outer.add(inner);
    outer.userData.dieIndex = this.dice.length;
    this.group.add(outer);
    return { outer, inner, body, value: 1, frames: [], rest: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, topLocal: UP.clone() };
  }

  private place(d: Die, value: number, sim: SimResult) {
    d.value = value;
    d.frames = sim.frames;
    d.rest = sim.rest;
    d.topLocal = sim.topLocal;
    // Gira el dibujo para que la cara `value` caiga donde quedó la cara de arriba
    d.inner.quaternion.setFromUnitVectors(FACE_NORMAL[value], sim.topLocal);
  }

  private pose(d: Die, f: Frame) {
    d.outer.position.copy(f.p);
    d.outer.quaternion.copy(f.q);
  }

  private applyMarks() {
    this.dice.forEach((d, i) => { d.body.material = this.marked.has(i) ? this.matMarked : this.matBody; });
  }
}

// --- Simulación ------------------------------------------------------------

interface SimResult { frames: Frame[]; rest: Frame; topLocal: THREE.Vector3 }

const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new THREE.Vector3(x * H, y * H, z * H))));

/** Lanza `n` dados desde el borde de la bandeja; `statics` son dados quietos (obstáculos). */
function simulate(n: number, statics: THREE.Vector3[]): SimResult[] {
  const xmin = TRAY.x - TRAY.w / 2, xmax = TRAY.x + TRAY.w / 2;
  const zmin = TRAY.z - TRAY.d / 2, zmax = TRAY.z + TRAY.d / 2;
  const bodies: Body[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % 6, row = Math.floor(i / 6);
    bodies.push({
      p: new THREE.Vector3(xmin + 1.2 + col * 1.4 + Math.random() * 0.4, TRAY.floorY + 2.5 + row * 0.8 + Math.random(), zmax - 1 - (row % 3) * 0.9),
      v: new THREE.Vector3((Math.random() - 0.5) * 8, -2 - Math.random() * 3, -14 - Math.random() * 10),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3)),
      w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30),
      still: 0,
    });
  }
  const frames: Frame[][] = bodies.map(() => []);
  const c = new THREE.Vector3(), r = new THREE.Vector3(), tmp = new THREE.Vector3();
  const R = H * 1.1;

  // Contacto de la esquina más hundida con un plano (normal n, a distancia `off` del origen)
  const contact = (b: Body, n: THREE.Vector3, off: number, e: number) => {
    let worst = Infinity, wr: THREE.Vector3 | null = null;
    for (const k of CORNERS) {
      c.copy(k).applyQuaternion(b.q);
      const depth = c.dot(n) + b.p.dot(n) - off;
      if (depth < worst) { worst = depth; wr = c.clone(); }
    }
    if (worst >= 0 || !wr) return false;
    b.p.addScaledVector(n, -worst);
    r.copy(wr);
    const vp = tmp.crossVectors(b.w, r).add(b.v);           // velocidad del punto de contacto
    const vn = vp.dot(n);
    if (vn < 0) {
      const rn = new THREE.Vector3().crossVectors(r, n);
      const j = (-(1 + e) * vn) / (1 + rn.lengthSq() / INERTIA);
      b.v.addScaledVector(n, j);
      b.w.addScaledVector(rn, j / INERTIA);
      // Rozamiento: frena el deslizamiento y lo convierte en giro
      const vt = vp.clone().addScaledVector(n, -vn).multiplyScalar(-0.25);
      b.v.add(vt);
      b.w.add(new THREE.Vector3().crossVectors(r, vt).multiplyScalar(1 / INERTIA));
    }
    return true;
  };

  const floorN = new THREE.Vector3(0, 1, 0);
  const walls: [THREE.Vector3, number][] = [
    [new THREE.Vector3(1, 0, 0), xmin], [new THREE.Vector3(-1, 0, 0), -xmax],
    [new THREE.Vector3(0, 0, 1), zmin], [new THREE.Vector3(0, 0, -1), -zmax],
  ];

  const steps = Math.round(MAX_T / DT);
  let s = 0;
  for (; s < steps; s++) {
    for (const b of bodies) {
      b.v.y -= G * DT;
      b.p.addScaledVector(b.v, DT);
      const wq = new THREE.Quaternion(b.w.x, b.w.y, b.w.z, 0).multiply(b.q);
      b.q.set(b.q.x + 0.5 * DT * wq.x, b.q.y + 0.5 * DT * wq.y, b.q.z + 0.5 * DT * wq.z, b.q.w + 0.5 * DT * wq.w).normalize();
      const onFloor = contact(b, floorN, TRAY.floorY, 0.35);
      for (const [n, off] of walls) contact(b, n, off, 0.4);
      if (onFloor) { b.w.multiplyScalar(0.985); b.v.x *= 0.995; b.v.z *= 0.995; }
      b.w.multiplyScalar(0.999);
      const slow = b.v.length() < 0.6 && b.w.length() < 1.2 && onFloor;
      b.still = slow ? b.still + 1 : 0;
    }
    // Choques entre dados (como esferas) y con los dados quietos
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) collide(a, bodies[j], R);
      for (const p of statics) collideStatic(a, p, R);
    }
    bodies.forEach((b, i) => frames[i].push({ p: b.p.clone(), q: b.q.clone() }));
    if (bodies.every((b) => b.still > 40)) break;
  }

  // Asentado: cada dado se gira hasta quedar plano sobre la cara más hacia arriba
  // y se aparta de los demás si había quedado encima de otro
  const placed: [number, number][] = statics.map((p) => [p.x, p.z]);
  const MIN = S * 1.5;   // un dado girado ocupa hasta S·√2 de diagonal
  return bodies.map((b, i) => {
    let top = NORMALS[0], best = -2;
    for (const n of NORMALS) {
      const y = n.clone().applyQuaternion(b.q).y;
      if (y > best) { best = y; top = n; }
    }
    const fix = new THREE.Quaternion().setFromUnitVectors(top.clone().applyQuaternion(b.q), UP);
    const restQ = fix.multiply(b.q.clone());
    const [rx, rz] = freeSpot(b.p.x, b.p.z, placed, MIN, xmin + R, xmax - R, zmin + R, zmax - R);
    placed.push([rx, rz]);
    const restP = new THREE.Vector3(rx, TRAY.floorY + H, rz);
    const from = frames[i].at(-1) ?? { p: b.p.clone(), q: b.q.clone() };
    for (let k = 1; k <= SETTLE_STEPS; k++) {
      const t = k / SETTLE_STEPS, e = t * t * (3 - 2 * t);
      frames[i].push({ p: from.p.clone().lerp(restP, e), q: from.q.clone().slerp(restQ, e) });
    }
    return { frames: frames[i], rest: { p: restP, q: restQ }, topLocal: top.clone() };
  });
}

/** Hueco libre más cercano dentro de la bandeja (búsqueda en anillos). */
function freeSpot(x: number, z: number, placed: [number, number][], min: number,
  x0: number, x1: number, z0: number, z1: number): [number, number] {
  const ok = (px: number, pz: number) => px >= x0 && px <= x1 && pz >= z0 && pz <= z1
    && placed.every(([qx, qz]) => Math.hypot(px - qx, pz - qz) >= min);
  const cx = THREE.MathUtils.clamp(x, x0, x1), cz = THREE.MathUtils.clamp(z, z0, z1);
  if (ok(cx, cz)) return [cx, cz];
  for (let ring = 1; ring <= 150; ring++) {
    const rad = ring * 0.08, n = Math.max(8, Math.ceil((2 * Math.PI * rad) / 0.08));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = cx + Math.cos(a) * rad, pz = cz + Math.sin(a) * rad;
      if (ok(px, pz)) return [px, pz];
    }
  }
  return [cx, cz];
}

function collide(a: Body, b: Body, R: number) {
  const d = new THREE.Vector3().subVectors(b.p, a.p);
  const dist = d.length();
  if (dist >= 2 * R || dist < 1e-6) return;
  const n = d.multiplyScalar(1 / dist);
  const push = (2 * R - dist) / 2;
  a.p.addScaledVector(n, -push);
  b.p.addScaledVector(n, push);
  const rel = new THREE.Vector3().subVectors(b.v, a.v).dot(n);
  if (rel < 0) {
    const j = -(1 + 0.3) * rel / 2;
    a.v.addScaledVector(n, -j);
    b.v.addScaledVector(n, j);
  }
}

function collideStatic(a: Body, p: THREE.Vector3, R: number) {
  const d = new THREE.Vector3().subVectors(a.p, p);
  d.y = Math.max(0, d.y);
  const dist = d.length();
  if (dist >= 2 * R || dist < 1e-6) return;
  const n = d.multiplyScalar(1 / dist);
  a.p.addScaledVector(n, 2 * R - dist);
  const vn = a.v.dot(n);
  if (vn < 0) a.v.addScaledVector(n, -(1 + 0.3) * vn);
}

/** Dados ya quietos en cuadrícula (al cargar o deshacer: sin animación). */
function restLayout(n: number): SimResult[] {
  const perRow = Math.floor((TRAY.w - 0.6) / (S + 0.35));
  const out: SimResult[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % perRow, row = Math.floor(i / perRow);
    const p = new THREE.Vector3(TRAY.x - TRAY.w / 2 + 0.5 + H + col * (S + 0.35), TRAY.floorY + H, TRAY.z - TRAY.d / 2 + 0.5 + H + row * (S + 0.45));
    const q = new THREE.Quaternion().setFromAxisAngle(UP, ((i * 37) % 30 - 15) * Math.PI / 180);
    out.push({ frames: [], rest: { p, q }, topLocal: UP.clone() });
  }
  return out;
}
