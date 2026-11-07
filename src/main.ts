import * as THREE from "three";
import { CommandBus } from "./core/commands";
import { freshSeed } from "./core/rng";
import { readTable, writeTable } from "./core/save";
import { BOARD } from "./core/state";
import { TableCamera } from "./camera/tableCamera";
import { Table } from "./world/table";
import { PiecesView } from "./view/piecesView";
import { PieceControls } from "./input/pieceControls";
import { Picker } from "./input/picker";
import { TapeMeasure } from "./tools/tapeMeasure";
import { RangeRings } from "./view/rangeRings";
import { RANGES } from "./core/measure";
import { DiceTray } from "./view/dice";
import { TRAY } from "./world/table";
import { Command } from "./core/commands";
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
sc.left = -BOARD.w / 2 - 8; sc.right = BOARD.w / 2 + 22;
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
const picker = new Picker(renderer.domElement, cam.camera, pieces);
const tape = new TapeMeasure(renderer.domElement, picker, pieces);
scene.add(tape.group);
const controls = new PieceControls(renderer.domElement, picker, pieces, bus);
controls.blocked = () => tape.active;
const ranges = new RangeRings();
scene.add(ranges.group);

// Herramientas: cinta métrica (M) y círculos de alcance (C)
const tapeBtn = document.getElementById("tape")!, rangeBtn = document.getElementById("range")!;
tape.onActiveChange = (on) => tapeBtn.classList.toggle("on", on);
tapeBtn.addEventListener("click", () => tape.toggle());
function cycleRange(dir = 1) {
  const i = RANGES.indexOf(ranges.range as (typeof RANGES)[number]);
  ranges.range = RANGES[(i + dir + RANGES.length) % RANGES.length];
  rangeBtn.textContent = ranges.range ? `Alcance ${ranges.range}"` : "Alcance";
  rangeBtn.classList.toggle("on", ranges.range > 0);
}
rangeBtn.addEventListener("click", () => cycleRange());

let gridOn = true;
const hud = new Hud(bus, {
  toggleGrid: () => { gridOn = !gridOn; table.setGridVisible(gridOn); return gridOn; },
  toggleTopDown: () => { cam.topDown = !cam.topDown; return cam.topDown; },
  newTable: () => { bus.reset(freshSeed()); cam.reset(); },
});
controls.onDragInfo = (inches, x, y) => hud.showMeasure(inches, x, y);
controls.onSelectionChange = () => hud.renderSelection(bus.state, controls.selected);

// Bandeja de dados: clic en un dado lo marca para repetir (antes que seleccionar o medir)
const tray = new DiceTray();
scene.add(tray.group);
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || tape.active) return;
  picker.set(e);
  if (tray.toggleAt(picker.intersect(tray.pickables()))) e.stopImmediatePropagation();
}, true);
const $btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
function renderTray() {
  const n = tray.marked.size;
  $btn("tray-reroll").disabled = n === 0;
  $btn("tray-reroll").textContent = n ? `Repetir ${n}` : "Repetir marcados";
  for (const id of ["tray-sort", "tray-ones", "tray-clear"]) $btn(id).disabled = tray.count === 0;
}
tray.onMarkedChange = renderTray;
$btn("tray-sort").addEventListener("click", () => tray.sort());
$btn("tray-ones").addEventListener("click", () => tray.markAtMost(1));
$btn("tray-reroll").addEventListener("click", () => {
  if (tray.marked.size) bus.dispatch({ type: "reroll", indices: [...tray.marked] });
});
$btn("tray-clear").addEventListener("click", () => { tray.remove(); renderTray(); });
$btn("tray-look").addEventListener("click", () => cam.focus(TRAY.x, TRAY.z, 24));

function refresh(_s?: unknown, cmd?: Command | null) {
  const last = bus.state.rolls.at(-1);
  if (cmd?.type === "roll") tray.show(last, true);
  else if (cmd?.type === "reroll") tray.show(last, true, cmd.indices);
  else tray.show(last, false);
  renderTray();
  pieces.sync(bus.state);
  hud.render(bus.state);
  hud.renderSelection(bus.state, controls.selected);
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
  if (e.code === "KeyM") tape.toggle();
  if (e.code === "KeyC") cycleRange(e.shiftKey ? -1 : 1);
  if (e.code === "Escape") tape.escape();
  if (e.code === "KeyB") cam.focus(TRAY.x, TRAY.z, 24);
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
  pieces.highlight(controls.selected, controls.hovered);
  ranges.update(pieces, controls.selected);
  tape.update();
  tray.update(dt);
  renderer.render(scene, cam.camera);
});

// Para pruebas desde la consola
(window as unknown as { mesa: unknown }).mesa = { bus, cam, pieces, controls, tape, ranges, tray };
