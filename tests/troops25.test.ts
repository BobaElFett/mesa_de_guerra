import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, validateList } from "../src/rules/armies";
import { cloneState, GameState } from "../src/core/state";
import { objectiveStatus } from "../src/rules/missions";
import { applyShoot, attackInput } from "../src/rules/shooting";
import { WEAPONS } from "../src/rules/datasheets";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "portaestandarte", models: 1, leads: 1 }, { datasheet: "asalto", models: 5 }, { datasheet: "tanque", models: 1 }, { datasheet: "asalto", models: 5 }] };
const SWA: ArmyList = { units: [{ datasheet: "mente", models: 1 }, { datasheet: "guardiana", models: 1 }, { datasheet: "devorador", models: 1 }, { datasheet: "garras", models: 10 }, { datasheet: "escupidores", models: 10 }] };

function game(seed = 2) {
  const bus = new CommandBus(seed);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}
const units = (s: GameState, ds: string) => s.units.filter((u) => u.datasheet === ds).map((u) => u.id);
function place(s: GameState, unit: string, x: number, z: number) {
  s.pieces.filter((p) => p.unit === unit).forEach((p, i) => { p.x = x + (i % 10) * 1.3; p.z = z + Math.floor(i / 10) * 1.3; });
}

test("las listas con las cuatro tropas nuevas son válidas", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
});

test("Honor de la compañía: la escuadra del portaestandarte suma +1 al CO de cada miniatura", () => {
  const bus = game();
  const s = cloneState(bus.state);
  const banner = units(s, "portaestandarte")[0];
  const led = s.units.find((u) => u.id === banner)!.attachedTo!;
  const o = s.objectives![0];
  s.pieces.filter((p) => p.faction === "swarm").forEach((p, i) => { p.x = -30 + (i % 10); p.z = -20 + Math.floor(i / 10); });
  const oc = (st: GameState) => objectiveStatus(st, o).oc[0];
  const other = units(s, "asalto").find((id) => id !== led)!;
  place(s, led, 30, 10); place(s, banner, 30, 13);
  place(s, other, o.x - 2, o.z);
  assert.equal(oc(s), 5 * 2);                 // escuadra sin portaestandarte: CO 2
  place(s, other, 30, -10);
  place(s, led, o.x - 2, o.z);
  assert.equal(oc(s), 5 * 3);                 // la suya: +1 cada legionario
  place(s, banner, o.x - 2, o.z + 1.4);
  assert.equal(oc(s), 5 * 3 + 2 + 1);         // y el portaestandarte (CO 2, +1 por ir unido)
});

test("Alzar el estandarte: el objetivo queda asegurado al acabar el movimiento hasta que el rival lo controle", () => {
  const bus = game();
  bus.dispatch({ type: "nextPhase" });   // mando
  bus.dispatch({ type: "nextPhase" });   // movimiento
  const s0 = bus.state;
  const banner = units(s0, "portaestandarte")[0], led = s0.units.find((u) => u.id === banner)!.attachedTo!;
  const o = s0.objectives![0];
  const ms = s0.pieces.filter((p) => p.unit === led || p.unit === banner);
  bus.dispatch({ type: "moveMany", moves: s0.pieces.filter((p) => p.faction === "swarm").map((p, i) => ({ id: p.id, x: -28 + (i % 10) * 1.3, z: -20 + Math.floor(i / 10) * 1.3 })) });
  bus.dispatch({ type: "moveMany", moves: ms.map((p, i) => ({ id: p.id, x: o.x - 2 + (i % 4) * 1.3, z: o.z + Math.floor(i / 4) * 1.3 })) });
  bus.dispatch({ type: "nextPhase" });   // disparo: al acabar el movimiento queda asegurado
  assert.equal(bus.state.objectives![0].secured, 0);
  // Se van: sigue siendo de la Legión
  bus.dispatch({ type: "moveMany", moves: ms.map((p, i) => ({ id: p.id, x: 20 + (i % 4) * 1.3, z: 14 + Math.floor(i / 4) * 1.3 })) });
  assert.equal(objectiveStatus(bus.state, bus.state.objectives![0]).holder, 0);
});

test("Destructor: +1 a la penetración contra infantería; Dañado: −1 para impactar con 4 heridas o menos", () => {
  const bus = game();
  const s = cloneState(bus.state);
  const tank = units(s, "tanque")[0], g = units(s, "garras")[0], dev = units(s, "devorador")[0];
  const shooters = s.pieces.filter((p) => p.unit === tank);
  assert.equal(attackInput(s, "disparo", tank, shooters, WEAPONS.autocanonTanque, g).apMod, 1);
  assert.equal(attackInput(s, "disparo", tank, shooters, WEAPONS.autocanonTanque, dev).apMod, 0);   // monstruo
  assert.equal(attackInput(s, "disparo", tank, shooters, WEAPONS.autocanonTanque, g).hitMod, 0);
  shooters[0].damage = 7;   // 11 − 7 = 4 heridas
  assert.equal(attackInput(s, "disparo", tank, shooters, WEAPONS.autocanonTanque, g).hitMod, -1);
});

test("Grito de muerte: tras impactar, la unidad chequea moral con −1", () => {
  let tests = 0;
  for (let k = 0; k < 6; k++) {
    const bus = game(3 + k);
    while (!(bus.state.active === 1 && bus.state.phase === "disparo")) bus.dispatch({ type: "nextPhase" });
    const s = cloneState(bus.state);
    const sk = units(s, "guardiana")[0], a = units(s, "asalto")[1];
    place(s, sk, 0, -2); place(s, a, 0, 6);
    const e = applyShoot(s, sk, "gritoBioplasma", a)!;
    if (e.result.hits > 0) { tests++; assert.ok((s.history ?? []).some((h) => /Grito de muerte/.test(h.text))); }
  }
  assert.ok(tests > 0);
});

test("partidas enteras con las cuatro tropas nuevas", () => {
  for (const seed of [1, 2, 3]) {
    const bus = game(seed);
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `tropas25 ${seed}`);
    }
    assert.ok(bus.state.gameOver);
  }
});
