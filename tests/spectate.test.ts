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

test("deshacer mi jugada: vuelve a antes de la última orden del jugador, con todo lo de la IA", async () => {
  const { AiController } = await import("../src/ai/controller");
  const { settings: st, runtime: rt } = await import("../src/ai/settings");
  rt.spectate = false; st.aiSide = "swarm"; st.aiLevel = "normal";
  const bus = new CommandBus(41);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  const ai = new AiController(bus, () => false);
  for (let i = 0; i < 5; i++) ai.update(1);                 // la IA despliega
  while (bus.state.phase === "despliegue" || bus.state.active !== 0) bus.dispatch({ type: "nextPhase" });
  // El jugador pasa todas sus fases (la última da el turno a la IA)
  while (bus.state.active === 0) bus.dispatch({ type: "nextPhase" });
  const mine = bus.length;
  for (let i = 0; i < 60 && bus.state.active === 1; i++) ai.update(1);   // la IA juega su turno
  assert.ok(bus.length > mine + 2, "la IA ha hecho cosas");
  const n = bus.undoMine();
  assert.equal(bus.length, mine - 1);
  assert.equal(n, bus.total - (mine - 1));
  assert.equal(bus.state.active, 0, "vuelve al turno del jugador");
  st.aiSide = "swarm";
});
