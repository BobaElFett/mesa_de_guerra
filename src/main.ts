import { formation, formationModels } from "./rules/leaders";
import * as THREE from "three";
import { CommandBus } from "./core/commands";
import { freshSeed } from "./core/rng";
import { readTable, writeTable } from "./core/save";
import { BOARD, BASE_RADIUS } from "./core/state";
import { TableCamera } from "./camera/tableCamera";
import { Table } from "./world/table";
import { PiecesView } from "./view/piecesView";
import { PieceControls } from "./input/pieceControls";
import { Picker } from "./input/picker";
import { TapeMeasure } from "./tools/tapeMeasure";
import { RangeRings } from "./view/rangeRings";
import { RANGES } from "./core/measure";
import { outOfCoherency } from "./rules/geometry";
import { createRulesGate } from "./input/rulesGate";
import { CircleSet } from "./view/rangeRings";
import { allowance, originOf, movedSoFar } from "./rules/movement";
import { toast } from "./ui/tablesDialog";
import { ShotPlayer } from "./view/shotPlayer";
import { DATASHEETS } from "./rules/datasheets";
import { aiPlayPhase, aiStep, canFight, fightStep } from "./ai/tactics";
import { stateHash } from "./net/protocol";
import { fightOptions } from "./rules/melee";
import { NetDialog } from "./ui/netDialog";
import { ActionMenu } from "./ui/actionMenu";
import { Effects } from "./view/effects";
import { SolidsView } from "./view/solidsView";
import { ArrivalView } from "./view/arrivalView";
import { SuggestView } from "./view/suggestView";
import { LosView } from "./view/losView";
import { Replay } from "./ui/replay";
import { CampaignDialog, loadCampaign, saveCampaign } from "./ui/campaign";
import { CAMPAIGN, recordBattle } from "./rules/campaign";
import { randomMap } from "./rules/maps";
import { suggest } from "./ai/suggest";
import { arrivalBlocked, arrivalPlacement } from "./rules/reserves";
import { Tutorial } from "./ui/tutorial";
import { SettingsDialog, StartMenu } from "./ui/menu";
import { validateList } from "./rules/armies";
import { BattleLog } from "./ui/battleLog";
import { sfx, weaponSound } from "./audio/sfx";
import { saveSettings } from "./ai/settings";
import { WEAPONS } from "./rules/datasheets";
import type { AttackLogEntry } from "./rules/shooting";
import { overwatchWeapons } from "./rules/reactions";
import { expectedAttack } from "./ai/evaluate";
import { actionsAgainst, pendingText, pendingUnits, selectedFormation, validTargets } from "./rules/actions";
import { ChatPanel } from "./ui/chat";
import { runtime } from "./ai/settings";
import { PLAYERS } from "./core/state";
import { listPoints } from "./rules/armies";
import { AiController } from "./ai/controller";
import { TEST_LEGION, TEST_SWARM } from "./rules/armies";
import { applyMap, ArmyDialog } from "./ui/armyDialog";
import { DiceTray } from "./view/dice";
import { TRAY } from "./world/table";
import { Command } from "./core/commands";
import { TERRAIN, TerrainKind, BOARD as B } from "./core/state";
import { Hud } from "./ui/hud";
import { TablesDialog } from "./ui/tablesDialog";
import { modal } from "./ui/modal";
import { ObjectivesView } from "./view/objectivesView";
import { MissionPanel } from "./ui/missionPanel";
import { EndDialog } from "./ui/endDialog";
import { MISSIONS } from "./rules/missions";
import { AI_LEVEL_NAME, settings } from "./ai/settings";
import { FACTIONS } from "./core/state";

// --- Renderer y escena ---------------------------------------------------
const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
// El mapa de sombras solo se vuelve a pintar cuando algo que hace sombra se mueve (#58)
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
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

/** Firma de todo lo que proyecta sombra: si cambia, hay que repintar el mapa de sombras. */
let shadowSig = NaN;
function shadowSignature(): number {
  let h = 0, n = 0;
  scene.traverseVisible((o) => {
    if (!(o as THREE.Mesh).isMesh || !o.castShadow) return;
    const e = o.matrixWorld.elements;
    h = (h * 31 + Math.round(e[12] * 200) * 7 + Math.round(e[13] * 200) * 13 + Math.round(e[14] * 200) * 17 + Math.round(e[0] * 1000) + Math.round(e[2] * 1000) * 3) | 0;
    n++;
  });
  return h ^ (n << 20);
}
/** Gráficos (#58): calidad alta o rápidos (sin sombras y a resolución 1×). */
function applyUiScale() { document.documentElement.style.setProperty("--ui", String(settings.uiScale ?? 1)); }
function applyGraphics() {
  applyUiScale();
  const fast = settings.graphics === "rapida";
  renderer.setPixelRatio(fast ? 1 : Math.min(window.devicePixelRatio, 2));
  if (key.castShadow === fast) {
    key.castShadow = !fast;
    scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  }
  renderer.shadowMap.needsUpdate = true;
}

// --- Mesa, estado y miniaturas -------------------------------------------
const table = new Table();
scene.add(table.group);

const saved = readTable();
const bus = saved ? CommandBus.restore(saved) : new CommandBus(freshSeed());

const pieces = new PiecesView();
scene.add(pieces.group);
const objectives = new ObjectivesView();
scene.add(objectives.group);
const effects = new Effects();
scene.add(effects.group);
const solids = new SolidsView();
scene.add(solids.group);
const battleLog = new BattleLog();
let lastVp = 0, lastTurnSound = "";
const missionPanel = new MissionPanel();
const endDialog = new EndDialog();

