import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Ayudantes low poly, en la línea de Señorío: color plano, materiales cacheados por color
// y cada modelo fusionado en una malla por color (pocas llamadas de dibujo).

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: string, emissive = false): THREE.MeshStandardMaterial {
  const key = color + (emissive ? "*" : "");
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: 0.82, metalness: 0.05,
      emissive: emissive ? new THREE.Color(color) : new THREE.Color(0), emissiveIntensity: emissive ? 0.9 : 0,
    });
    cache.set(key, m);
  }
  return m;
}

/** Pieza suelta: geometría + color, ya colocada. Se fusiona después con `build`. */
export interface Part { geo: THREE.BufferGeometry; color: string; glow?: boolean }

export function place(geo: THREE.BufferGeometry, color: string,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, glow = false): Part {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
  g.deleteAttribute("uv");
  return { geo: g, color, glow };
}

/** Caja con la base en `y` (no centrada), como en Señorío. */
export function box(w: number, h: number, d: number, color: string,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): Part {
  return place(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, rx, ry, rz);
}

export type V3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

/** Geometría colocada de modo que su eje Y vaya de `a` a `b` (para huesos y armas). */
function along(geo: THREE.BufferGeometry, a: V3, b: V3, color: string, glow = false): Part {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length() || 1e-4;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const m = new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1));
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
  g.deleteAttribute("uv");
  return { geo: g, color, glow };
}

/** Prisma de sección w × d entre dos puntos (un hueso, un cañón, una hoja). */
export function segment(a: V3, b: V3, w: number, d: number, color: string, glow = false): Part {
  return along(new THREE.BoxGeometry(w, 1, d), a, b, color, glow);
}

/** Cono de `a` (base, radio r) a `b` (punta), con pocas caras. */
export function spike(a: V3, b: V3, r: number, color: string, sides = 5): Part {
  return along(new THREE.ConeGeometry(r, 1, sides), a, b, color);
}

/** Material único con color por vértice (mismo acabado que `mat`). */
let vcMat: THREE.MeshStandardMaterial | null = null;
export function vertexColorMat(): THREE.MeshStandardMaterial {
  return vcMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.05 });
}

const tmpColor = new THREE.Color();
/** Copia la geometría con un atributo de color uniforme (en espacio lineal, como `mat`). */
function painted(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  tmpColor.set(color);
  const n = geo.getAttribute("position").count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = tmpColor.r; c[i * 3 + 1] = tmpColor.g; c[i * 3 + 2] = tmpColor.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return geo;
}

/**
 * Fusiona las piezas en un grupo: todo lo de color plano en UNA malla con color por vértice
 * (una llamada de dibujo y una de sombra por modelo, #58) y lo que brilla, aparte por color.
 */
export function build(parts: Part[], shadows = true): THREE.Group {
  const g = new THREE.Group();
  const flat = parts.filter((p) => !p.glow);
  if (flat.length) {
    const merged = mergeGeometries(flat.map((p) => painted(p.geo, p.color)), false)!;
    const mesh = new THREE.Mesh(merged, vertexColorMat());
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    g.add(mesh);
  }
  const glowBy = new Map<string, THREE.BufferGeometry[]>();
  for (const p of parts) if (p.glow) {
    if (!glowBy.has(p.color)) glowBy.set(p.color, []);
    glowBy.get(p.color)!.push(p.geo);
  }
  for (const [color, geos] of glowBy) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, mat(color, true));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    g.add(mesh);
  }
  for (const p of parts) p.geo.dispose();
  return g;
}
