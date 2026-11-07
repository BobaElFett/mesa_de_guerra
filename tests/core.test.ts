import { test } from "node:test";
import assert from "node:assert/strict";
import { measure } from "../src/core/measure";
import { resolveOverlaps } from "../src/core/placement";
import { createInitialState, BASE_RADIUS } from "../src/core/state";
import { CommandBus } from "../src/core/commands";

test("medida borde a borde", () => {
  assert.equal(measure({ x: 0, z: 0, r: 0 }, { x: 3, z: 4, r: 0 }).inches, 5);
  assert.ok(Math.abs(measure({ x: 0, z: 0, r: 0.63 }, { x: 10, z: 0, r: 0.49 }).inches - 8.88) < 1e-9);
});

test("sin solapes en 300 colocaciones densas", () => {
  const s = createInitialState(1);
  const leg = s.pieces.filter((p) => p.faction === "legion");
  for (let t = 0; t < 300; t++) {
    const target = s.pieces.filter((p) => p.faction === "swarm")[t % 10];
    const moves = leg.map((p, i) => ({ id: p.id, x: target.x + Math.sin(t + i) * 1.5, z: target.z + Math.cos(t * 3 + i) }));
    const out = resolveOverlaps(s.pieces, moves);
    const pos = new Map(s.pieces.map((p) => [p.id, { x: p.x, z: p.z, r: BASE_RADIUS[p.model] }]));
    for (const m of out) Object.assign(pos.get(m.id)!, { x: m.x, z: m.z });
    const arr = [...pos.values()];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++)
      assert.ok(Math.hypot(arr[i].x - arr[j].x, arr[i].z - arr[j].z) >= arr[i].r + arr[j].r - 1e-3);
  }
});

test("mesa inicial: unidades y miniaturas enlazadas", () => {
  const s = createInitialState(7);
  assert.equal(s.units.length, 2);
  for (const p of s.pieces) assert.ok(s.units.some((u) => u.id === p.unit), p.id);
  assert.equal(s.pieces.filter((p) => p.unit === "U1").length, 5);
  assert.equal(s.pieces.filter((p) => p.unit === "U2" && p.leader).length, 1);
});

test("deshacer y rehacer reproducen los mismos dados", () => {
  const bus = new CommandBus(42);
  bus.dispatch({ type: "roll", count: 10, sides: 6 });
  const a = bus.state.rolls[0].results.join("");
  bus.undo(); bus.redo();
  assert.equal(bus.state.rolls[0].results.join(""), a);
});