const cam = new TableCamera(renderer.domElement);
const picker = new Picker(renderer.domElement, cam.camera, pieces);
const tape = new TapeMeasure(renderer.domElement, picker, pieces);
scene.add(tape.group);
const controls = new PieceControls(renderer.domElement, picker, pieces, bus);
controls.blocked = () => tape.active || replay.active || (runtime.spectate && bus.state.rulesMode && !bus.state.gameOver);
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
  newTable: () => { bus.reset(freshSeed()); cam.reset(); tables.setName(""); },
});
tape.terrain = () => bus.state.terrain;

/** Miniaturas fuera de coherencia en las unidades que tienen algo seleccionado. */
function coherencyWarnings(): Set<string> {
  const units = new Set(bus.state.pieces.filter((p) => controls.selected.has(p.id) && p.unit).map((p) => formation(bus.state, p.unit!)[0]));
  const out = new Set<string>();
  for (const u of units) for (const id of outOfCoherency(formationModels(bus.state, u))) out.add(id);   // el líder cuenta con su escuadra
  return out;
}

// Modo reglas: las fases mandan sobre lo que se puede mover
controls.gate = createRulesGate(bus, pieces, toast);
const moveRings = new CircleSet("#7fb2ff", 0.55);
scene.add(moveRings.group);
/** En movimiento: hasta dónde puede llegar cada miniatura de la unidad seleccionada. */
function updateMoveRings() {
  const s = bus.state;
  const circles: { x: number; z: number; r: number }[] = [];
  if (s.rulesMode && s.phase === "movimiento" && !s.gameOver) {
    const units = new Set(s.pieces.filter((p) => controls.selected.has(p.id) && p.unit).map((p) => p.unit!));
    if (units.size === 1) {
      const u = [...units][0];
      const unit = s.units.find((x) => x.id === u);
      if (unit && unit.faction === (s.active === 0 ? "legion" : "swarm")) {
        const max = allowance(s, u, s.turnLog.moves[u]);
        for (const p of s.pieces.filter((q) => q.unit === u)) {
          const [x, z] = originOf(s, p);
          circles.push({ x, z, r: max });
        }
      }
    }
  }
  moveRings.update(circles);
}

const tables = new TablesDialog(bus);
tables.onLoaded = () => { cam.reset(); tape.clear(); };
controls.onDragInfo = (inches, x, y) => hud.showMeasure(inches, x, y);
controls.onSelectionChange = () => hud.renderSelection(bus.state, controls.selected, coherencyWarnings());
hud.onDeclareMove = (unit, kind) => {
  const s = bus.state;
  const cur = s.turnLog.moves[unit];
  if (cur?.kind === "avanzar" || formation(s, unit).some((u) => movedSoFar(s, u) > 0.01)) { toast("Esta unidad ya ha movido."); return; }
  bus.dispatch({ type: "declareMove", unit, kind });
};

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

// Escenografía: bloqueada por defecto (se cogen las miniaturas que hay detrás); T la desbloquea
const terrainBtn = $btn("terrain-edit"), terrainPanel = document.getElementById("terrain-panel")!;
function setTerrainEdit(on: boolean) {
  pieces.terrainLocked = !on;
  terrainBtn.classList.toggle("on", on);
  terrainPanel.hidden = !on;
  missionPanel.hiddenByTerrain = on;
  missionPanel.render(bus.state);
  if (!on) controls.prune((id) => !!pieces.pieceOf(id));
}
terrainBtn.addEventListener("click", () => setTerrainEdit(pieces.terrainLocked));
for (const kind of Object.keys(TERRAIN) as TerrainKind[]) {
  const b = document.createElement("button");
  b.textContent = TERRAIN[kind].name;
  b.title = `${TERRAIN[kind].w}" × ${TERRAIN[kind].d}"`;
  b.addEventListener("click", () => {
    const id = `T${bus.state.nextTerrainId}`;
    const x = Math.round(Math.max(-B.w / 2 + 3, Math.min(B.w / 2 - 3, cam.target.x)));
    const z = Math.round(Math.max(-B.d / 2 + 3, Math.min(B.d / 2 - 3, cam.target.z)));
    bus.dispatch({ type: "addTerrain", kind, x, z, rot: 0 });
    controls.selectOnly(id);
  });
  document.getElementById("terrain-add")!.appendChild(b);
}
function deleteSelectedTerrain() {
  const ids = [...controls.selected].filter((id) => pieces.terrainOf(id));
  if (ids.length) bus.dispatch({ type: "removeTerrain", ids });
}
$btn("terrain-delete").addEventListener("click", deleteSelectedTerrain);

