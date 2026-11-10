import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { scoreObjectives } from "../src/rules/missions";
import { cloneState } from "../src/core/state";

function setup(seed: number) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "asalto" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}

test("Asalto: se sortea quién defiende y los objetivos están en su mitad", () => {
  const seen = new Set<number>();
  for (let seed = 1; seed <= 30; seed++) {
    const s = setup(seed).state;
    assert.ok(s.defender === 0 || s.defender === 1);
    seen.add(s.defender!);
    // La Legión despliega en z > 0: si defiende, los objetivos están en z > 0
    for (const o of s.objectives!) assert.ok(s.defender === 0 ? o.z > 0 : o.z < 0, `semilla ${seed}`);
  }
  assert.equal(seen.size, 2, "defienden los dos bandos según la semilla");
  assert.equal(setup(5).state.defender, setup(5).state.defender, "la misma semilla, el mismo defensor");
});

test("Asalto: el atacante gana 4 PV por objetivo y el defensor 1 (hasta 3)", () => {
  const s0 = setup(3).state;
  const d = s0.defender!, a = (1 - d) as 0 | 1;
  const score = (who: 0 | 1, holder: 0 | 1, n: number) => {
    const s = cloneState(s0);
    s.turn = 2; s.active = who; s.vp = [0, 0];
    const f = holder === 0 ? "legion" : "swarm";
    // Pone una miniatura del que controla en cada uno de los n primeros objetivos (y quita las demás)
    const mine = s.pieces.filter((p) => p.faction === f);
    s.pieces = s.objectives!.slice(0, n).map((o, i) => ({ ...mine[i], x: o.x, z: o.z }));
    scoreObjectives(s, "final");
    return s.vp[who];
  };
  assert.equal(score(a, a, 2), 8);
  assert.equal(score(d, d, 3), 3);
  assert.equal(score(d, d, 1), 1);
});
