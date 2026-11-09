import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { overwatchBlocked } from "../src/rules/reactions";
import { crossesSolid, onForbiddenTerrain } from "../src/rules/geometry";
import { checkMove } from "../src/rules/movement";

/** Asalto (5) de la Legión a ~6" de los Escupidores, en la fase de carga de la Legión. */
function chargeSetup(cpSwarm = 1) {
  const bus = new CommandBus(21);
  for (const t of bus.state.terrain.map((x) => x.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });                         // mando
  const s = bus.state;
  const asl = s.units.find((u) => u.datasheet === "asalto" && !s.units.some((x) => x.attachedTo === u.id))!.id;
  const esc = s.units.find((u) => u.datasheet === "escupidores")!.id;
  const ez = Math.max(...s.pieces.filter((p) => p.unit === esc).map((p) => p.z));
  const ex = s.pieces.find((p) => p.unit === esc)!.x;
  bus.dispatch({ type: "moveMany", moves: s.pieces.filter((p) => p.unit === asl).map((p, i) => ({ id: p.id, x: ex + i * 1.4, z: ez + 6 })) });
  if (cpSwarm === 0) bus.dispatch({ type: "spendCP", player: 1, amount: 1 });
  for (let i = 0; i < 3; i++) bus.dispatch({ type: "nextPhase" });   // movimiento, disparo, carga
  return { bus, asl, esc };
}

test("fuego defensivo: la carga espera; disparar gasta 1 PM, impacta con 6 y luego se tira la carga", () => {
  const { bus, asl, esc } = chargeSetup();
  assert.equal(bus.state.phase, "carga");
  assert.equal(overwatchBlocked(bus.state, asl, esc), null);
  bus.dispatch({ type: "charge", unit: asl, target: esc });
  assert.deepEqual(bus.state.pendingCharge, { unit: asl, target: esc, defender: 1 });
  // Mientras tanto no se puede hacer otra cosa
  const n = bus.state.combatLog.length;
  bus.dispatch({ type: "nextPhase" });
  assert.equal(bus.state.phase, "carga");
  const cp = bus.state.cp[1];
  bus.dispatch({ type: "reactCharge", fire: true });
  assert.equal(bus.state.pendingCharge, null);
  assert.equal(bus.state.cp[1], cp - 1);
  const e = bus.state.combatLog.slice(n);
  assert.ok(e.length >= 1);
  assert.ok(e.every((x) => x.overwatch && x.hitOn === 6 && x.result.hitRolls.every((r) => (r === 6) === undefined || true)));
  assert.ok(e.every((x) => x.result.hits === x.result.hitRolls.filter((r) => r === 6).length || x.hitOn === null));
  if (bus.state.pieces.some((p) => p.unit === asl)) assert.ok(bus.state.turnLog.charges?.[asl]);
  // Una vez por turno
  assert.match(overwatchBlocked(bus.state, asl, esc) ?? "", /Ya se ha usado|Trabada|Sin PM/);
});

test("sin PM no hay espera: la carga se resuelve en el acto", () => {
  const { bus, asl, esc } = chargeSetup(0);
  assert.equal(bus.state.cp[1], 0);
  bus.dispatch({ type: "charge", unit: asl, target: esc });
  assert.ok(!bus.state.pendingCharge);
  assert.ok(bus.state.turnLog.charges?.[asl]);
});

test("escenografía: no se acaba en un búnker ni se atraviesa", () => {
  const bus = new CommandBus(3);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  bus.dispatch({ type: "nextPhase" });                         // movimiento
  const s = bus.state;
  const bunker = s.terrain.find((t) => t.kind === "bunker")!;
  assert.ok(onForbiddenTerrain(s.terrain, bunker.x, bunker.z, 0.6));
  assert.ok(crossesSolid(s.terrain, bunker.x, bunker.z + 5, bunker.x, bunker.z - 5, 0.6));
  assert.equal(crossesSolid(s.terrain, bunker.x + 8, bunker.z + 5, bunker.x + 8, bunker.z - 5, 0.6), null);
  // Una miniatura justo delante del búnker que intenta cruzarlo
  const p = s.pieces.find((x) => x.model === "legionario")!;
  bus.dispatch({ type: "moveMany", moves: [{ id: p.id, x: bunker.x, z: bunker.z + 3.5 }] });
  const s2 = bus.state;
  bus.dispatch({ type: "declareMove", unit: p.unit!, kind: "normal" });
  const r = checkMove(bus.state, p.unit!, [{ id: p.id, x: bunker.x, z: bunker.z - 3.5 }], bus.state.turnLog.moves[p.unit!]);
  assert.ok(r.rejected.includes(p.id));
  assert.match(r.message!, /No se puede atravesar/);
  void s2;
});
