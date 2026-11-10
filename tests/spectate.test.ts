import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { AiController } from "../src/ai/controller";
import { runtime, settings } from "../src/ai/settings";
import { invariants } from "./fullgame.test";

test("modo espectador: la IA juega los dos bandos de principio a fin (con combates)", () => {
  runtime.spectate = true;
  settings.aiLevel = "normal";
  try {
    for (const seed of [31, 32]) {
      const bus = new CommandBus(seed);
      bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
      bus.dispatch({ type: "setRulesMode", on: true });
      const ai = new AiController(bus, () => false);
      let fights = 0, g = 0;
      while (!bus.state.gameOver && g++ < 6000) {
        ai.update(1);
        if (bus.state.phase === "combate" && (bus.state.turnLog.fought ?? []).length) fights++;
        invariants(bus.state, `espectador ${seed}`);
      }
      assert.ok(bus.state.gameOver, `semilla ${seed}: acaba (ronda ${bus.state.turn}, ${bus.state.phase})`);
      assert.ok(fights > 0, "hay combates");
    }
  } finally { runtime.spectate = false; }
});
