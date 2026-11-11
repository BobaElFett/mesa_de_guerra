import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { aiPlayPhase } from "../src/ai/tactics";
import { HAND_SIZE, SECONDARIES, SECONDARY_CAP, SECONDARY_IDS, discardBlocked, quarterOf, secondaryVp } from "../src/rules/secondaries";
import { invariants } from "./fullgame.test";

function start(seed = 3, on = true) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar", secondaries: on });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}

test("sin la opción no hay órdenes", () => {
  const bus = start(3, false);
  bus.dispatch({ type: "nextPhase" });
  assert.equal(bus.state.secondaries, undefined);
});

test("cada jugador roba hasta 2 órdenes al empezar su mando, de su propio mazo", () => {
  const bus = start();
  const s0 = bus.state.secondaries!;
  assert.equal(s0.deck[0].length, SECONDARY_IDS.length);
  assert.equal(new Set(s0.deck[0]).size, SECONDARY_IDS.length);
  bus.dispatch({ type: "nextPhase" });   // ronda 1, mando de la Legión
  assert.equal(bus.state.secondaries!.hand[0].length, HAND_SIZE);
  assert.equal(bus.state.secondaries!.hand[1].length, 0);
});

test("descartar una orden da 1 PM, solo una vez por turno", () => {
  const bus = start();
  bus.dispatch({ type: "nextPhase" });
  const cp = bus.state.cp[0];
  const [a, b] = bus.state.secondaries!.hand[0];
  bus.dispatch({ type: "discardSecondary", id: a });
  assert.equal(bus.state.cp[0], cp + 1);
  assert.ok(!bus.state.secondaries!.hand[0].includes(a));
  assert.ok(discardBlocked(bus.state, b));
  bus.dispatch({ type: "discardSecondary", id: b });
  assert.equal(bus.state.cp[0], cp + 1);
  assert.ok(bus.state.secondaries!.hand[0].includes(b));
});

test("«Dominar el centro» se puntúa al acabar el turno y sale de la mano", () => {
  const bus = start();
  bus.dispatch({ type: "nextPhase" });
  const s = bus.state;
  // Pon «centro» en la mano a mano (estado de prueba) y una miniatura de la Legión en el centro
  s.secondaries!.hand[0] = ["centro"];
  const p = s.pieces.find((x) => x.faction === "legion" && x.unit)!;
  bus.dispatch({ type: "moveMany", moves: [{ id: p.id, x: 0, z: 3 }] } as never);
  for (let i = 0; i < 5; i++) bus.dispatch({ type: "nextPhase" });
  const t = bus.state;
  assert.ok(!t.pieces.some((m) => m.faction === "swarm" && Math.hypot(m.x, m.z) <= 6));
  assert.equal(t.secondaries!.scored[0].length, 1);
  assert.equal(t.secondaries!.scored[0][0].id, "centro");
  assert.ok(t.vpLog!.some((v) => v.why.includes("Dominar el centro")));
});

test("cuartos de la mesa", () => {
  assert.equal(quarterOf(1, 1), null);
  assert.equal(quarterOf(-10, -10), 0);
  assert.equal(quarterOf(10, 10), 3);
});

test("partidas enteras con órdenes: el tope se respeta y la mano nunca pasa de 2", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const bus = start(seed);
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      const s = bus.state;
      if (s.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, seed % 2 ? "dificil" : "normal");
      const sec = bus.state.secondaries!;
      assert.ok(sec.hand[0].length <= HAND_SIZE && sec.hand[1].length <= HAND_SIZE);
      invariants(bus.state, `sec ${seed}`);
    }
    assert.ok(bus.state.gameOver);
    for (const p of [0, 1] as const) assert.ok(secondaryVp(bus.state, p) <= SECONDARY_CAP);
    const sec = bus.state.secondaries!;
    // Ninguna orden se repite entre mano, mazo y cumplidas
    for (const p of [0, 1] as const) {
      const all = [...sec.deck[p], ...sec.hand[p], ...sec.scored[p].map((x) => x.id)];
      assert.equal(new Set(all).size, all.length);
    }
  }
});

test("todas las órdenes tienen texto y PV", () => {
  for (const id of SECONDARY_IDS) { assert.ok(SECONDARIES[id].text.length > 20); assert.ok(SECONDARIES[id].vp >= 3); }
});
