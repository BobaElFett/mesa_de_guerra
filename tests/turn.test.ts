import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { MAX_ROUNDS, PHASES } from "../src/rules/turn";

test("cinco fases, cambio de jugador y PM", () => {
  const bus = new CommandBus(1);
  bus.dispatch({ type: "setRulesMode", on: true });
  assert.equal(bus.state.phase, "mando");
  assert.deepEqual(bus.state.cp, [1, 1]);
  for (const p of PHASES.slice(1)) { bus.dispatch({ type: "nextPhase" }); assert.equal(bus.state.phase, p); }
  bus.dispatch({ type: "nextPhase" });                   // combate → turno del Enjambre
  assert.equal(bus.state.active, 1);
  assert.equal(bus.state.phase, "mando");
  assert.equal(bus.state.turn, 1);
  assert.deepEqual(bus.state.cp, [2, 2]);
  for (let i = 0; i < 5; i++) bus.dispatch({ type: "nextPhase" });   // fin del turno del Enjambre
  assert.equal(bus.state.active, 0);
  assert.equal(bus.state.turn, 2);
  assert.deepEqual(bus.state.cp, [3, 3]);
});

test("la partida acaba tras la ronda 5 en modo reglas", () => {
  const bus = new CommandBus(2);
  bus.dispatch({ type: "setRulesMode", on: true });
  for (let i = 0; i < MAX_ROUNDS * 2 * 5 - 1; i++) bus.dispatch({ type: "nextPhase" });
  assert.equal(bus.state.turn, 5);
  assert.equal(bus.state.active, 1);
  assert.equal(bus.state.phase, "combate");
  assert.equal(bus.state.gameOver, false);
  bus.dispatch({ type: "nextPhase" });
  assert.equal(bus.state.gameOver, true);
  bus.dispatch({ type: "nextPhase" });                   // ya no avanza
  assert.equal(bus.state.turn, 5);
  bus.undo();                                            // deshace el avance que no hizo nada
  assert.equal(bus.state.gameOver, true);
  bus.undo();                                            // deshace el final
  assert.equal(bus.state.gameOver, false);
});

test("mesa libre: Pasar turno sin límite de rondas", () => {
  const bus = new CommandBus(3);
  for (let i = 0; i < 14; i++) bus.dispatch({ type: "endTurn" });
  assert.equal(bus.state.turn, 8);
  assert.equal(bus.state.gameOver, false);
});

test("gastar PM: no baja de cero", () => {
  const bus = new CommandBus(4);
  bus.dispatch({ type: "spendCP", player: 0, amount: 1 });
  assert.deepEqual(bus.state.cp, [0, 1]);
  bus.dispatch({ type: "spendCP", player: 0, amount: 1 });
  assert.deepEqual(bus.state.cp, [0, 1]);
});
