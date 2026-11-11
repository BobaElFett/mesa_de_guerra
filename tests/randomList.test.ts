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

test("batallas de 1000 puntos: listas de prueba y al azar válidas, y el doble de límites", async () => {
  const { testLists } = await import("../src/rules/armies");
  const t = testLists(1000);
  assert.deepEqual(validateList(t.legion, "legion", 1000), []);
  assert.deepEqual(validateList(t.swarm, "swarm", 1000), []);
  assert.ok(validateList(t.legion, "legion", 500).length > 0, "a 500 no valen");
  for (let i = 1; i <= 40; i++) for (const f of ["legion", "swarm"] as const) {
    const l = randomList(f, i, 1000);
    assert.deepEqual(validateList(l, f, 1000), []);
    assert.ok(listPoints(l) > 850);
  }
  const big = { units: [{ datasheet: "tirano" as const, models: 1 }, { datasheet: "devorador" as const, models: 1 }, { datasheet: "guardiana" as const, models: 1 }] };
  assert.equal(validateList(big, "swarm", 1000).filter((e) => /unidades grandes/.test(e)).length, 0);
  assert.ok(validateList(big, "swarm", 500).some((e) => /Como mucho 2 unidades grandes/.test(e)));
});
