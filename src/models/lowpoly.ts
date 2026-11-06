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

/** Fusiona las piezas en un grupo con una malla por color. */
export function build(parts: Part[], shadows = true): THREE.Group {
  const byColor = new Map<string, THREE.BufferGeometry[]>();
  for (const p of parts) {
    const k = p.color + (p.glow ? "*" : "");
    if (!byColor.has(k)) byColor.set(k, []);
    byColor.get(k)!.push(p.geo);
  }
  const g = new THREE.Group();
  for (const [k, geos] of byColor) {
    const merged = mergeGeometries(geos, false)!;
    const mesh = new THREE.Mesh(merged, mat(k.replace("*", ""), k.endsWith("*")));
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    g.add(mesh);
    for (const geo of geos) geo.dispose();
  }
  return g;
}
