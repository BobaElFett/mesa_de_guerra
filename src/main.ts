import * as THREE from "three";
import { CommandBus } from "./core/commands";
import { freshSeed } from "./core/rng";
import { readTable, writeTable } from "./core/save";
import { BOARD } from "./core/state";
import { TableCamera } from "./camera/tableCamera";
import { Table } from "./world/table";
import { PiecesView } from "./view/piecesView";
import { DragControls } from "./input/dragControls";
import { Hud } from "./ui/hud";

// --- Renderer y escena ---------------------------------------------------
const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const BG = new THREE.Color("#17191e");
scene.background = BG;
scene.fog = new THREE.Fog(BG, 140, 420);

// --- Luz de sala: un foco cálido encima de la mesa y luz ambiente fría -----
const hemi = new THREE.HemisphereLight("#cfd8e6", "#3a2e26", 0.9);
const key = new THREE.DirectionalLight("#fff0d8", 2.6);
key.position.set(-26, 70, 34);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
const sc = key.shadow.camera;
sc.left = -BOARD.w / 2 - 8; sc.right = BOARD.w / 2 + 8;
sc.bottom = -BOARD.d / 2 - 8; sc.top = BOARD.d / 2 + 8;
sc.near = 10; sc.far = 200;
key.shadow.bias = -0.0012;
key.shadow.normalBias = 0.06;
const rim = new THREE.DirectionalLight("#9fb4ff", 0.5);
rim.position.set(40, 30, -50);
scene.add(hemi, key, key.target, rim);

// --- Mesa, estado y miniaturas -------------------------------------------
const table = new Table();
scene.add(table.group);

const saved = readTable();
const bus = saved ? CommandBus.restore(saved) : new CommandBus(freshSeed());

const pieces = new PiecesView();
scene.add(pieces.group);

const cam = new TableCamera(renderer.domElement);
const drag = new DragControls(renderer.domElement, cam.camera, pieces, bus);

let gridOn = true;
const hud = new Hud(bus, {
  toggleGrid: () => { gridOn = !gridOn; table.setGridVisible(gridOn); return gridOn; },
  toggleTopDown: () => { cam.topDown = !cam.topDown; return cam.topDown; },
  newTable: () => { bus.reset(freshSeed()); cam.reset(); },
});
drag.onDragInfo = (inches, x, y) => hud.showMeasure(inches, x, y);

function refresh() {
  pieces.sync(bus.state);
  hud.render(bus.state);
  writeTable(bus.serialize());
}
bus.onChange(refresh);
refresh();

// --- Teclado -------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.tagName === "INPUT") return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); bus.undo(); return; }
  if (mod && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) { e.preventDefault(); bus.redo(); return; }
  if (mod) return;
  if (e.code === "KeyG") { gridOn = !gridOn; table.setGridVisible(gridOn); document.getElementById("grid")!.classList.toggle("on", gridOn); }
  if (e.code === "KeyV") document.getElementById("topdown")!.classList.toggle("on", cam.topDown);
  if (e.code === "Space") { e.preventDefault(); hud.rollNow(); }
  if (e.code === "Equal" || e.code === "NumpadAdd") hud.rollMore(1);
  if (e.code === "Minus" || e.code === "NumpadSubtract") hud.rollMore(-1);
  if (e.code === "Enter") bus.dispatch({ type: "endTurn" });
  // R: girar 45° la miniatura bajo el ratón (Mayús: al revés)
  if (e.code === "KeyR" && drag.active) {
    const p = pieces.pieceOf(drag.active);
    if (p) bus.dispatch({ type: "rotate", id: p.id, rot: p.rot + (e.shiftKey ? -1 : 1) * Math.PI / 4 });
  }
});

// --- Bucle ---------------------------------------------------------------
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  cam.update(dt);
  pieces.update(dt);
  pieces.highlight(drag.active);
  renderer.render(scene, cam.camera);
});

// Para pruebas desde la consola
(window as unknown as { mesa: unknown }).mesa = { bus, cam, pieces };
