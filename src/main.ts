import { formation, formationModels } from "./rules/leaders";
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
import { overwatchWeapons } from "./rules/reactions";
import { expectedAttack } from "./ai/evaluate";
import { actionsAgainst, pendingText, pendingUnits, selectedFormation, validTargets } from "./rules/actions";
import { ChatPanel } from "./ui/chat";
import { runtime } from "./ai/settings";
import { PLAYERS } from "./core/state";
import { listPoints } from "./rules/armies";
import { AiController } from "./ai/controller";
import { TEST_LEGION, TEST_SWARM } from "./rules/armies";
import { ArmyDialog } from "./ui/armyDialog";
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
const objectives = new ObjectivesView();
scene.add(objectives.group);
const missionPanel = new MissionPanel();
const endDialog = new EndDialog();

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
const ai = new AiController(bus, () => shots.playing || endDialog.open || modal.open);
ai.onAction = (t) => toast(`IA · ${t}`);
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
  if (!a || !target) { actionMenu.hideTip(); if (hoverFromBoard) { targetHover = null; hoverFromBoard = false; } return; }
  targetHover = target; hoverFromBoard = true;
  actionMenu.tip(DATASHEETS[s.units.find((u) => u.id === target)!.datasheet].name, actionsAgainst(s, a, target), x, y);
};
let hoverFromBoard = false;
/** Recalcula los resaltados de la guía (unidades pendientes y objetivos posibles). */
function updateGuide() {
  const s = bus.state;
  const a = actor();
  const key = `${bus.length}|${[...controls.selected].join(",")}|${s.phase}|${s.active}|${ai.paused}`;
  if (key === guideKey) return;
  guideKey = key;
  canTargetIds = new Set();
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
  // Aviso si aún queda algo por hacer en la fase (segunda pulsación en 3 s: pasa)
  const f = PLAYERS[s.active];
  if (s.rulesMode && !s.gameOver && controllable(f) && s.phase !== "combate" && Date.now() - confirmAdvance > 3000) {
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
armies.onDeployed = () => { cam.reset(); controls.selected.clear(); controls.onSelectionChange(); ai.paused = false; };
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
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: settings.mission });
  if (!bus.state.rulesMode) bus.dispatch({ type: "setRulesMode", on: true });
  tables.hide();
  cam.reset();
  toast(`Ejércitos de prueba desplegados (460 y 450 puntos) · ${MISSIONS[settings.mission].name}`);
});
missionPanel.onShowSummary = () => endDialog.show(bus.state);
endDialog.onNewGame = () => armies.show();
let wasOver = bus.state.gameOver;
hud.onSheetToggle = () => hud.renderSelection(bus.state, controls.selected, coherencyWarnings());
hud.onTargetHover = (u) => { targetHover = u; };

function refresh(_s?: unknown, cmd?: Command | null) {
  const last = bus.state.rolls.at(-1);
  const log = bus.state.combatLog;
  const newAttacks = (cmd?.type === "shoot" || cmd?.type === "fight") && log.length > logLen ? log.slice(logLen) : [];
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
  missionPanel.render(bus.state);
  if (bus.state.gameOver && !wasOver && bus.state.mission) setTimeout(() => endDialog.show(bus.state), shots.playing ? 2500 : 600);
  wasOver = bus.state.gameOver;
  if (newAttacks.length) shots.playAll(newAttacks, bus.state);
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
  const aiBtn = $btn("bot-phase");
  aiBtn.textContent = settings.aiSide ? (ai.paused ? "Reanudar IA" : "Pausar IA") : "IA";
  aiBtn.title = settings.aiSide ? `La IA (${AI_LEVEL_NAME[settings.aiLevel]}) lleva ${FACTIONS[settings.aiSide].of.replace(/^de /, "").replace(/^del /, "el ")}` : "La IA juega esta fase por el bando activo";
  if (ai.isAiTurn() && !ai.paused) $btn("end-turn").disabled = true;
  if (runtime.online) aiBtn.hidden = true;
  hud.renderSelection(bus.state, controls.selected, coherencyWarnings());
  if (net?.session?.role !== "guest") writeTable(bus.serialize());   // el invitado no pisa su mesa guardada
}
bus.onChange(refresh);
refresh();

// --- Teclado -------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.tagName === "INPUT" || modal.open) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); bus.undo(); return; }
  if (mod && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) { e.preventDefault(); bus.redo(); return; }
  if (mod) return;
  if (e.code === "KeyG") { gridOn = !gridOn; table.setGridVisible(gridOn); document.getElementById("grid")!.classList.toggle("on", gridOn); }
  if (e.code === "KeyV") document.getElementById("topdown")!.classList.toggle("on", cam.topDown);
  if (e.code === "Space") { e.preventDefault(); hud.rollNow(); }
  if (e.code === "Equal" || e.code === "NumpadAdd") hud.rollMore(1);
  if (e.code === "Minus" || e.code === "NumpadSubtract") hud.rollMore(-1);
  if (e.code === "Enter") hud.advance();
  if (e.code === "KeyM") tape.toggle();
  if (e.code === "KeyC") cycleRange(e.shiftKey ? -1 : 1);
  if (e.code === "Escape") tape.escape();
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
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  cam.update(dt);
  pieces.update(dt);
  objectives.update(dt);
  ai.update(dt);
  const targets = targetHover ? new Set(bus.state.pieces.filter((p) => p.unit === targetHover).map((p) => p.id)) : undefined;
  const shockedIds = bus.state.rulesMode ? new Set(bus.state.pieces.filter((p) => bus.state.units.find((u) => u.id === p.unit)?.shocked).map((p) => p.id)) : undefined;
  updateGuide();
  pieces.matPending.opacity = 0.35 + 0.3 * Math.sin(performance.now() / 260);
  pieces.highlight(controls.selected, controls.hovered, controls.selected.size ? coherencyWarnings() : undefined, targets, shockedIds, canTargetIds, pendingIds);
  shots.update(dt);
  ranges.update(pieces, controls.selected);
  tape.update();
  updateMoveRings();
  tray.update(dt);
  renderer.render(scene, cam.camera);
});

// Para pruebas desde la consola
(window as unknown as { mesa: unknown }).mesa = { bus, cam, pieces, controls, tape, ranges, tray, tables, shots, armies, ai, endDialog, fightOptions, net, tactics: { aiStep, fightStep, canFight }, stateHash };