// Disparos: los dados ruedan paso a paso y las bajas caen al terminar
const shots = new ShotPlayer(tray, document.getElementById("report")!);
shots.onDone = () => pieces.release(bus.state);
shots.onLookTray = () => cam.focus(TRAY.x, TRAY.z, 24);
let logLen = bus.state.combatLog.length;
let moraleLen = bus.state.moraleLog.length;
let targetHover: string | null = null;
hud.onShoot = (unit, weapon, target) => bus.dispatch({ type: "shoot", unit, weapon, target });
hud.onCharge = (unit, target) => {
  bus.dispatch({ type: "charge", unit, target });
  const c = bus.state.turnLog.charges?.[unit];
  if (c) toast(`Carga: 2D6 = ${c.roll} (necesitaba ${c.need}) — ${c.success ? "¡entra en combate!" : "no llega"}`);
};
hud.onFight = (unit, target) => bus.dispatch({ type: "fight", unit, target });
// IA: con un bando a cargo de la IA, el botón la pausa o la reanuda; sin IA, juega la fase
// en curso por el bando activo (para probar o para ver una partida entera)
const replay = new Replay(bus);
const ai = new AiController(bus, () => shots.playing || endDialog.open || modal.open || replay.active);
ai.onAction = (t) => toast(`IA · ${t}`);
ai.onFocus = (u) => {
  if (!settings.followAi) return;
  const ms = bus.state.pieces.filter((p) => p.unit === u);
  if (ms.length) cam.panTo(ms.reduce((n, p) => n + p.x, 0) / ms.length, ms.reduce((n, p) => n + p.z, 0) / ms.length);
};
ai.onStatus = (t) => {
  const el = document.getElementById("ai-status")!;
  el.hidden = !t;
  if (t && el.textContent !== t) el.textContent = t;
};
document.getElementById("bot-phase")!.addEventListener("click", () => {
  if (!bus.state.rulesMode || bus.state.gameOver) return;
  if (settings.aiSide) { ai.paused = !ai.paused; refresh(); return; }
  if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); return; }
  aiPlayPhase(bus, settings.aiLevel, settings.aiLevel, { humanDefends: true });
});
// Línea de visión al apuntar (#60)
const los = new LosView();
scene.add(los.group);
// Sugerir jugada (#59)
const suggestView = new SuggestView();
scene.add(suggestView.group);
let suggestAt = -1;
function showSuggestion() {
  const s = bus.state;
  if (!s.rulesMode || s.gameOver) return;
  if (ai.isAiTurn() && !ai.paused) { toast("Ahora juega la IA."); return; }
  const sg = suggest(bus);
  suggestView.show(s, sg.unit, sg.cmds);
  suggestAt = bus.length;
  toast(`Sugerencia: ${sg.text}`);
  if (sg.unit) {
    const ps = s.pieces.filter((p) => p.unit === sg.unit);
    if (ps.length) cam.panTo(ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.z, 0) / ps.length, 40);
  }
}
document.getElementById("suggest")!.addEventListener("click", showSuggestion);
// Modo espectador (#67): dejar de mirar devuelve la mesa; la IA sigue con su bando, en pausa
document.getElementById("stop-watch")!.addEventListener("click", () => {
  runtime.spectate = false; ai.paused = true; refresh();
  toast(`Ya no miras: juegas con ${FACTIONS[settings.aiSide === "legion" ? "swarm" : "legion"].name}. La IA está en pausa (Reanudar IA).`);
});
// Acciones sobre el tablero (#46) y guía de la fase (#47)
/** ¿Puede este jugador mandar sobre ese bando? (no sobre el de la IA ni, en línea, el del rival) */
function controllable(f: "legion" | "swarm"): boolean {
  if (runtime.online) return runtime.localSide === f;
  return !(settings.aiSide === f && !ai.paused);
}
const actionMenu = new ActionMenu(bus);
actionMenu.canRun = (a) => !a.cmd || !("unit" in a.cmd) || hud.canAct((a.cmd as { unit: string }).unit);
let canTargetIds = new Set<string>();
let pendingIds = new Set<string>();
let guideKey = "";
/** La formación elegida, si es de un bando que manda este jugador. */
function actor(): string[] | null {
  const s = bus.state;
  const f = selectedFormation(s, controls.selected);
  if (!f) return null;
  const fac = s.units.find((u) => u.id === f[0])!.faction;
  return controllable(fac) ? f : null;
}
const enemyAt = (id: string, a: string[]) => {
  const s = bus.state;
  const p = s.pieces.find((x) => x.id === id);
  const mine = s.units.find((u) => u.id === a[0])?.faction;
  return p?.unit && p.faction !== mine ? p.unit : null;
};
controls.interceptClick = (id, x, y) => {
  const s = bus.state;
  if (!s.rulesMode || s.gameOver || !["disparo", "carga", "combate"].includes(s.phase)) return false;
  const a = actor();
  if (!a) return false;
  const target = enemyAt(id, a);
  if (!target) return false;
  const acts = actionsAgainst(s, a, target);
  if (!acts.length) return false;
  actionMenu.open(DATASHEETS[s.units.find((u) => u.id === target)!.datasheet].name, acts, x, y);
  return true;
};
controls.onHover = (id, x, y) => {
  const s = bus.state;
  const a = id && s.rulesMode && ["disparo", "carga", "combate"].includes(s.phase) && !actionMenu.isOpen ? actor() : null;
  const target = a && id ? enemyAt(id, a) : null;
  if (!a || !target || !settings.hoverTips) { actionMenu.hideTip(); if (hoverFromBoard) { targetHover = null; hoverFromBoard = false; } return; }
  targetHover = target; hoverFromBoard = true;
  actionMenu.tip(DATASHEETS[s.units.find((u) => u.id === target)!.datasheet].name, actionsAgainst(s, a, target), x, y);
};
let hoverFromBoard = false;

