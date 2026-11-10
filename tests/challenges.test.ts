import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { CHALLENGES, ChallengeMemo, setupChallenge } from "../src/rules/challenges";
import { validateList } from "../src/rules/armies";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

test("desafíos: listas válidas, mesa preparada sin solapes y que acaban (IA contra IA)", () => {
  for (const c of CHALLENGES) {
    assert.deepEqual(validateList(c.legion, "legion", 1000), [], c.id);
    assert.deepEqual(validateList(c.swarm, "swarm", 1000), [], c.id);
    const stars: number[] = [];
    for (const seed of [1, 2, 3]) {
      const bus = new CommandBus(seed);
      setupChallenge(bus, c);
      invariants(bus.state, `${c.id} preparado`);
      assert.equal(bus.state.phase, "mando");
      const memo: ChallengeMemo = {};
      let r = c.check(bus.state, memo), g = 0;
      while (!r.over && g++ < 200) { aiPlayPhase(bus, "normal"); invariants(bus.state, c.id); r = c.check(bus.state, memo); }
      assert.ok(r.over, `${c.id} acaba`);
      stars.push(r.stars);
    }
    console.log(c.id, stars.join(","));
  }
});
