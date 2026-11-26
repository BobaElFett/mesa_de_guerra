import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { BOARD, cloneState, GameState } from "../src/core/state";
import { ArmyList } from "../src/rules/armies";
import { allowance, checkMove, crossesEnemy, FLY_PENALTY } from "../src/rules/movement";
import { arrivalPlacement, arrivalSpotError, EDGE_BAND, nearEdge, reserveUnits } from "../src/rules/reserves";
import { surgeBlocked, surgeMove, surgeTarget } from "../src/rules/surge";
import { disc, engaged, gap } from "../src/rules/geometry";
import { aiPlayPhase } from "../src/ai/tactics";

// Fase 33: reservas estratégicas, vuelo, atravesar miniaturas y movimientos de oleada (11.ª)

const LEG: ArmyList = { units: [
  { datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10, reserve: true },
  { datasheet: "exterminadores", models: 5, reserve: true }, { datasheet: "asalto", models: 10 }, { datasheet: "fuegoPesado", models: 5 },
] };
const SWA: ArmyList = { units: [
  { datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "gargolas", models: 10 },
  { datasheet: "carnifice", models: 1 }, { datasheet: "escupidores", models: 10 },
] };

function game(seed = 33) {
  const bus = new CommandBus(seed);
  for (const t of bus.state.terrain.map((x) => x.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });                 // mando de la Legión
  return bus;
}
const idOf = (s: GameState, ds: string, n = 0) => s.units.filter((u) => u.datasheet === ds)[n].id;
const toRound = (bus: CommandBus, round: number) => {
  for (let g = 0; g < 40 && !(bus.state.turn === round && bus.state.active === 0 && bus.state.phase === "movimiento"); g++) bus.dispatch({ type: "nextPhase" });
};

test("reserva estratégica: el capitán va con su escuadra y llegan juntos", () => {
  const bus = game();
  const s = bus.state;
  const cap = idOf(s, "capitan"), sq = s.units.find((u) => u.id === cap)!.attachedTo!;
  assert.ok(s.units.find((u) => u.id === cap)!.reserve && s.units.find((u) => u.id === sq)!.reserve);
  // En la lista de reservas sale la escuadra, no el capitán aparte
  assert.ok(reserveUnits(s, "legion").some((u) => u.id === sq));
  assert.ok(!reserveUnits(s, "legion").some((u) => u.id === cap));
  toRound(bus, 2);
  const t = bus.state;
  const at = arrivalPlacement(t, sq, 0, BOARD.d / 2 - 2);
  assert.ok(at, "cabe junto al borde propio");
  assert.equal(at!.length, 11);
  bus.dispatch({ type: "arrive", unit: sq, x: 0, z: BOARD.d / 2 - 2 });
  const u = bus.state;
  assert.equal(u.pieces.filter((p) => p.unit === sq || p.unit === cap).length, 11);
  assert.ok(!u.units.find((x) => x.id === cap)!.reserve);
  assert.match(u.history!.at(-1)!.text, /borde de la mesa/);
});

test("reserva estratégica: entera a 6\" de un borde; hasta la ronda 3, fuera de la zona rival", () => {
  const bus = game();
  toRound(bus, 2);
  const s = bus.state;
  const sq = s.units.find((u) => u.datasheet === "asalto" && u.reserve)!.id;
  for (const p of s.pieces.filter((x) => x.faction === "swarm")) p.x = BOARD.w / 2 - 1, p.z = 0;   // el Enjambre, apiñado en el borde este
  assert.equal(arrivalPlacement(s, sq, 0, 0), null);                          // en medio: no
  assert.match(arrivalSpotError(s, sq, 0, 0, 0.6)!, /borde/);
  assert.match(arrivalSpotError(s, sq, -BOARD.w / 2 + 1, -BOARD.d / 2 + 2, 0.6)!, /zona de despliegue rival/);
  assert.ok(arrivalPlacement(s, sq, -BOARD.w / 2 + 2, 0));                     // por el borde oeste, sí
  for (const m of arrivalPlacement(s, sq, -BOARD.w / 2 + 2, 0)!) assert.ok(nearEdge(m.x, m.z, 0.6));
  assert.ok(EDGE_BAND === 6);
  s.turn = 3;
  assert.equal(arrivalSpotError(s, sq, -BOARD.w / 2 + 1, -BOARD.d / 2 + 2, 0.6), null);
});

test("Despliegue profundo: a cualquier punto a más de 8\", también en medio de la mesa", () => {
  const bus = game();
  toRound(bus, 2);
  const s = bus.state;
  const ext = idOf(s, "exterminadores");
  for (const p of s.pieces.filter((x) => x.faction === "swarm")) p.x = BOARD.w / 2 - 1, p.z = 0;
  assert.ok(arrivalPlacement(s, ext, 0, 0));
});

