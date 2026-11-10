import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { suggest } from "../src/ai/suggest";
import { aiPlayPhase } from "../src/ai/tactics";

test("sugerir jugada: propone algo en cada fase sin tocar la mesa ni los dados", () => {
  const bus = new CommandBus(7);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  const seen = new Set<string>();
  for (let i = 0; i < 25 && !bus.state.gameOver; i++) {
    const before = bus.state, len = bus.length, rng = JSON.stringify(before.rng ?? null);
    const sg = suggest(bus);
    assert.equal(bus.state, before);
    assert.equal(bus.length, len);
    assert.equal(JSON.stringify(bus.state.rng ?? null), rng);
    assert.ok(sg.text.length > 5);
    if (sg.unit) { assert.ok(bus.state.units.some((u) => u.id === sg.unit)); seen.add(bus.state.phase); }
    aiPlayPhase(bus, "normal");
  }
  for (const ph of ["movimiento", "disparo"]) assert.ok(seen.has(ph), `sugiere en ${ph}: ${[...seen]}`);
});

test("repetición: seek y stepForward recorren la partida y vuelven al mismo final", async () => {
  const { stateHash } = await import("../src/net/protocol");
  const bus = new CommandBus(11);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  for (let i = 0; i < 12 && !bus.state.gameOver; i++) aiPlayPhase(bus, "normal");
  const end = bus.length, h = stateHash(bus.state);
  bus.seek(2);
  assert.equal(bus.length, 2);
  assert.equal(bus.total, end);
  let n = 0;
  while (bus.stepForward()) n++;
  assert.equal(n, end - 2);
  assert.equal(stateHash(bus.state), h);
  bus.seek(5); bus.seek(end);
  assert.equal(stateHash(bus.state), h);
});
