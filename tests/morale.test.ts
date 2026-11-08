import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { belowHalf, inSynapse, objectiveControl, runMoraleTests } from "../src/rules/morale";
import { cloneState, GameState } from "../src/core/state";

/** Quita miniaturas de una unidad directamente del estado (para preparar casos). */
function kill(s: GameState, unit: string, n: number) {
  const ids = s.pieces.filter((p) => p.unit === unit).slice(0, n).map((p) => p.id);
  s.pieces = s.pieces.filter((p) => !ids.includes(p.id));
}

test("por debajo de la mitad", () => {
  const s = cloneState(new CommandBus(1).state);
  assert.equal(belowHalf(s, "U2"), false);
  kill(s, "U2", 5);                                 // 5 de 10: justo la mitad, no por debajo
  assert.equal(belowHalf(s, "U2"), false);
  kill(s, "U2", 1);                                 // 4 de 10
  assert.equal(belowHalf(s, "U2"), true);
});

test("chequeo: 2D6 contra L; si falla, desmoralizada y CO 0; se recupera en su siguiente mando", () => {
  let failed = 0, passed = 0;
  for (let seed = 1; seed < 80 && (!failed || !passed); seed++) {
    const s = cloneState(new CommandBus(seed).state);
    s.rulesMode = true;
    s.active = 1;
    kill(s, "U2", 7);
    const [e] = runMoraleTests(s);
    assert.equal(e.unit, "U2");
    assert.equal(e.need, 8);
    assert.equal(e.passed, e.dice![0] + e.dice![1] >= 8);
    assert.equal(!!s.units.find((u) => u.id === "U2")!.shocked, !e.passed);
    if (!e.passed) {
      failed++;
      assert.equal(objectiveControl(s, "U2"), 0);
      // en el siguiente chequeo se recupera (y vuelve a chequear porque sigue por debajo)
      runMoraleTests(s);
      assert.equal(s.moraleLog.length, 2);
    } else passed++;
  }
  assert.ok(failed && passed);
});

test("sinapsis: a 12\" de una unidad Sináptica supera sola", () => {
  const s = cloneState(new CommandBus(2).state);
  s.rulesMode = true; s.active = 1;
  // Un Guerrero Nodo (Sináptico) a 6" de las Garras
  s.units.push({ id: "U9", datasheet: "nodo", faction: "swarm", startingModels: 1 });
  const g = s.pieces.find((p) => p.unit === "U2")!;
  s.pieces.push({ id: "N1", faction: "swarm", model: "garra", x: g.x + 6, z: g.z, rot: 0, unit: "U9" });
  assert.equal(inSynapse(s, "U2"), true);
  kill(s, "U2", 8);
  const [e] = runMoraleTests(s);
  assert.equal(e.dice, null);
  assert.equal(e.passed, true);
  // lejos, ya no
  s.pieces.find((p) => p.id === "N1")!.x += 30;
  assert.equal(inSynapse(s, "U2"), false);
});

test("se chequea al entrar en la fase de mando del jugador, en modo reglas", () => {
  const bus = new CommandBus(5);
  bus.dispatch({ type: "setRulesMode", on: true });
  const s = bus.state;
  // quita 7 Garras con órdenes de verdad no hay: prepara con moveMany fuera de la mesa no vale; usamos el estado clonado
  const ids = s.pieces.filter((p) => p.unit === "U2").slice(0, 7).map((p) => p.id);
  (bus as unknown as { state: GameState }).state = { ...s, pieces: s.pieces.filter((p) => !ids.includes(p.id)) };
  for (let i = 0; i < 5; i++) bus.dispatch({ type: "nextPhase" });   // → mando del Enjambre
  assert.equal(bus.state.active, 1);
  assert.equal(bus.state.moraleLog.length, 1);
  assert.equal(bus.state.moraleLog[0].unit, "U2");
});
