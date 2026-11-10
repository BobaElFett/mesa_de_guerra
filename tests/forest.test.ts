import { test } from "node:test";
import assert from "node:assert/strict";
import { TerrainPiece } from "../src/core/state";
import { lengthInside, onForbiddenTerrain, sight } from "../src/rules/geometry";
import { randomMap } from "../src/rules/maps";

const forest: TerrainPiece = { id: "T1", kind: "bosque", x: 0, z: 0, rot: 0 };   // 7 × 5
const at = (x: number, z: number) => ({ x, z, r: 0.63 });

test("bosque: largo del tramo dentro de la huella", () => {
  assert.ok(Math.abs(lengthInside(forest, -10, 0, 10, 0) - 7) < 1e-9);
  assert.ok(Math.abs(lengthInside(forest, 0, -10, 0, 10) - 5) < 1e-9);
  assert.equal(lengthInside(forest, -10, 4, 10, 4), 0);
});

test("bosque: dentro o detrás de un trocito, cobertura; a través de mucho, no se ve", () => {
  assert.equal(sight(at(-12, 0), at(12, 0), [forest]), "oculta");          // 7" de bosque
  assert.equal(sight(at(-12, 2.2), at(12, 2.2), [forest]), "cobertura");   // roza el borde: menos de 3" dentro
  assert.equal(sight(at(-12, 0), at(0, 0), [forest]), "cobertura");        // el objetivo está dentro
  assert.equal(sight(at(0, 0), at(12, 0), [forest]), "visible");           // desde dentro hacia fuera, a la vista
  assert.equal(onForbiddenTerrain([forest], 0, 0, 0.63), null);             // se puede acabar dentro
});

test("tipos de mapa: simétricos y con la densidad de su tipo", () => {
  const count = (style: "urbano" | "llanura" | "bosque" | "aleatorio") => {
    let n = 0, forests = 0;
    for (let s = 1; s <= 20; s++) {
      const m = randomMap(s, style);
      n += m.length; forests += m.filter((t) => t.kind === "bosque").length;
      for (const t of m) if (t.x || t.z) assert.ok(m.some((u) => u.kind === t.kind && Math.abs(u.x + t.x) < 1e-9 && Math.abs(u.z + t.z) < 1e-9), `${style} ${s}: ${t.kind} sin su simétrica`);
    }
    return { n: n / 20, forests: forests / 20 };
  };
  const u = count("urbano"), l = count("llanura"), b = count("bosque");
  assert.ok(u.n > l.n + 6, `urbano ${u.n} contra llanura ${l.n}`);
  assert.ok(b.forests >= 4, `bosques por mapa ${b.forests}`);
});
