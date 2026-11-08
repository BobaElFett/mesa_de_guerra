import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { allowance, checkMove, clampToAllowance, isEngaged, movedSoFar, canShootAfter, canChargeAfter } from "../src/rules/movement";

function toMovement(seed = 5) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });   // mando → movimiento
  return bus;
}

test("al entrar en movimiento se apuntan los orígenes del jugador activo", () => {
  const bus = toMovement();
  assert.equal(bus.state.phase, "movimiento");
  const o = bus.state.turnLog.origins;
  assert.ok(o.L1 && !o.E1);
  const L1 = bus.state.pieces.find((p) => p.id === "L1")!;
  assert.deepEqual(o.L1, [L1.x, L1.z]);
});

test("asignación: M normal, M + D6 al avanzar (dado con semilla, se puede deshacer)", () => {
  const bus = toMovement(11);
  assert.equal(allowance(bus.state, "U1", { kind: "normal" }), 6);
  bus.dispatch({ type: "declareMove", unit: "U1", kind: "avanzar" });
  const mv = bus.state.turnLog.moves.U1;
  assert.ok(mv.advance! >= 1 && mv.advance! <= 6);
  assert.equal(allowance(bus.state, "U1", mv), 6 + mv.advance!);
  assert.equal(bus.state.rolls.at(-1)!.results[0], mv.advance);
  bus.undo();
  assert.equal(bus.state.turnLog.moves.U1, undefined);
  bus.redo();
  assert.equal((bus.state.turnLog.moves as Record<string, { advance?: number }>).U1.advance, mv.advance);
});

test("checkMove: se recorta a la asignación desde el origen", () => {
  const bus = toMovement();
  const L1 = bus.state.pieces.find((p) => p.id === "L1")!;
  const r = checkMove(bus.state, "U1", [{ id: "L1", x: L1.x, z: L1.z - 10 }], { kind: "normal" });
  assert.equal(r.rejected.length, 0);
  assert.ok(Math.abs(r.moves[0].z - (L1.z - 6)) < 0.011);
  assert.match(r.message!, /Hasta 6"/);
  bus.dispatch({ type: "moveMany", moves: r.moves });
  assert.ok(Math.abs(movedSoFar(bus.state, "U1") - 6) < 0.011);
  // un segundo arrastre en la misma fase sigue midiendo desde el origen
  const r2 = checkMove(bus.state, "U1", [{ id: "L1", x: L1.x, z: L1.z - 9 }], { kind: "normal" });
  assert.ok(Math.abs(r2.moves[0].z - (L1.z - 6)) < 0.011);
});

test("checkMove: nunca acaba a 1\" de un enemigo (va al sitio legal más cercano)", () => {
  const bus = toMovement();
  const L1 = bus.state.pieces.find((p) => p.id === "L1")!;
  bus.dispatch({ type: "moveMany", moves: [{ id: "E1", x: L1.x, z: L1.z - 5 }] });
  const r = checkMove(bus.state, "U1", [{ id: "L1", x: L1.x, z: L1.z - 4 }, { id: "L2", x: L1.x + 2, z: L1.z }], { kind: "normal" });
  assert.equal(r.rejected.length, 0);
  const m = r.moves.find((x) => x.id === "L1")!;
  const E1 = bus.state.pieces.find((p) => p.id === "E1")!;
  assert.ok(Math.hypot(m.x - E1.x, m.z - E1.z) - 0.63 - 0.49 > 1, "fuera del trabamiento");
  assert.ok(Math.hypot(m.x - L1.x, m.z - L1.z) <= 6 + 1e-6, "dentro de la asignación");
  // y no se solapa con su compañera
  const m2 = r.moves.find((x) => x.id === "L2")!;
  assert.ok(Math.hypot(m.x - m2.x, m.z - m2.z) >= 1.26 - 1e-6);
});

test("trabada y restricciones tras mover", () => {
  const bus = toMovement();
  const L1 = bus.state.pieces.find((p) => p.id === "L1")!;
  assert.equal(isEngaged(bus.state, "U1"), false);
  bus.dispatch({ type: "moveMany", moves: [{ id: "E1", x: L1.x, z: L1.z - 1.9 }] });
  assert.equal(isEngaged(bus.state, "U1"), true);
  assert.equal(isEngaged(bus.state, "U2"), true);
  assert.equal(canShootAfter({ kind: "avanzar", advance: 3 }, false), false);
  assert.equal(canShootAfter({ kind: "avanzar", advance: 3 }, true), true);
  assert.equal(canShootAfter({ kind: "retirarse" }, true), false);
  assert.equal(canChargeAfter({ kind: "avanzar" }, true), true);
  assert.equal(canChargeAfter({ kind: "avanzar" }, false), false);
  assert.equal(canChargeAfter({ kind: "normal" }, false), true);
});

test("clampToAllowance acerca el punto a su origen", () => {
  assert.deepEqual(clampToAllowance([0, 0], 3, 4, 10), [3, 4]);
  const [x, z] = clampToAllowance([0, 0], 6, 8, 5);
  assert.ok(Math.abs(x - 3) < 1e-9 && Math.abs(z - 4) < 1e-9);
});

test("el registro del turno se vacía en la siguiente fase de mando", () => {
  const bus = toMovement();
  bus.dispatch({ type: "declareMove", unit: "U1", kind: "normal" });
  for (let i = 0; i < 4; i++) bus.dispatch({ type: "nextPhase" });   // → mando del Enjambre
  assert.equal(bus.state.phase, "mando");
  assert.deepEqual(bus.state.turnLog.moves, {});
});
