import { test } from "node:test";
import assert from "node:assert/strict";
import { listPoints, validateList } from "../src/rules/armies";
import { randomList } from "../src/rules/randomList";

test("listas al azar: siempre válidas, cerca de 500 puntos, y repetibles con la misma semilla", () => {
  for (let i = 1; i <= 150; i++) for (const f of ["legion", "swarm"] as const) {
    const l = randomList(f, i);
    assert.deepEqual(validateList(l, f), [], `${f} ${i}`);
    assert.ok(listPoints(l) >= 380 && listPoints(l) <= 500);
  }
  assert.deepEqual(randomList("swarm", 77), randomList("swarm", 77));
});