/** Movimiento del Enjambre con el campo vacío salvo lo que el test coloque. */
function swarmMove(bus: CommandBus) {
  for (let g = 0; g < 12 && !(bus.state.active === 1 && bus.state.phase === "movimiento"); g++) bus.dispatch({ type: "nextPhase" });
  return bus.state;
}

test("no se atraviesan miniaturas enemigas; volando sí, con 2\" menos", () => {
  const bus = game();
  const s = cloneState(swarmMove(bus));
  const garg = idOf(s, "gargolas"), wall = idOf(s, "asalto", 1);
  const g = s.pieces.find((p) => p.unit === garg)!;
  // Una fila de legionarios justo delante de la gárgola
  s.pieces.filter((p) => p.unit === wall).forEach((p, i) => { p.x = g.x - 6 + i * 1.3; p.z = g.z + 4; });
  const walk = { kind: "normal" as const };
  assert.ok(crossesEnemy(s, g, g.x, g.z + 8, walk));
  const r = checkMove(s, garg, [{ id: g.id, x: g.x, z: g.z + 8 }], walk);
  assert.match(r.message!, /a través de miniaturas enemigas/);
  assert.ok(r.moves[0].z < g.z + 4, "se para delante de la fila");
  const fly = { kind: "normal" as const, fly: true };
  assert.equal(allowance(s, garg, fly), allowance(s, garg, walk) - FLY_PENALTY);
  assert.equal(crossesEnemy(s, g, g.x, g.z + 8, fly), null);
  const rf = checkMove(s, garg, [{ id: g.id, x: g.x, z: g.z + 8 }], fly);
  assert.ok(rf.moves[0].z > g.z + 5, "pasa por encima");
});

test("declarar el vuelo: solo unidades con Vuelo; queda en el registro", () => {
  const bus = game();
  swarmMove(bus);
  const s = bus.state;
  const garg = idOf(s, "gargolas"), claw = idOf(s, "garras");
  bus.dispatch({ type: "declareMove", unit: garg, kind: "normal", fly: true });
  bus.dispatch({ type: "declareMove", unit: claw, kind: "normal", fly: true });
  assert.equal(bus.state.turnLog.moves[garg].fly, true);
  assert.equal(bus.state.turnLog.moves[claw].fly, undefined);
});

test("los monstruos pasan a través de infantería enemiga, no de vehículos ni monstruos", () => {
  const bus = game();
  const s = cloneState(swarmMove(bus));
  const carn = idOf(s, "carnifice"), wall = idOf(s, "asalto", 1);
  const c = s.pieces.find((p) => p.unit === carn)!;
  s.pieces.filter((p) => p.unit === wall).forEach((p, i) => { p.x = c.x - 6 + i * 1.3; p.z = c.z + 4; });
  assert.equal(crossesEnemy(s, c, c.x, c.z + 7, { kind: "normal" }), null);
  // Un monstruo enemigo en medio… (el Tirano hace de obstáculo cambiado de bando)
  const tyr = s.pieces.find((p) => p.unit === idOf(s, "tirano"))!;
  tyr.faction = "legion"; tyr.x = c.x; tyr.z = c.z + 4;
  s.units.find((u) => u.id === tyr.unit)!.faction = "legion";
  assert.ok(crossesEnemy(s, c, c.x, c.z + 7, { kind: "normal" }));
  // Al retirarse, ya no: solo la huida desesperada atraviesa
  assert.ok(crossesEnemy(s, c, c.x + 0.01, c.z + 7, { kind: "retirarse" }));
});

test("la huida desesperada pasa a través de los enemigos", () => {
  const bus = game();
  const s = cloneState(swarmMove(bus));
  const claw = idOf(s, "garras"), wall = idOf(s, "asalto", 1);
  const c = s.pieces.find((p) => p.unit === claw)!;
  s.pieces.filter((p) => p.unit === wall).forEach((p, i) => { p.x = c.x - 6 + i * 1.3; p.z = c.z + 3; });
  assert.ok(crossesEnemy(s, c, c.x, c.z + 6, { kind: "retirarse" }));
  s.units.find((u) => u.id === claw)!.shocked = true;
  assert.equal(crossesEnemy(s, c, c.x, c.z + 6, { kind: "retirarse" }), null);
});

