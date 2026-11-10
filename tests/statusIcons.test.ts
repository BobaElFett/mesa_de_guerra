import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { aiPlayPhase } from "../src/ai/tactics";
import { unitIcons } from "../src/view/statusIcons";

test("los iconos dicen lo hecho en el turno y se limpian al cambiar de turno", () => {
  const bus = new CommandBus(7);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  if (bus.state.phase === "despliegue") bus.dispatch({ type: "nextPhase" });
  let saw = { moved: false, shot: false };
  let g = 0;
  while (g++ < 12 && !bus.state.gameOver) {
    aiPlayPhase(bus, "normal");
    const s = bus.state;
    for (const u of s.units) {
      const ic = unitIcons(s, u.id);
      if (ic.includes("movio") || ic.includes("avanzo")) saw.moved = true;
      if (ic.includes("disparo")) saw.shot = true;
      if (u.shocked) assert.ok(ic.includes("desmoralizada"));
      if (u.reserve) assert.deepEqual(ic, []);
      if (!s.turnLog.moves[u.id] && !u.shocked && !s.turnLog.shot?.[u.id]?.length) assert.ok(!ic.some((i) => i === "movio" || i === "disparo"));
    }
    if (s.phase === "mando") {
      // Turno nuevo: nada hecho aún (salvo la moral)
      for (const u of s.units) assert.ok(unitIcons(s, u.id).every((i) => i === "desmoralizada"), u.id);
    }
  }
  assert.ok(saw.moved && saw.shot);
});
