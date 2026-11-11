import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { aiPlayPhase } from "../src/ai/tactics";
import { recapHtml, turnRecap } from "../src/rules/recap";
import type { GameState } from "../src/core/state";

test("el resumen cuenta las bajas y los PV del turno rival", () => {
  const bus = new CommandBus(11);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar", secondaries: true });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  let start: GameState | null = null, checked = 0;
  for (let g = 0; g < 60 && !bus.state.gameOver; g++) {
    const prev = bus.state;
    aiPlayPhase(bus, "dificil");
    const s = bus.state;
    if (s.active !== prev.active) {
      if (start) {
        const r = turnRecap(start, s, prev.active);
        const lostModels: number = start.pieces.filter((p) => p.faction === (s.active === 0 ? "legion" : "swarm")).length
          - s.pieces.filter((p) => p.faction === (s.active === 0 ? "legion" : "swarm")).length;
        assert.equal(r.lost.reduce((n, l) => n + l.models, 0), lostModels);
        assert.equal(r.vp[0], (s.vp ?? [0, 0])[0] - (start.vp ?? [0, 0])[0]);
        assert.ok(recapHtml(r).includes("Lo que ha hecho"));
        checked++;
      }
      start = s;
    }
  }
  assert.ok(checked >= 4);
});
