import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { relicOf, PICK_RANGE, RELIC_R } from "../src/rules/relic";
import { onForbiddenTerrain } from "../src/rules/geometry";
import { objectiveStatus } from "../src/rules/missions";
import { BASE_RADIUS } from "../src/core/state";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

function game(seed = 8) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "reliquia" });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  bus.dispatch({ type: "nextPhase" });   // movimiento de la Legión
  return bus;
}

test("la reliquia no queda dentro de escenografía sólida (búnker del centro)", () => {
  const s = game().state;
  const o = relicOf(s)!;
  assert.ok(o);
  assert.equal(onForbiddenTerrain(s.terrain, o.x, o.z, RELIC_R + 1.6), null);
});

test("se recoge a 1\", la lleva quien la tiene, y cae si muere", () => {
  const bus = game();
  const o0 = relicOf(bus.state)!;
  const asalto = bus.state.units.find((u) => u.datasheet === "asalto")!.id;
  const p = bus.state.pieces.find((q) => q.unit === asalto)!;
  // A 3" no la recoge (aunque ya la controlaría como objetivo normal)
  bus.dispatch({ type: "setRulesMode", on: false });
  bus.dispatch({ type: "moveMany", moves: [{ id: p.id, x: o0.x + RELIC_R + BASE_RADIUS[p.model] + 2.5, z: o0.z }] });
  bus.dispatch({ type: "setRulesMode", on: true });
  assert.equal(relicOf(bus.state)!.carrier, null);
  bus.dispatch({ type: "setRulesMode", on: false });
  bus.dispatch({ type: "moveMany", moves: [{ id: p.id, x: o0.x + RELIC_R + BASE_RADIUS[p.model] + PICK_RANGE - 0.2, z: o0.z }] });
  bus.dispatch({ type: "setRulesMode", on: true });
  const r = relicOf(bus.state)!;
  assert.equal(r.carrier, asalto);
  assert.equal(objectiveStatus(bus.state, r).holder, 0);
  // Se mueve con la unidad
  const lead = bus.state.pieces.find((q) => q.unit === asalto)!;
  bus.dispatch({ type: "setRulesMode", on: false });
  bus.dispatch({ type: "moveMany", moves: bus.state.pieces.filter((q) => q.unit === asalto).map((q) => ({ id: q.id, x: q.x, z: q.z + 4 })) });
  assert.ok(Math.abs(relicOf(bus.state)!.z - (lead.z + 4)) < 1e-6);
  // Muere la unidad: cae donde estaba
  const last = relicOf(bus.state)!;
  bus.dispatch({ type: "removePieces", ids: bus.state.pieces.filter((q) => q.unit === asalto).map((q) => q.id) });
  const dropped = relicOf(bus.state)!;
  assert.equal(dropped.carrier, null);
  assert.equal(dropped.x, last.x); assert.equal(dropped.z, last.z);
});

test("IA contra IA en Reliquia: alguien la recoge y puntúa, sin romper nada", () => {
  let picked = 0, scored = 0;
  for (const seed of [1, 2, 3, 4]) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "reliquia" });
    bus.dispatch({ type: "setRulesMode", on: true });
    let g = 0, got = false;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `reliquia ${seed}`);
      if (relicOf(bus.state)!.carrier) got = true;
    }
    if (got) picked++;
    if ((bus.state.vpLog ?? []).some((e) => /Reliquia/.test(e.why))) scored++;
  }
  assert.ok(picked >= 3, `la recogen en ${picked}/4`);
  assert.ok(scored >= 2, `puntúan con ella en ${scored}/4`);
});
