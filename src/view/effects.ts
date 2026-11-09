import * as THREE from "three";

// Efectos de combate (#53): trazadoras de los disparos, salpicaduras de ácido, chispas en el
// cuerpo a cuerpo y destellos en los impactos. Todo efímero: se crea, se mueve y se borra.

interface Fx { obj: THREE.Object3D; t: number; dur: number; delay: number; tick: (k: number) => void }

const matCache = new Map<string, THREE.MeshBasicMaterial>();
function mat(color: string, opacity = 1) {
  const key = `${color}|${opacity}`;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }); matCache.set(key, m); }
  return m.clone();
}

export class Effects {
  readonly group = new THREE.Group();
  private fx: Fx[] = [];
  private bolt = new THREE.CylinderGeometry(0.05, 0.05, 1, 5).rotateX(Math.PI / 2);
  private blob = new THREE.IcosahedronGeometry(0.16, 0);
  private flash = new THREE.IcosahedronGeometry(0.3, 0);
  private spark = new THREE.BoxGeometry(0.06, 0.06, 0.35);
  /** Multiplicador de velocidad (dados rápidos = efectos rápidos). */
  speed = 1;

  /** Disparo de a a b; `delay` en segundos. Devuelve cuándo llega (segundos desde ahora). */
  shot(a: THREE.Vector3, b: THREE.Vector3, kind: "bala" | "acido" | "plasma" | "pesado", delay = 0): number {
    const color = kind === "acido" ? "#9be15a" : kind === "plasma" ? "#7fd8ff" : kind === "pesado" ? "#ffb347" : "#ffe08a";
    const geo = kind === "acido" ? this.blob : this.bolt;
    const m = new THREE.Mesh(geo, mat(color, 0.95));
    const len = a.distanceTo(b);
    const dur = Math.max(0.12, len / (kind === "acido" ? 30 : 70));
    if (kind !== "acido") { m.scale.set(kind === "pesado" ? 2 : 1, kind === "pesado" ? 2 : 1, Math.min(2.2, len * 0.25)); m.lookAt(b.clone().sub(a).add(m.position)); }
    m.visible = false;
    const dir = b.clone().sub(a);
    this.add(m, dur, delay, (k) => {
      m.visible = true;
      m.position.copy(a).addScaledVector(dir, k);
      if (kind === "acido") m.position.y += Math.sin(k * Math.PI) * Math.min(3, len * 0.15);
      else m.lookAt(b);
    });
    return delay + dur;
  }

  /** Destello en un impacto (más grande si es una baja). */
  impact(at: THREE.Vector3, delay = 0, big = false, color = "#fff3c4") {
    const m = new THREE.Mesh(this.flash, mat(color, 0.9));
    m.position.copy(at);
    m.visible = false;
    const s0 = big ? 1.6 : 0.8;
    this.add(m, 0.28, delay, (k) => {
      m.visible = true;
      m.scale.setScalar(s0 * (0.4 + k));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    });
  }

  /** Chispas de cuerpo a cuerpo alrededor de un punto. */
  sparks(at: THREE.Vector3, delay = 0, color = "#ffd27a") {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.spark, mat(color, 1));
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      m.visible = false;
      this.add(m, 0.3, delay + i * 0.02, (k) => {
        m.visible = true;
        m.position.copy(at).addScaledVector(dir, 0.2 + k * 1.2);
        m.lookAt(at.clone().addScaledVector(dir, 3));
        (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      });
    }
  }

  private add(obj: THREE.Object3D, dur: number, delay: number, tick: (k: number) => void) {
    this.group.add(obj);
    this.fx.push({ obj, t: 0, dur, delay, tick });
  }

  update(dt: number) {
    const d = dt * this.speed;
    for (const f of this.fx) {
      if (f.delay > 0) { f.delay -= d; continue; }
      f.t += d;
      f.tick(Math.min(1, f.t / f.dur));
    }
    const done = this.fx.filter((f) => f.delay <= 0 && f.t >= f.dur);
    for (const f of done) {
      this.group.remove(f.obj);
      ((f.obj as THREE.Mesh).material as THREE.Material)?.dispose?.();
    }
    this.fx = this.fx.filter((f) => !(f.delay <= 0 && f.t >= f.dur));
  }
}