test("movimiento de oleada: contra el enemigo más cercano, una vez por fase, nunca trabada ni desmoralizada", () => {
  const bus = game();
  const s = cloneState(swarmMove(bus));
  const claw = idOf(s, "garras"), near = idOf(s, "fuegoPesado");
  const cs = s.pieces.filter((p) => p.unit === claw);
  const cx = cs[0].x, cz = Math.max(...cs.map((p) => p.z));
  s.pieces.filter((p) => p.unit === near).forEach((p, i) => { p.x = cx + i * 1.4; p.z = cz + 6; });
  assert.equal(surgeTarget(s, claw), near);
  s.units.find((u) => u.id === claw)!.shocked = true;
  assert.match(surgeBlocked(s, claw)!, /Desmoralizada/);
  s.units.find((u) => u.id === claw)!.shocked = false;
  assert.equal(surgeMove(s, claw, 6), near);
  const mine = s.pieces.filter((p) => p.unit === claw), theirs = s.pieces.filter((p) => p.unit === near);
  assert.ok(engaged(mine, theirs));
  const others = s.pieces.filter((p) => p.faction === "legion" && p.unit !== near);
  assert.ok(!engaged(mine, others));
  assert.ok(Math.min(...mine.map((a) => Math.min(...theirs.map((b) => gap(disc(a), disc(b)))))) < 0.2);
  assert.match(surgeBlocked(s, claw)!, /Trabada|Ya ha hecho/);
});

test("partidas con reservas estratégicas por el borde: la IA las trae y la partida acaba", () => {
  const bus = game(7);
  let g = 0;
  while (!bus.state.gameOver && g++ < 300) aiPlayPhase(bus, "dificil");
  assert.ok(bus.state.gameOver);
  const arrivals = bus.state.history!.filter((h) => /entra por el borde|teletransporta/.test(h.text));
  assert.ok(arrivals.length >= 1);
});

test("tras llegar, se pueden recolocar sus miniaturas mientras dure la fase, cumpliendo las condiciones", async () => {
  const { adjustingArrival, checkArrivalAdjust } = await import("../src/rules/reserves");
  const bus = game();
  toRound(bus, 2);
  const s0 = bus.state;
  const ext = idOf(s0, "exterminadores");
  for (const p of s0.pieces.filter((x) => x.faction === "swarm")) p.x = BOARD.w / 2 - 1, p.z = 0;
  bus.dispatch({ type: "arrive", unit: ext, x: -10, z: 0 });
  const s = bus.state;
  assert.ok(adjustingArrival(s, ext));
  const ms = s.pieces.filter((p) => p.unit === ext);
  // Una en línea, más al oeste: vale (despliegue profundo); otra pegada al Enjambre: vuelve
  const r = checkArrivalAdjust(s, ext, [{ id: ms[0].id, x: -20, z: 5 }, { id: ms[1].id, x: BOARD.w / 2 - 4, z: 0 }]);
  assert.ok(r.moves.some((m) => m.id === ms[0].id && Math.hypot(m.x + 20, m.z - 5) < 0.5));
  // La que se suelta pegada al enemigo va al sitio válido más cercano
  const m1 = r.moves.find((m) => m.id === ms[1].id);
  if (m1) for (const e of s.pieces.filter((p) => p.faction === "swarm")) assert.ok(gap({ x: m1.x, z: m1.z, r: 0.8 }, disc(e)) > 8 - 0.3);
  else assert.deepEqual(r.rejected, [ms[1].id]);
  // Ya no puede declarar otro movimiento; al pasar de fase, se acabó recolocar
  bus.dispatch({ type: "declareMove", unit: ext, kind: "normal" });
  assert.ok(bus.state.turnLog.moves[ext].arrived);
  bus.dispatch({ type: "nextPhase" });
  if (bus.state.reaction) bus.dispatch({ type: "nextPhase" });
  assert.ok(!adjustingArrival(bus.state, ext));
});

test("vida de las miniaturas dañadas: solo las heridas y vivas, con su color", async () => {
  const { woundedModels, woundColor } = await import("../src/view/woundBars");
  const bus = game();
  const s = cloneState(bus.state);
  const tyr = s.pieces.find((p) => p.unit === idOf(s, "tirano"))!;
  const leg = s.pieces.find((p) => p.faction === "legion")!;
  assert.deepEqual(woundedModels(s), []);
  tyr.damage = 7;
  leg.damage = 1;
  const w = woundedModels(s);
  assert.equal(w.length, 2);
  const t = w.find((x) => x.id === tyr.id)!;
  assert.equal(t.left + 7, t.max);
  assert.equal(woundColor(10, 10), "#6fdc7a");
  assert.equal(woundColor(1, 10), "#ef5b4f");
});
