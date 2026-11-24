import { test } from "node:test";
import assert from "node:assert/strict";
import { entryPoints, listPoints, testLists, validateList } from "../src/rules/armies";
import { randomList } from "../src/rules/randomList";

test("listas al azar de 1.000 puntos (por defecto): siempre válidas, cerca del límite y repetibles", () => {
  for (let i = 1; i <= 80; i++) for (const f of ["legion", "swarm"] as const) {
    const l = randomList(f, i);
    assert.deepEqual(validateList(l, f), [], `${f} ${i}`);
    assert.ok(listPoints(l) >= 880 && listPoints(l) <= 1000, `${f} ${i}: ${listPoints(l)}`);
  }
  assert.deepEqual(randomList("swarm", 77), randomList("swarm", 77));
});

test("escaramuzas de 500 puntos: listas de prueba y al azar válidas", () => {
  const t = testLists(500);
  assert.deepEqual(validateList(t.legion, "legion", 500), []);
  assert.deepEqual(validateList(t.swarm, "swarm", 500), []);
  const t1000 = testLists(1000);
  assert.deepEqual(validateList(t1000.legion, "legion", 1000), []);
  assert.deepEqual(validateList(t1000.swarm, "swarm", 1000), []);
  assert.ok(validateList(t1000.legion, "legion", 500).length > 0, "a 500 no valen");
  for (let i = 1; i <= 60; i++) for (const f of ["legion", "swarm"] as const) {
    const l = randomList(f, i, 500);
    assert.deepEqual(validateList(l, f, 500), [], `${f} ${i}`);
    assert.ok(listPoints(l) >= 380 && listPoints(l) <= 500, `${f} ${i}: ${listPoints(l)}`);
  }
});

test("11.ª: 2 unidades iguales (4 de línea de batalla) y la 3.ª+ puede costar más", () => {
  const mons = { units: [{ datasheet: "tirano" as const, models: 1 }, { datasheet: "devorador" as const, models: 1 }, { datasheet: "guardiana" as const, models: 1 }, { datasheet: "carnifice" as const, models: 2 }] };
  assert.deepEqual(validateList(mons, "swarm"), []);   // ya no hay límite de unidades grandes
  const three = { units: [{ datasheet: "tirano" as const, models: 1 }, ...Array(3).fill({ datasheet: "devorador", models: 1 })] };
  assert.match(validateList(three, "swarm").join(" "), /Como mucho 2 Devorador/);
  const gaunts = { units: [{ datasheet: "mente" as const, models: 1 }, ...Array(4).fill({ datasheet: "garras", models: 10 })] };
  assert.deepEqual(validateList(gaunts, "swarm"), []);
  // Coste escalonado: la 3.ª unidad de Exterminadores (si se pudieran 3) costaría 230; la 1.ª y 2.ª, 190
  const term = { units: [{ datasheet: "capitan" as const, models: 1 }, { datasheet: "exterminadores" as const, models: 5 }, { datasheet: "exterminadores" as const, models: 5 }] };
  assert.equal(entryPoints(term, 1), 190);
  assert.equal(entryPoints(term, 2), 190);
  assert.equal(entryPoints({ units: [...term.units, { datasheet: "exterminadores", models: 5 }] }, 3), 230);
});
