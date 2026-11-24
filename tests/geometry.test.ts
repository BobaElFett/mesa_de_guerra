import { test } from "node:test";
import assert from "node:assert/strict";
import { outOfCoherency, engaged, sight, segmentHitsTerrain, insideTerrain, unitSight } from "../src/rules/geometry";
import { Piece, TerrainPiece } from "../src/core/state";

const leg = (id: string, x: number, z: number): Piece => ({ id, faction: "legion", model: "legionario", x, z, rot: 0 });
const cl = (id: string, x: number, z: number): Piece => ({ id, faction: "swarm", model: "garra", x, z, rot: 0 });
const T = (kind: TerrainPiece["kind"], x: number, z: number, rot = 0): TerrainPiece => ({ id: "T", kind, x, z, rot });
const D = (p: Piece) => ({ x: p.x, z: p.z, r: p.model === "legionario" ? 0.63 : 0.49 });

test("coherencia (11.ª): a 2\" de otra y a 9\" o menos de todas", () => {
  // legionarios en fila a 2,2" de centro a centro = 0,94" de borde a borde: en coherencia
  const row = [0, 2.2, 4.4, 6.6, 8.8].map((x, i) => leg(`L${i}`, x, 0));
  assert.deepEqual(outOfCoherency(row), []);
  // el último a 4" del anterior: fuera
  row[4] = leg("L4", 10.6, 0);
  assert.deepEqual(outOfCoherency(row), ["L0", "L4"]);   // L4 sin vecina; L0, a más de 9" de L4
  // 6 en fila: basta una vecina (ya no hacen falta dos)
  const six = [0, 1.8, 3.6, 5.4, 7.2, 9].map((x, i) => cl(`E${i}`, x, 0));
  assert.deepEqual(outOfCoherency(six), []);
  // una fila larga: las que quedan a más de 9" (borde a borde) de alguna → fuera
  const long = [0, 2, 4, 6, 8, 10, 12].map((x, i) => cl(`F${i}`, x, 0));
  assert.deepEqual(outOfCoherency(long), ["F0", "F1", "F5", "F6"]);
  // en dos filas apretadas, todas tienen dos vecinas
  const block = [0, 1, 2].flatMap((c) => [0, 1].map((r) => cl(`B${c}${r}`, c * 1.5, r * 1.5)));
  assert.deepEqual(outOfCoherency(block), []);
  assert.deepEqual(outOfCoherency([leg("solo", 0, 0)]), []);
});

test("trabada a 2\" de borde a borde (11.ª)", () => {
  assert.equal(engaged([leg("a", 0, 0)], [cl("b", 3.1, 0)]), true);    // 3,1 − 0,63 − 0,49 = 1,98
  assert.equal(engaged([leg("a", 0, 0)], [cl("b", 3.2, 0)]), false);   // 2,08
});

test("huella girada y segmento que la corta", () => {
  const r = T("ruina", 0, 0, Math.PI / 2);   // 6×4 girada: ahora 4 de ancho en x y 6 de fondo en z
  assert.equal(insideTerrain(r, 0, 2.9), true);
  assert.equal(insideTerrain(r, 2.9, 0), false);
  assert.equal(segmentHitsTerrain(r, -10, 0, 10, 0), true);
  assert.equal(segmentHitsTerrain(r, -10, 3.5, 10, 3.5), false);
  assert.equal(segmentHitsTerrain(r, -10, 2.5, 10, 2.5), true);
});

test("visión (11.ª): libre, tapada por un búnker, a través de un cráter y desde dentro de una ruina", () => {
  const a = D(leg("a", -10, 0)), b = D(cl("b", 10, 0));
  assert.equal(sight(a, b, []), "visible");
  assert.equal(sight(a, b, [T("bunker", 0, 0)]), "oculta");
  assert.equal(sight(a, b, [T("crater", 0, 0)]), "visible");        // expuesto: no tapa ni cubre a quien está detrás
  assert.equal(sight(a, { x: 0, z: 0, r: 0.49 }, [T("crater", 0, 0)]), "cobertura");   // dentro, sí
  assert.equal(sight(a, b, [T("barricada", 0, 0)]), "oculta");      // ligera: oculta (salvo a quien está dentro)
  // el búnker solo tapa una parte: se ve por un borde, con cobertura
  assert.equal(sight(a, b, [T("bunker", 0, 2.4)]), "cobertura");
  // objetivo dentro de una ruina: se le ve, con cobertura
  assert.equal(sight(a, { x: 0, z: 0, r: 0.49 }, [T("ruina", 0, 0)]), "cobertura");
  // tirador dentro de una ruina ve hacia fuera sin que la propia ruina le tape
  assert.equal(sight({ x: 0, z: 0, r: 0.63 }, b, [T("ruina", 0, 0)]), "visible");
  // lejos de la línea: no afecta
  assert.equal(sight(a, b, [T("bunker", 0, 10)]), "visible");
});

test("visión de unidad: la mejor de todas y qué miniaturas se ven", () => {
  const shooters = [leg("a", -10, 0)];
  const targets = [cl("b1", 10, 0), cl("b2", 10, 8)];
  const r = unitSight(shooters, targets, [T("bunker", 0, 0)]);
  assert.equal(r.best, "visible");
  assert.deepEqual(r.visible, ["b2"]);
});
