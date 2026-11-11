import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, TEST_LEGION, validateList } from "../src/rules/armies";
import { isGuarded, partnerOf } from "../src/rules/leaders";
import { recordCasualties } from "../src/rules/missions";
import { shootingOptions } from "../src/rules/shooting";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const SWA: ArmyList = { units: [{ datasheet: "mente", models: 1, leads: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "nodo", models: 3 }, { datasheet: "escupidores", models: 10 }, { datasheet: "garras", models: 10 }] };
const LEG: ArmyList = { units: [...TEST_LEGION.units.slice(0, 2), { datasheet: "francotiradores", models: 5 }, TEST_LEGION.units[3]] };

test("la Mente del Enjambre lidera Garras y la escuadra la protege, salvo de la Precisión", () => {
  assert.deepEqual(validateList(SWA, "swarm"), []);
  const bus = new CommandBus(3);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "serpiente" });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  const s = bus.state;
  const mind = s.units.find((u) => u.datasheet === "mente")!;
  assert.ok(partnerOf(s, mind.id));
  assert.ok(isGuarded(s, mind.id));
  // Acerca la formación a los francotiradores (a 30") para que tengan alcance
  const sn = s.units.find((u) => u.datasheet === "francotiradores")!;
  const snP = s.pieces.filter((p) => p.unit === sn.id);
  const form = s.pieces.filter((p) => p.unit === mind.id || p.unit === mind.attachedTo);
  bus.dispatch({ type: "moveMany", moves: form.map((p, i) => ({ id: p.id, x: snP[0].x + (i % 7) * 1.2 - 4, z: snP[0].z - 26 - Math.floor(i / 7) * 1.2 })) });
  const opts = shootingOptions(bus.state, sn.id);
  const rifle = opts.weapons.find((w) => w.weapon.id === "rifleFrancotirador")!;
  assert.equal(rifle.targets.find((t) => t.unit === mind.id)!.blocked, undefined);
  const knife = opts.weapons.find((w) => w.weapon.id !== "rifleFrancotirador");
  void knife;
  const asal = s.units.find((u) => u.datasheet === "asalto")!;
  const rb = shootingOptions(bus.state, asal.id).weapons.find((w) => w.weapon.id === "rifleBolter");
  if (rb) assert.ok(rb.targets.find((t) => t.unit === mind.id)!.blocked);
});

test("Cabeza de la serpiente: 4 PV por personaje destruido", () => {
  const bus = new CommandBus(3);
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "serpiente" });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  const s = structuredClone(bus.state);
  const mind = s.units.find((u) => u.datasheet === "mente")!;
  s.pieces = s.pieces.filter((p) => p.unit !== mind.id);
  recordCasualties(s, 0, mind.id, 1);
  assert.equal(s.vp![0], 4);
  // Una unidad normal no da nada
  const g = s.units.find((u) => u.datasheet === "escupidores")!;
  s.pieces = s.pieces.filter((p) => p.unit !== g.id);
  recordCasualties(s, 0, g.id, 10);
  assert.equal(s.vp![0], 4);
});

test("partidas enteras de Cabeza de la serpiente con la Mente al mando", () => {
  for (const seed of [1, 2, 3]) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "serpiente", secondaries: true });
    bus.dispatch({ type: "setRulesMode", on: true });
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `serpiente ${seed}`);
    }
    assert.ok(bus.state.gameOver);
  }
});