// --- Llegada desde la reserva (#56) ---------------------------------------
const arrival = new ArrivalView();
scene.add(arrival.group);
let arriving: string | null = null;
function stopArrival() {
  if (!arriving) return;
  arriving = null;
  arrival.show(null);
  document.body.classList.remove("placing");
}
hud.onArrive = (unit) => {
  const s = bus.state;
  const why = arrivalBlocked(s, unit);
  if (why) { toast(why); return; }
  if (arriving === unit) { stopArrival(); return; }
  arriving = unit;
  controls.selected.clear();
  arrival.show(s, s.units.find((u) => u.id === unit)!.faction);
  document.body.classList.add("placing");
  toast("Haz clic en la mesa donde quieras que llegue (fuera de lo rojo: 9\" de cualquier enemigo). Esc cancela.");
};
controls.interceptBoard = (x, z) => {
  if (!arriving) return false;
  const unit = arriving;
  if (!arrivalPlacement(bus.state, unit, x, z)) { toast("No cabe ahí: tiene que quedar a más de 9\" de todo enemigo y fuera de la escenografía sólida."); return true; }
  stopArrival();
  bus.dispatch({ type: "arrive", unit, x, z });
  return true;
};
let lastPreview = 0;
controls.onBoardHover = (x, z) => {
  if (!arriving) return;
  const now = performance.now();
  if (now - lastPreview < 60) return;
  lastPreview = now;
  const s = bus.state;
  const m = (s.reserves ?? []).find((p) => p.unit === arriving);
  arrival.preview(x, z, arrivalPlacement(s, arriving, x, z), m ? BASE_RADIUS[m.model] : 0.6);
};
/** Recalcula los resaltados de la guía (unidades pendientes y objetivos posibles). */
function updateGuide() {
  const s = bus.state;
  const a = actor();
  const key = `${bus.length}|${[...controls.selected].join(",")}|${s.phase}|${s.active}|${ai.paused}|${settings.guideRings}`;
  if (key === guideKey) return;
  guideKey = key;
  canTargetIds = new Set();
  pendingIds = new Set();
  if (!settings.guideRings) return;
  if (a) for (const u of validTargets(s, a)) for (const p of s.pieces) if (p.unit === u) canTargetIds.add(p.id);
  pendingIds = new Set();
  for (const f of ["legion", "swarm"] as const) if (controllable(f)) for (const u of pendingUnits(s, f)) for (const p of s.pieces) if (p.unit === u) pendingIds.add(p.id);
}
/** Tab: elige la siguiente unidad pendiente y la centra. */
window.addEventListener("keydown", (e) => {
  if (e.code !== "Tab" || modal.open || (e.target as HTMLElement)?.tagName === "INPUT") return;
  const s = bus.state;
  const units: string[] = [];
  for (const f of ["legion", "swarm"] as const) if (controllable(f)) units.push(...pendingUnits(s, f));
  if (!units.length) return;
  e.preventDefault();
  const cur = selectedFormation(s, controls.selected)?.[0];
  const i = cur ? units.indexOf(cur) : -1;
  const next = units[(i + 1) % units.length];
  if (s.units.find((u) => u.id === next)?.reserve) { hud.onArrive(next); return; }
  controls.selected.clear();
  for (const p of formationModels(s, next)) controls.selected.add(p.id);
  controls.onSelectionChange();
  const ms = formationModels(s, next);
  cam.panTo(ms.reduce((n, p) => n + p.x, 0) / ms.length, ms.reduce((n, p) => n + p.z, 0) / ms.length, 40);
});
let confirmAdvance = 0;
/** Fuego defensivo (#50): si cargan a una unidad de un bando que manda este jugador, pregunta. */
function updateReaction() {
  const el = document.getElementById("react")!;
  const s = bus.state;
  const pc = s.pendingCharge;
  const show = !!pc && controllable(PLAYERS[pc.defender]);
  el.hidden = !show;
  if (!show || !pc) return;
  const key = `${bus.length}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const nm = (u: string) => DATASHEETS[s.units.find((x) => x.id === u)!.datasheet].name;
  let dmg = 0;
  for (const { weapon, shooters } of overwatchWeapons(s, pc.target, pc.unit)) dmg += expectedAttack(s, weapon, shooters.length, pc.unit, { onlySixes: true }).damage;
  el.innerHTML = `<h3>¡Te cargan!</h3>
    <div><b>${nm(pc.unit)}</b> declara una carga contra tu <b>${nm(pc.target)}</b>.</div>
    <div style="margin-top:4px">¿Fuego defensivo? Disparas con todo lo que llegue, pero solo impactan los 6 (Torrente impacta igual). Cuesta 1 PM (te quedan ${s.cp[pc.defender]}).
    <span class="dim">Daño esperado: ~${dmg.toLocaleString("es-ES", { maximumFractionDigits: 1 })} heridas.</span></div>
    <div class="row"><button data-fire="0">No</button><button data-fire="1" class="primary">Fuego defensivo · 1 PM</button></div>`;
}
document.getElementById("react")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button[data-fire]") as HTMLButtonElement | null;
  if (b) bus.dispatch({ type: "reactCharge", fire: b.dataset.fire === "1" });
});
hud.guideText = () => {
  const s = bus.state;
  if (!s.rulesMode || s.phase === "despliegue" || s.phase === "mando") return null;
  const parts: string[] = [];
  for (const f of ["legion", "swarm"] as const) {
    if (!controllable(f) || (s.phase !== "combate" && PLAYERS[s.active] !== f)) continue;
    const t = pendingText(s, f);
    if (t) parts.push(t);
  }
  if (!parts.length) return null;
  const hint = ["disparo", "carga", "combate"].includes(s.phase) ? " Elige una unidad y haz clic en un enemigo." : "";
  return parts.join(" ") + (parts.some((p) => !p.startsWith("Nada")) ? `${hint} <span class="dim">(Tab: siguiente)</span>` : "");
};
hud.canAct = (unit) => {
  const u = bus.state.units.find((x) => x.id === unit);
  if (u && runtime.online && runtime.localSide && u.faction !== runtime.localSide) { toast("Esa unidad es de tu rival."); return false; }
  if (u && !runtime.online && settings.aiSide === u.faction && !ai.paused) { toast("Esa unidad la lleva la IA."); return false; }
  return true;
};
hud.beforeAdvance = () => {
  const s = bus.state;
  if (runtime.online && s.rulesMode && s.phase !== "despliegue" && PLAYERS[s.active] !== runtime.localSide) { toast("Es el turno de tu rival."); return false; }
  if (ai.isAiTurn() && !ai.paused) { toast("Es el turno de la IA (pulsa Pausar IA para tomar el control)."); return false; }
  // Aviso si aún queda algo por hacer en la fase (segunda pulsación en 5 s: pasa)
  const f = PLAYERS[s.active];
  if (settings.confirmAdvance && s.rulesMode && !s.gameOver && controllable(f) && s.phase !== "combate" && Date.now() - confirmAdvance > 5000) {
    const left = pendingUnits(s, f);
    if (left.length && s.phase !== "mando") {
      confirmAdvance = Date.now();
      toast(`${pendingText(s, f)} Pulsa otra vez para pasar igualmente.`);
      return false;
    }
  }
  confirmAdvance = 0;
  ai.flushFights();
  return true;
};
// Ejércitos: listas de 500 puntos y despliegue
const armies = new ArmyDialog(bus, toast);
armies.onDeployed = () => { runtime.spectate = false; cam.reset(); controls.selected.clear(); controls.onSelectionChange(); ai.paused = false; };
armies.onSettings = () => refresh();

/** Pastilla del panel del turno con el estado de la sala, y aviso de turno en el chat. */
function netStatus() {
  const el = document.getElementById("net-status")!;
  const s = net?.session;
  el.hidden = !s;
  if (!s) return;
  const me = FACTIONS[s.side];
  el.classList.toggle("off", !s.connected);
  el.innerHTML = s.connected ? `En línea · tú: <b style="color:${me.color}">${me.name.replace(/^(La |El )/, "")}</b>${s.rtt ? ` · ${s.rtt} ms` : ""}` : s.status === "desconectado" ? "Sin conexión" : "Esperando rival…";
  const st = bus.state;
  if (st.rulesMode && st.phase !== "despliegue" && !st.gameOver) {
    const key = `${st.turn}-${st.active}`;
    if (key !== lastTurnKey) { lastTurnKey = key; chat.system(PLAYERS[st.active] === s.side ? `Ronda ${st.turn}: te toca.` : `Ronda ${st.turn}: turno de ${s.opponent || "tu rival"}.`); }
  }
  if (st.rulesMode && PLAYERS[st.active] !== s.side && st.phase !== "despliegue") $btn("end-turn").disabled = true;
}

// En línea (#40–#44): sala con otro ordenador; solo viajan las órdenes
const net = new NetDialog(bus, toast);
const chat = new ChatPanel();
let lastTurnKey = "";
net.onSession = (s) => {
  runtime.online = !!s;
  runtime.localSide = s ? s.side : null;
  armies.setOnline(s ? { role: s.role, side: s.side } : null);
  chat.show(!!s);
  if (!s) { refresh(); return; }
  chat.onSend = (t) => s.sendChat(t);
  armies.onSendList = (_f, l) => s.sendList(l);
  s.onChat = (t, by) => chat.add(by === s.role ? "Tú" : s.opponent || "Rival", t);
  s.onReject = (r) => toast(r);
  s.onList = (f, l) => { armies.setList(f, l); chat.system(`${s.opponent || "Tu rival"} ha enviado su lista (${listPoints(l)} puntos).`); toast("Lista del rival recibida: está en Ejércitos."); };
  s.onSnapshot = () => { runtime.localSide = s.side; armies.setOnline({ role: s.role, side: s.side }); cam.reset(); };
  let was = s.status;
  s.onStatus = () => {
    runtime.localSide = s.side;
    if (s.status !== was) {
      if (s.status === "conectado") chat.system(`Conectado con ${s.opponent}.`);
      if (s.status === "desconectado" && was === "conectado") chat.system("Se ha cortado la conexión.");
      was = s.status;
    }
    chat.who(s.opponent ? `con ${s.opponent}` : "");
    net.sessionChanged();
    refresh();
  };
  refresh();
};
document.addEventListener("visibilitychange", () => net.refresh());
// Partida de prueba: despliega las dos listas de prueba (se puede deshacer)
document.getElementById("test-armies")!.addEventListener("click", () => {
  applyMap(bus);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: settings.mission });
  if (!bus.state.rulesMode) bus.dispatch({ type: "setRulesMode", on: true });
  tables.hide();
  cam.reset();
  toast(`Ejércitos de prueba desplegados (${listPoints(TEST_LEGION)} y ${listPoints(TEST_SWARM)} puntos) · ${MISSIONS[settings.mission].name}`);
});
missionPanel.onShowSummary = () => endDialog.show(bus.state);
// Repetición (#61)
endDialog.onReplay = () => { stopArrival(); controls.selected.clear(); replay.begin(); };
replay.busy = () => shots.playing;
replay.skipFx = () => shots.finish();
replay.onCommand = (c) => {
  if (!settings.followAi) return;
  const s = bus.state;
  const unit = "unit" in c ? (c as { unit: string }).unit : c.type === "moveMany" ? s.pieces.find((p) => p.id === c.moves[0]?.id)?.unit : null;
  const ps = unit ? s.pieces.filter((p) => p.unit === unit) : [];
  if (ps.length) cam.panTo(ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.z, 0) / ps.length, 60);
};
replay.onExit = () => refresh();
endDialog.onNewGame = () => armies.show();
let wasOver = bus.state.gameOver;
hud.onSheetToggle = () => hud.renderSelection(bus.state, controls.selected, coherencyWarnings());
hud.onTargetHover = (u) => { targetHover = u; };

function refresh(_s?: unknown, cmd?: Command | null) {
  const last = bus.state.rolls.at(-1);
  const log = bus.state.combatLog;
  const newAttacks = cmd && log.length > logLen ? log.slice(logLen) : [];
  logLen = log.length;
  if (newAttacks.length) {
    pieces.hold(newAttacks.flatMap((e) => e.result.slain));
  } else {
    if (shots.playing) shots.finish();
    if (cmd?.type === "roll" || cmd?.type === "charge") tray.show(last, true);
    else if (cmd?.type === "reroll") tray.show(last, true, cmd.indices);
    else tray.show(last, false);
  }
  renderTray();
  pieces.sync(bus.state);
  objectives.sync(bus.state);
  solids.sync(bus.state.terrain);
  applyAtmosphere(bus.state.rulesMode ? bus.state.conditions : undefined);
  if (arriving && arrivalBlocked(bus.state, arriving)) stopArrival();
  missionPanel.render(bus.state);
  if (bus.state.gameOver && !wasOver) recordCampaign();
  if (bus.state.gameOver && !wasOver && bus.state.mission && !replay.active) setTimeout(() => endDialog.show(bus.state), shots.playing ? 2500 : 600);
  wasOver = bus.state.gameOver;
  if (newAttacks.length) { playAttackFx(newAttacks); shots.playAll(newAttacks, bus.state); }
  soundFor(cmd ?? null);
  battleLog.render(bus.state);
  // Chequeos de moral nuevos (al empezar una fase de mando)
  const ml = bus.state.moraleLog;
  if ((cmd?.type === "nextPhase" || cmd?.type === "endTurn") && ml.length > moraleLen) {
    const rows = ml.slice(moraleLen).map((m) => {
      const u = bus.state.units.find((x) => x.id === m.unit)!;
      const name = DATASHEETS[u.datasheet].name;
      return m.dice === null
        ? `<li><b>${name}</b>: sinapsis → <b class="ok">supera</b></li>`
        : `<li><b>${name}</b>: 2D6 = ${m.dice[0]} + ${m.dice[1]} = <b>${m.dice[0] + m.dice[1]}</b> (necesita ${m.need}) → ${m.passed ? `<b class="ok">supera</b>` : `<b class="bad">desmoralizada</b>`}</li>`;
    }).join("");
    shots.info(`<div><b>Chequeos de moral</b> <span class="dim">· unidades por debajo de la mitad</span></div><ul>${rows}</ul>`);
  }
  moraleLen = ml.length;
  controls.prune((id) => !!pieces.placedOf(id));
  hud.render(bus.state);
  netStatus();
  updateReaction();
  if (suggestAt >= 0 && bus.length !== suggestAt) { suggestView.clear(); suggestAt = -1; }
  $btn("suggest").hidden = !bus.state.rulesMode || bus.state.gameOver || (ai.isAiTurn() && !ai.paused) || runtime.online;
  const aiBtn = $btn("bot-phase");
  aiBtn.textContent = settings.aiSide || runtime.spectate ? (ai.paused ? "Reanudar IA" : "Pausar IA") : "IA";
  $btn("stop-watch").hidden = !runtime.spectate;
  aiBtn.title = settings.aiSide ? `La IA (${AI_LEVEL_NAME[settings.aiLevel]}) lleva ${FACTIONS[settings.aiSide].of.replace(/^de /, "").replace(/^del /, "el ")}` : "La IA juega esta fase por el bando activo";
  if (ai.isAiTurn() && !ai.paused) $btn("end-turn").disabled = true;
  if (runtime.online) aiBtn.hidden = true;
  hud.renderSelection(bus.state, controls.selected, coherencyWarnings());
  if (net?.session?.role !== "guest" && !replay.active) writeTable(bus.serialize());   // el invitado no pisa su mesa guardada
}
bus.onChange(refresh);
refresh();

// --- Teclado -------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.tagName === "INPUT" || modal.open) return;
  const mod = e.ctrlKey || e.metaKey;
  if (replay.active) {
    if (e.code === "Escape") replay.exit();
    if (e.code === "Space") { e.preventDefault(); replay.togglePlay(); }
    return;
  }
  if (mod && e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); bus.undo(); return; }
  if (mod && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) { e.preventDefault(); bus.redo(); return; }
  if (mod) return;
  if (e.code === "KeyG") { gridOn = !gridOn; table.setGridVisible(gridOn); document.getElementById("grid")!.classList.toggle("on", gridOn); }
  if (e.code === "KeyH") showSuggestion();
  if (e.code === "KeyV") document.getElementById("topdown")!.classList.toggle("on", cam.topDown);
  if (e.code === "Space") { e.preventDefault(); hud.rollNow(); }
  if (e.code === "Equal" || e.code === "NumpadAdd") hud.rollMore(1);
  if (e.code === "Minus" || e.code === "NumpadSubtract") hud.rollMore(-1);
  if (e.code === "Enter") hud.advance();
  if (e.code === "KeyM") tape.toggle();
  if (e.code === "KeyC") cycleRange(e.shiftKey ? -1 : 1);
  if (e.code === "Escape") { if (arriving) stopArrival(); else tape.escape(); }
  if (e.code === "KeyB") cam.focus(TRAY.x, TRAY.z, 24);
  if (e.code === "KeyT") setTerrainEdit(pieces.terrainLocked);
  if (e.code === "Delete" || e.code === "Backspace") {
    e.preventDefault();
    if (!pieces.terrainLocked) deleteSelectedTerrain();
    // Mesa libre: Supr retira las miniaturas seleccionadas (se puede deshacer)
    const minis = [...controls.selected].filter((id) => pieces.pieceOf(id));
    if (minis.length) {
      if (bus.state.rulesMode) toast("En modo reglas las bajas las quitan los ataques. Para retirar a mano, cambia a Mesa libre.");
      else { bus.dispatch({ type: "removePieces", ids: minis }); toast(`${minis.length} retirada${minis.length > 1 ? "s" : ""} (Ctrl+Z para deshacer)`); }
    }
  }
});

// --- Bucle ---------------------------------------------------------------
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);
applyGraphics();
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  cam.update(dt);
  pieces.update(dt);
  objectives.update(dt);
  effects.update(dt);
  solids.group.visible = (bus.state.rulesMode && pieces.dragging.size > 0) || !terrainPanel.hidden;
  ai.update(dt);
  replay.update(dt);
  stormTick(dt);
  const targets = targetHover ? new Set(bus.state.pieces.filter((p) => p.unit === targetHover).map((p) => p.id)) : undefined;
  const shockedIds = bus.state.rulesMode ? new Set(bus.state.pieces.filter((p) => bus.state.units.find((u) => u.id === p.unit)?.shocked).map((p) => p.id)) : undefined;
  updateGuide();
  los.update(bus.state, targetHover ? actor() : null, targetHover);
  pieces.matPending.opacity = 0.35 + 0.3 * Math.sin(performance.now() / 260);
  pieces.highlight(controls.selected, controls.hovered, controls.selected.size ? coherencyWarnings() : undefined, targets, shockedIds, canTargetIds, pendingIds);
  shots.update(dt);
  ranges.update(pieces, controls.selected);
  tape.update();
  updateMoveRings();
  tray.update(dt);
  if (key.castShadow) {
    scene.updateMatrixWorld();
    const sig = shadowSignature();
    if (sig !== shadowSig) { shadowSig = sig; renderer.shadowMap.needsUpdate = true; }
  }
  renderer.render(scene, cam.camera);
});

// Tutorial (#48)
const tutorial = new Tutorial(bus);
tutorial.onStart = () => {
  const help = document.getElementById("help")!;
  if (!help.classList.contains("folded")) document.getElementById("help-toggle")!.click();
  cam.reset(); controls.selected.clear(); controls.onSelectionChange(); ai.paused = false; armies.hide?.(); tables.hide(); refresh(); };
const tutorialTick = () => tutorial.check({ s: bus.state, selected: controls.selected });
bus.onChange(() => tutorialTick());
const prevSel = controls.onSelectionChange;
controls.onSelectionChange = () => { prevSel(); tutorialTick(); };

// Sensación de juego (#53): trazadoras, sonidos, velocidad de los ataques y registro
battleLog.onToggle = (on) => { missionPanel.hiddenByLog = on; missionPanel.render(bus.state); battleLog.render(bus.state); };
const soundBtn = document.getElementById("sound-btn")!;
const paintSound = () => { soundBtn.textContent = sfx.on ? "Sonido" : "Sin sonido"; soundBtn.classList.toggle("on", sfx.on); };
soundBtn.addEventListener("click", () => { sfx.setOn(!sfx.on); paintSound(); sfx.play("clic"); });
paintSound();
const speedSel = document.getElementById("dice-speed") as HTMLSelectElement;
const applySpeed = () => {
  const v = settings.diceSpeed;
  const k = v === "rapido" ? 2.5 : 1;
  shots.speed = k; tray.speed = k; effects.speed = v === "rapido" ? 1.6 : 1;
  shots.instant = v === "instante";
};
speedSel.value = settings.diceSpeed;
applySpeed();
speedSel.addEventListener("change", () => { settings.diceSpeed = speedSel.value as typeof settings.diceSpeed; saveSettings(); applySpeed(); });
shots.onStep = (n) => sfx.play("dados", 1 + Math.min(2, Math.floor(n / 10)));

/** Trazadoras y sonidos de los ataques recién resueltos. */
function playAttackFx(entries: AttackLogEntry[]) {
  let t = 0;
  for (const e of entries) {
    const shooters = bus.state.pieces.filter((p) => p.unit === e.attacker);
    const targets = [...bus.state.pieces.filter((p) => p.unit === e.target).map((p) => p.id), ...e.result.slain];
    const posOf = (id: string) => { const g = pieces.groupOf(id); return g ? new THREE.Vector3(g.position.x, 0.9, g.position.z) : null; };
    const aUnit = bus.state.units.find((u) => u.id === e.attacker);
    const fac = aUnit?.faction ?? "legion";
    const melee = e.kind === "combate";
    const kind = WEAPONS[e.weapon]?.id === "granadas" ? "pesado" : fac === "swarm" ? "acido" : /plasma/i.test(e.weapon) ? "plasma" : /canon|cañon|pesad/i.test(e.weapon) ? "pesado" : "bala";
    const n = Math.min(12, e.result.attacks);
    for (let i = 0; i < n; i++) {
      const a = shooters[i % Math.max(1, shooters.length)];
      const tid = i < e.result.slain.length ? e.result.slain[i] : targets[i % Math.max(1, targets.length)];
      const pa = a ? posOf(a.id) : null, pb = tid ? posOf(tid) : null;
      if (!pb) continue;
      pb.x += (Math.random() - 0.5) * 0.5; pb.z += (Math.random() - 0.5) * 0.5;
      const delay = t + i * (melee ? 0.08 : 0.06);
      if (melee || !pa) effects.sparks(pb, delay, fac === "swarm" ? "#c9a3ff" : "#ffd27a");
      else {
        const arrive = effects.shot(pa, pb, kind, delay);
        const hit = i < e.result.hits;
        if (hit) effects.impact(pb, arrive, i < e.result.slain.length, kind === "acido" ? "#c8ff9a" : "#fff3c4");
      }
    }
    sfx.play(weaponSound(e.weapon, melee, fac), Math.max(1, Math.min(8, Math.ceil(e.result.attacks / 2))), t);
    if (e.result.slain.length) sfx.play("baja", Math.min(3, e.result.slain.length), t + 0.5);
    t += 0.35;
  }
}

/** Sonidos de las órdenes que no son ataques. */
function soundFor(cmd: Command | null) {
  const s = bus.state;
  if (cmd?.type === "roll" || cmd?.type === "reroll") sfx.play("dados");
  if (cmd?.type === "charge" || (cmd?.type === "reactCharge")) { const c = Object.values(s.turnLog.charges ?? {}).at(-1); if (c) sfx.play("carga"); }
  const vp = (s.vp?.[0] ?? 0) + (s.vp?.[1] ?? 0);
  if (vp > lastVp) sfx.play("pv", 1, 0.2);
  lastVp = vp;
  const tk = `${s.turn}-${s.active}`;
  if (s.rulesMode && s.phase === "mando" && tk !== lastTurnSound) { sfx.play("turno"); }
  lastTurnSound = tk;
}

// Pantalla de inicio (#54) y ajustes (#55)
const menu = new StartMenu();
const settingsDlg = new SettingsDialog();
sfx.setVolume(settings.volume);
settingsDlg.sound = { get: () => sfx.on, set: (v) => { if (v !== sfx.on) { sfx.setOn(v); paintSound(); } }, volume: (v) => sfx.setVolume(v) };
settingsDlg.onChange = () => { speedSel.value = settings.diceSpeed; applySpeed(); applyGraphics(); guideKey = ""; refresh(); };
menu.continueInfo = () => {
  const s = bus.state;
  if (!s.pieces.length && !bus.length) return null;
  if (s.rulesMode && s.units.length) return s.gameOver ? "partida terminada" : `ronda ${s.turn} · ${s.mission ? MISSIONS[s.mission].name : "sin misión"}`;
  return `${s.pieces.length} miniaturas en la mesa`;
};
menu.onTutorial = () => { runtime.spectate = false; tutorial.start(); };
menu.onArmies = () => armies.show();
menu.onOnline = () => net.show();
menu.onSettings = () => settingsDlg.show();
menu.onFree = () => { runtime.spectate = false; if (bus.state.rulesMode) bus.dispatch({ type: "setRulesMode", on: false }); toast("Mesa libre: mueve lo que quieras, tira dados y mide. «Modo reglas» activa el reglamento."); };
menu.onQuick = (q) => {
  runtime.spectate = q.side === "mirar";
  settings.aiSide = q.side === "legion" ? "swarm" : "legion";
  settings.aiLevel = q.level; settings.mission = q.mission; settings.map = q.map;
  saveSettings();
  let lists = { legion: TEST_LEGION, swarm: TEST_SWARM };
  if (q.lists === "mias") {
    const mine = armies.current();
    const bad = (["legion", "swarm"] as const).some((f) => validateList(mine[f], f).length);
    if (bad) toast("Tus listas de Ejércitos no son válidas: se usan las de prueba.");
    else lists = { legion: mine.legion, swarm: mine.swarm };
  }
  applyMap(bus);
  settings.conditions = q.conditions ?? ""; saveSettings();
  bus.dispatch({ type: "setArmies", legion: lists.legion, swarm: lists.swarm, mission: q.mission, ...(q.conditions ? { conditions: q.conditions } : {}) });
  if (!bus.state.rulesMode) bus.dispatch({ type: "setRulesMode", on: true });
  ai.paused = false;
  controls.selected.clear(); controls.onSelectionChange();
  cam.reset();
  if (q.side === "swarm") cam.sideOf(1);
  if (runtime.spectate) { settings.followAi = true; toast(`${MISSIONS[q.mission].name}: IA ${AI_LEVEL_NAME[q.level]} contra IA ${AI_LEVEL_NAME[q.level]}. Pausa con el botón de la IA; «Dejar de mirar» te devuelve la mesa.`); return; }
  toast(`${MISSIONS[q.mission].name} contra la IA (${AI_LEVEL_NAME[q.level]}). Coloca tu ejército y pulsa Empezar partida.`);
};
// Campaña (#70)
const campaign = new CampaignDialog();
campaign.lists = (mine) => {
  if (!mine) return { legion: TEST_LEGION, swarm: TEST_SWARM };
  const l = armies.current();
  const bad = (["legion", "swarm"] as const).filter((f) => validateList(l[f], f).length);
  return bad.length ? "Tus listas de Ejércitos no son válidas: corrígelas o usa las de prueba." : { legion: l.legion, swarm: l.swarm };
};
campaign.onPlay = (c, n) => {
  const b = CAMPAIGN[n - 1];
  runtime.spectate = false;
  settings.aiSide = c.side === "legion" ? "swarm" : "legion";
  settings.aiLevel = c.level;
  saveSettings();
  bus.dispatch({ type: "setTerrain", pieces: randomMap(c.seed + n * 7919) });
  bus.dispatch({ type: "setArmies", legion: c.lists.legion, swarm: c.lists.swarm, mission: b.mission, campaign: n, ...(b.conditions ? { conditions: b.conditions } : {}) });
  if (!bus.state.rulesMode) bus.dispatch({ type: "setRulesMode", on: true });
  ai.paused = false;
  controls.selected.clear(); controls.onSelectionChange();
  cam.reset();
  if (c.side === "swarm") cam.sideOf(1);
  toast(`${b.name}: ${b.intro} Coloca tu ejército y pulsa Empezar partida.`);
};
menu.onCampaign = () => campaign.show();
function campaignInfo() {
  const c = loadCampaign(), el = document.getElementById("menu-campaign-info")!;
  el.textContent = !c ? "tres batallas seguidas contra la IA" : c.results.length >= CAMPAIGN.length ? "campaña terminada: ver el resultado" : `en curso: batalla ${c.results.length + 1} de ${CAMPAIGN.length}`;
}
campaignInfo();
campaign.onChange = campaignInfo;
endDialog.onCampaign = () => campaign.show();
/** Al acabar una batalla de la campaña, se apunta el resultado (una sola vez). */
function recordCampaign() {
  const s = bus.state, c = loadCampaign();
  if (!c || !s.campaignBattle || replay.active) return;
  const next = recordBattle(c, s);
  if (next) { saveCampaign(next); campaignInfo(); }
}
if (settings.showMenu) menu.show();

// Para pruebas desde la consola
(window as unknown as { mesa: unknown }).mesa = { bus, renderer, scene, replay, los, suggestView, showSuggestion, hoverTarget: (u: string | null) => { targetHover = u; }, cam, pieces, controls, tape, ranges, tray, tables, shots, armies, ai, endDialog, fightOptions, net, tactics: { aiStep, fightStep, canFight, aiPlayPhase }, stateHash };
