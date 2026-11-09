import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { BASE_RADIUS } from "../src/core/state";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { checkDeploy, zoneBand } from "../src/rules/deployment";

function deployed() {
  const bus = new CommandBus(3);
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });                       // la mesa ya iba por otra fase
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  return bus;
}

test("desplegar listas abre la fase de despliegue en la ronda 1", () => {
  const s = deployed().state;
  assert.equal(s.phase, "despliegue");
  assert.equal(s.turn, 1);
  assert.equal(s.active, 0);
  assert.deepEqual(s.cp, [1, 1]);
  assert.equal(s.gameOver, false);
});

test("Empezar partida pasa al mando de la ronda 1 sin ganar PM extra", () => {
  const bus = deployed();
  bus.dispatch({ type: "nextPhase" });
  assert.equal(bus.state.phase, "mando");
  assert.equal(bus.state.turn, 1);
  assert.equal(bus.state.active, 0);
  assert.deepEqual(bus.state.cp, [1, 1]);
  bus.undo();
  assert.equal(bus.state.phase, "despliegue");
});

test("en mesa libre, Pasar turno también acaba el despliegue", () => {
  const bus = new CommandBus(1);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "endTurn" });
  assert.equal(bus.state.phase, "mando");
  assert.equal(bus.state.active, 0);
});

test("recolocar: lo soltado fuera de la zona vuelve a ella y sin solapes", () => {
  const s = deployed().state;
  const legs = s.pieces.filter((p) => p.faction === "legion" && p.model === "legionario").slice(0, 5);
  // Todo al centro de la mesa y apiñado en el mismo punto
  const r = checkDeploy(s, legs.map((p) => ({ id: p.id, x: 0, z: 0 })));
  assert.equal(r.rejected.length, 0);
  assert.ok(r.message);
  const [lo, hi] = zoneBand("legion", BASE_RADIUS.legionario);
  for (const m of r.moves) assert.ok(m.z >= lo - 1e-6 && m.z <= hi + 1e-6, `${m.id} z=${m.z}`);
  const moved = new Set(r.moves.map((m) => m.id));
  const all = [...s.pieces.filter((p) => !moved.has(p.id)), ...r.moves.map((m) => ({ ...s.pieces.find((p) => p.id === m.id)!, x: m.x, z: m.z }))];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= BASE_RADIUS[a.model] + BASE_RADIUS[b.model] - 1e-6, `${a.id}/${b.id}`);
  }
});

test("el Enjambre se queda en su propia franja", () => {
  const s = deployed().state;
  const g = s.pieces.find((p) => p.model === "garra")!;
  const r = checkDeploy(s, [{ id: g.id, x: 5, z: 20 }]);
  const [lo, hi] = zoneBand("swarm", BASE_RADIUS.garra);
  assert.ok(r.moves[0].z >= lo && r.moves[0].z <= hi);
  assert.ok(hi < 0);
});
