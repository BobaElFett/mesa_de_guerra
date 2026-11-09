import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { actionsAgainst, pendingText, pendingUnits, selectedFormation, validTargets } from "../src/rules/actions";

function game() {
  const bus = new CommandBus(11);
  for (const t of bus.state.terrain.map((x) => x.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });   // mando
  bus.dispatch({ type: "nextPhase" });   // movimiento
  return bus;
}

test("guía: en movimiento quedan las formaciones sin mover; el líder va con su escuadra", () => {
  const bus = game();
  const left = pendingUnits(bus.state, "legion");
  assert.equal(left.length, 3);                    // Asalto 10 (+Capitán), Asalto 5, Fuego Pesado
  assert.deepEqual(pendingUnits(bus.state, "swarm"), []);
  bus.dispatch({ type: "declareMove", unit: left[0], kind: "normal" });
  assert.equal(pendingUnits(bus.state, "legion").length, 2);
  assert.match(pendingText(bus.state, "legion")!, /Quedan por mover/);
});

test("selección: una formación (escuadra + líder) cuenta como una", () => {
  const bus = game();
  const s = bus.state;
  const cap = s.units.find((u) => u.datasheet === "capitan")!;
  const ids = s.pieces.filter((p) => p.unit === cap.id || p.unit === cap.attachedTo).map((p) => p.id);
  assert.deepEqual(selectedFormation(s, ids), [cap.attachedTo, cap.id]);
  const other = s.pieces.find((p) => p.faction === "legion" && p.unit !== cap.id && p.unit !== cap.attachedTo)!;
  assert.equal(selectedFormation(s, [...ids, other.id]), null);
});

test("acciones contra un enemigo: disparo con daño esperado y carga con probabilidad", () => {
  const bus = game();
  const s0 = bus.state;
  const pesado = s0.units.find((u) => u.datasheet === "fuegoPesado")!.id;
  const garras = s0.units.find((u) => u.datasheet === "garras")!.id;
  for (const u of s0.units.filter((x) => x.faction === "legion")) bus.dispatch({ type: "declareMove", unit: u.id, kind: "normal" });
  // Las Garras, a 10" de la escuadra pesada
  const pz = Math.min(...bus.state.pieces.filter((p) => p.unit === pesado).map((p) => p.z));
  const px = bus.state.pieces.find((p) => p.unit === pesado)!.x;
  bus.dispatch({ type: "moveMany", moves: bus.state.pieces.filter((p) => p.unit === garras).map((p, i) => ({ id: p.id, x: px - 4 + (i % 10) * 1.1, z: pz - 10 - Math.floor(i / 10) * 1.1 })) });
  bus.dispatch({ type: "nextPhase" });            // disparo
  const acts = actionsAgainst(bus.state, [pesado], garras);
  const ok = acts.filter((a) => a.cmd);
  assert.ok(ok.length >= 1);
  assert.match(ok[0].detail, /heridas/);
  assert.ok(validTargets(bus.state, [pesado]).has(garras));
  bus.dispatch(ok[0].cmd!);
  assert.equal(bus.state.combatLog.length, 1);
  bus.dispatch({ type: "nextPhase" });            // carga
  const asl = bus.state.units.find((u) => u.datasheet === "asalto" && !bus.state.units.some((x) => x.attachedTo === u.id))!.id;
  const ch = actionsAgainst(bus.state, [asl], garras);
  assert.equal(ch.length, 1);
  assert.match(ch[0].detail, /2D6|lejos/);
});
