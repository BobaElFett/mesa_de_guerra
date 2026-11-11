import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, TEST_SWARM, testLists, validateList } from "../src/rules/armies";
import { checkDeploy, pieceBand, INFILTRATE_LINE } from "../src/rules/deployment";
import { checkMove, flies } from "../src/rules/movement";
import { shootingOptions } from "../src/rules/shooting";
import { aiPlayPhase } from "../src/ai/tactics";
import { aiDeploy } from "../src/ai/deploy";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 5 }, { datasheet: "francotiradores", models: 5 }, { datasheet: "fuegoPesado", models: 5 }] };
const SWA: ArmyList = { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "gargolas", models: 10 }, { datasheet: "escupidores", models: 10 }] };

function game(seed = 4, clear = true) {
  const bus = new CommandBus(seed);
  if (clear) for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}

test("las listas con las tropas nuevas son válidas", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
});

test("los francotiradores se infiltran en su mitad, a más de 6\" del centro; los demás no", () => {
  const bus = game();
  const s = bus.state;
  const sn = s.pieces.find((p) => s.units.find((u) => u.id === p.unit)?.datasheet === "francotiradores")!;
  const other = s.pieces.find((p) => s.units.find((u) => u.id === p.unit)?.datasheet === "asalto")!;
  assert.ok(pieceBand(s, sn)[0] < pieceBand(s, other)[0]);
  const r = checkDeploy(s, [{ id: sn.id, x: 0, z: INFILTRATE_LINE + 2 }, { id: other.id, x: 4, z: INFILTRATE_LINE + 2 }]);
  assert.ok(Math.abs(r.moves.find((m) => m.id === sn.id)!.z - (INFILTRATE_LINE + 2)) < 0.01);
  assert.ok(r.moves.find((m) => m.id === other.id)!.z > INFILTRATE_LINE + 5);
  // Nunca más allá de la línea
  const r2 = checkDeploy(s, [{ id: sn.id, x: 0, z: 1 }]);
  assert.ok(r2.moves[0].z >= INFILTRATE_LINE);
});

test("la IA adelanta a sus francotiradores", () => {
  const bus = game(4, false);
  const moves = aiDeploy(bus.state, "legion");
  const ids = new Set(bus.state.pieces.filter((p) => bus.state.units.find((u) => u.id === p.unit)?.datasheet === "francotiradores").map((p) => p.id));
  const zs = moves.filter((m) => ids.has(m.id)).map((m) => m.z);
  assert.ok(zs.length && Math.min(...zs) < 22 - 10);
});

test("las gárgolas vuelan por encima de un contenedor; las garras no", () => {
  const bus = game();
  bus.dispatch({ type: "nextPhase" });   // mando de la Legión
  // Turno del Enjambre
  for (let i = 0; i < 5; i++) bus.dispatch({ type: "nextPhase" });
  bus.dispatch({ type: "nextPhase" });   // movimiento del Enjambre
  const s = bus.state;
  assert.equal(s.phase, "movimiento");
  const garg = s.units.find((u) => u.datasheet === "gargolas")!, claw = s.units.find((u) => u.datasheet === "garras")!;
  assert.ok(flies(s, garg.id) && !flies(s, claw.id));
  const g = s.pieces.find((p) => p.unit === garg.id)!, c = s.pieces.find((p) => p.unit === claw.id)!;
  // Contenedor justo delante de cada una
  bus.dispatch({ type: "addTerrain", kind: "cajas", x: g.x, z: g.z + 3, rot: 0 } as never);
  bus.dispatch({ type: "addTerrain", kind: "cajas", x: c.x, z: c.z + 3, rot: 0 } as never);
  const t = bus.state;
  assert.equal(t.terrain.length, 2);
  const okG = checkMove(t, garg.id, [{ id: g.id, x: g.x, z: g.z + 7 }], { kind: "normal" });
  const okC = checkMove(t, claw.id, [{ id: c.id, x: c.x, z: c.z + 7 }], { kind: "normal" });
  assert.deepEqual(okG.rejected, []);
  assert.deepEqual(okC.rejected, [c.id]);
});

test("el rifle de precisión ignora la cobertura", () => {
  const bus = game();
  bus.dispatch({ type: "nextPhase" });
  const s = bus.state;
  const sn = s.units.find((u) => u.datasheet === "francotiradores")!;
  const opts = shootingOptions(s, sn.id);
  for (const w of opts.weapons) for (const t of w.targets) if (w.weapon.id === "rifleFrancotirador") assert.equal(t.cover, false);
});

test("partidas enteras con las tropas nuevas", () => {
  for (const seed of [1, 2, 3, 4]) {
    const bus = game(seed, false);
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `nuevas ${seed}`);
    }
    assert.ok(bus.state.gameOver);
  }
  void testLists; void TEST_SWARM;
});
