import * as THREE from "three";
import { makeMiniature } from "../../src/models/miniatures";

// Galería de miniaturas para revisarlas de cerca (no forma parte del juego):
// npx esbuild tools/gallery/gal.ts --bundle --outfile=… y abrir con ?k=legionario,garra&leader=1
const params = new URLSearchParams(location.search);
const kinds = (params.get("k") ?? "legionario,capitan,pesado,exterminador").split(",");
const leader = params.get("leader") === "1";
const pose = Number(params.get("pose") ?? 0);
const cols = Number(params.get("cols") ?? 4);
const W = 1600, H = 900;
const rows = Math.ceil(kinds.length / cols);
const cw = W / cols, ch = H / rows;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.shadowMap.enabled = true; r.outputColorSpace = THREE.SRGBColorSpace;
r.toneMapping = THREE.ACESFilmicToneMapping;
r.setScissorTest(true);
document.body.style.margin = "0"; document.body.appendChild(r.domElement);
kinds.forEach((k, i) => {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(i % 2 ? "#1d2026" : "#20232a");
  scene.add(new THREE.HemisphereLight("#cfd8ff", "#3a3326", 1.1));
  const key = new THREE.DirectionalLight("#fff2dc", 2.4); key.position.set(4, 8, 6); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#9fb8ff", 0.8); rim.position.set(-5, 4, -6); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: "#3a3f36" }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const m = makeMiniature(k as never, pose, leader);
  m.rotation.y = Number(params.get("rot") ?? 0.6);
  m.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  scene.add(m);
  const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const rad = Math.max(size.x, size.y, size.z) * 0.62;
  const cam = new THREE.PerspectiveCamera(35, cw / ch, 0.05, 200);
  const d = rad / Math.tan((35 * Math.PI) / 360) * 1.05;
  cam.position.set(c.x + d * 0.25, c.y + d * 0.45, c.z + d * 0.86); cam.lookAt(c);
  const x = (i % cols) * cw, yy = H - (Math.floor(i / cols) + 1) * ch;
  r.setViewport(x, yy, cw, ch); r.setScissor(x, yy, cw, ch);
  r.render(scene, cam);
});
(window as unknown as { done: boolean }).done = true;
