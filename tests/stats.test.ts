import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { aiPlayPhase } from "../src/ai/tactics";
import { statsOf, unitOfTheMatch } from "../src/rules/stats";

test("estadísticas: el daño hecho por un bando es el recibido por el otro, y las bajas cuadran", () => {
  for (const seed of [21, 22]) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "caza" });
    bus.dispatch({ type: "setRulesMode", on: true });
    bus.dispatch({ type: "nextPhase" });
    let g = 0;
    while (!bus.state.gameOver && g++ < 200) aiPlayPhase(bus, "normal");
    const s = bus.state;
    const sum = (f: string, k: "dmg" | "taken" | "kills" | "lost") => s.units.filter((u) => u.faction === f).reduce((a, u) => a + statsOf(s, u.id)[k], 0);
    for (const [a, b] of [["legion", "swarm"], ["swarm", "legion"]]) {
      assert.equal(sum(a, "dmg"), sum(b, "taken"));
      assert.equal(sum(a, "kills"), sum(b, "lost"));
    }
    for (const u of s.units) {
      const alive = s.pieces.filter((p) => p.unit === u.id).length;
      assert.equal(u.startingModels - alive, statsOf(s, u.id).lost, `${u.datasheet}: bajas`);
    }
    assert.ok(sum("legion", "dmg") + sum("swarm", "dmg") > 0);
    assert.ok(unitOfTheMatch(s));
  }
});
