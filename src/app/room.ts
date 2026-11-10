import * as THREE from "three";
import { BOARD } from "../core/state";
import { sfx } from "../audio/sfx";

// La sala (#68): luces de la mesa y condiciones de batalla (noche, tormenta con relámpagos).

export function createRoom(scene: THREE.Scene, BG: THREE.Color) {
  // --- Luz de sala: un foco cálido encima de la mesa y luz ambiente fría -----
  const hemi = new THREE.HemisphereLight("#cfd8e6", "#3a2e26", 0.9);
  const key = new THREE.DirectionalLight("#fff0d8", 2.6);
  key.position.set(-26, 70, 34);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  const sc = key.shadow.camera;
  sc.left = -BOARD.w / 2 - 8; sc.right = BOARD.w / 2 + 22;
  sc.bottom = -BOARD.d / 2 - 8; sc.top = BOARD.d / 2 + 8;
  sc.near = 10; sc.far = 200;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.06;
  const rim = new THREE.DirectionalLight("#9fb4ff", 0.5);
  rim.position.set(40, 30, -50);
  scene.add(hemi, key, key.target, rim);

  // Condiciones de batalla (#68): la sala se oscurece de noche; con tormenta, gris y relámpagos
  let atmo: string | undefined = "?";
  let flashIn = 6, flash = 0;
  const BASE_LIGHT = { hemi: hemi.intensity, key: key.intensity, rim: rim.intensity, keyColor: key.color.clone(), bg: (BG as THREE.Color).clone() };
  function applyAtmosphere(c: string | undefined) {
    if (c === atmo) return;
    atmo = c;
    const night = c === "noche", storm = c === "tormenta";
    hemi.intensity = BASE_LIGHT.hemi * (night ? 0.3 : storm ? 0.65 : 1);
    key.intensity = BASE_LIGHT.key * (night ? 0.35 : storm ? 0.6 : 1);
    rim.intensity = BASE_LIGHT.rim * (night ? 1.6 : 1);
    key.color.copy(BASE_LIGHT.keyColor);
    if (night) key.color.set("#9fb2ff");
    if (storm) key.color.set("#d8dde6");
    const bg = BASE_LIGHT.bg.clone();
    if (night) bg.multiplyScalar(0.45);
    if (storm) bg.lerp(new THREE.Color("#4a5058"), 0.5);
    scene.background = bg;
    (scene.fog as THREE.Fog).color.copy(bg);
    (scene.fog as THREE.Fog).near = night ? 60 : storm ? 80 : 140;
    (scene.fog as THREE.Fog).far = night ? 220 : storm ? 260 : 420;
  }
  function stormTick(dt: number) {
    if (atmo !== "tormenta") return;
    if (flash > 0) {
      flash -= dt;
      key.intensity = BASE_LIGHT.key * (flash > 0 ? 0.6 + 2.2 * Math.max(0, flash / 0.18) : 0.6);
      return;
    }
    flashIn -= dt;
    if (flashIn <= 0) { flash = 0.18; flashIn = 7 + Math.random() * 10; sfx.play("trueno", 1, 0.4 + Math.random() * 0.8); }
  }

  return { hemi, key, rim, applyAtmosphere, stormTick };
}
