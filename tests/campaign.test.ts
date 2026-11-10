import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { aiPlayPhase } from "../src/ai/tactics";
import { CAMPAIGN, campaignScore, newCampaign, nextBattle, recordBattle } from "../src/rules/campaign";
import { invariants } from "./fullgame.test";

test("campaña: tres batallas, veteranía entre ellas y marcador final", () => {
  let c = newCampaign("legion", "normal", { legion: TEST_LEGION, swarm: TEST_SWARM }, 77);
  let vetSeen = false;
  while (nextBattle(c)) {
    const n = nextBattle(c)!, b = CAMPAIGN[n - 1];
    const bus = new CommandBus(c.seed + n);
    bus.dispatch({ type: "setArmies", legion: c.lists.legion, swarm: c.lists.swarm, mission: b.mission, campaign: n, ...(b.conditions ? { conditions: b.conditions } : {}) });
    const s0 = bus.state;
    assert.equal(s0.campaignBattle, n);
    assert.equal(s0.conditions, b.conditions);
    // Las veteranas de la lista llegan veteranas a la mesa
    for (const f of ["legion", "swarm"] as const) c.lists[f].units.forEach((e, i) => {
      const u = s0.units.find((x) => x.faction === f && x.entry === i)!;
      assert.equal(!!u.veteran, !!e.veteran, `${f} ${e.datasheet}`);
      if (e.veteran) vetSeen = true;
    });
    bus.dispatch({ type: "setRulesMode", on: true });
    assert.equal(recordBattle(c, bus.state), null, "sin acabar no se apunta");
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "normal");
      invariants(bus.state, `campaña ${n}`);
    }
    const next = recordBattle(c, bus.state)!;
    assert.ok(next);
    assert.equal(recordBattle(next, bus.state), null, "la misma batalla no se apunta dos veces");
    c = next;
  }
  assert.equal(c.results.length, 3);
  assert.ok(vetSeen, "alguna unidad llega veterana a la segunda o tercera batalla");
  const sc = campaignScore(c);
  assert.ok(sc.over);
  assert.equal(sc.wins[0] + sc.wins[1] + c.results.filter((r) => !r.winner).length, 3);
});
