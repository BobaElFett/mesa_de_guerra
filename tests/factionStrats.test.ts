import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { grenadeTargets, stratBlocked } from "../src/rules/stratagems";

function base() {
  const bus = new CommandBus(31);
  for (const t of bus.state.terrain.map((x) => x.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });                 // mando de la Legión
  return bus;
}

test("Granadas: solo Legión, a 8\" y visible; heridas mortales sin salvación", () => {
  const bus = base();
  const s = bus.state;
  const asl = s.units.find((u) => u.datasheet === "asalto" && !s.units.some((x) => x.attachedTo === u.id))!.id;
  const gar = s.units.find((u) => u.datasheet === "garras" && u.startingModels === 20)!.id;
  const az = Math.min(...s.pieces.filter((p) => p.unit === asl).map((p) => p.z));
  const ax = s.pieces.find((p) => p.unit === asl)!.x;
  bus.dispatch({ type: "moveMany", moves: s.pieces.filter((p) => p.unit === gar).map((p, i) => ({ id: p.id, x: ax - 5 + (i % 10) * 1.1, z: az - 6 - Math.floor(i / 10) * 1.1 })) });
  bus.dispatch({ type: "nextPhase" });                 // movimiento
  bus.dispatch({ type: "nextPhase" });                 // disparo
  assert.ok(grenadeTargets(bus.state, asl).includes(gar));
  const swarmUnit = bus.state.units.find((u) => u.faction === "swarm")!.id;
  assert.match(stratBlocked(bus.state, "granadas", swarmUnit) ?? "", /bando|turno/);
  const n = bus.state.pieces.filter((p) => p.unit === gar).length;
  const cp = bus.state.cp[0];
  bus.dispatch({ type: "stratagem", id: "granadas", unit: asl, target: gar });
  const e = bus.state.combatLog.at(-1)!;
  assert.equal(e.mortal, true);
  assert.equal(e.result.hitRolls.length, 6);
  assert.equal(e.result.saveRolls.length, 0);
  assert.equal(e.result.wounds, e.result.hitRolls.filter((r) => r >= 4).length);
  assert.equal(n - bus.state.pieces.filter((p) => p.unit === gar).length, e.result.slain.length);
  assert.equal(bus.state.cp[0], cp - 1);
  assert.match(stratBlocked(bus.state, "granadas", asl) ?? "", /Ya usada/);
});

test("Oleada sin fin: Garras en sinapsis recuperan D3+1, sin pasar de las iniciales", () => {
  const bus = base();
  for (let i = 0; i < 5; i++) bus.dispatch({ type: "nextPhase" });   // al mando del Enjambre
  assert.equal(bus.state.active, 1);
  const s = bus.state;
  const gar = s.units.find((u) => u.datasheet === "garras" && u.startingModels === 20)!.id;
  assert.match(stratBlocked(s, "oleada", gar) ?? "", /No ha perdido/);
  const gone = s.pieces.filter((p) => p.unit === gar).slice(0, 6).map((p) => p.id);
  bus.dispatch({ type: "removePieces", ids: gone });
  // El Tirano (sináptico) al lado
  const tir = bus.state.units.find((u) => u.datasheet === "tirano")!.id;
  const g0 = bus.state.pieces.find((p) => p.unit === gar)!;
  const tp = bus.state.pieces.find((p) => p.unit === tir)!;
  bus.dispatch({ type: "move", id: tp.id, x: g0.x + 3, z: g0.z - 3 });
  assert.equal(stratBlocked(bus.state, "oleada", gar), null);
  bus.dispatch({ type: "stratagem", id: "oleada", unit: gar });
  const back = bus.state.pieces.filter((p) => p.unit === gar).length - 14;
  assert.ok(back >= 2 && back <= 4, `vuelven ${back}`);
  const ids = bus.state.pieces.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});
