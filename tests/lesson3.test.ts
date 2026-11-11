import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { exampleMap } from "../src/core/state";
import { checkDeploy } from "../src/rules/deployment";
import { shootingOptions } from "../src/rules/shooting";
import { validateList } from "../src/rules/armies";
import { LESSON3_LEGION, LESSON3_SWARM } from "../src/ui/tutorial";

test("lección 3: listas válidas y los francotiradores infiltrados pueden apuntar a la Mente", () => {
  assert.deepEqual(validateList(LESSON3_LEGION, "legion"), []);
  assert.deepEqual(validateList(LESSON3_SWARM, "swarm"), []);
  const bus = new CommandBus(1);
  bus.dispatch({ type: "setTerrain", pieces: exampleMap() });
  bus.dispatch({ type: "setArmies", legion: LESSON3_LEGION, swarm: LESSON3_SWARM, mission: "tomar", secondaries: true });
  bus.dispatch({ type: "setRulesMode", on: true });
  const s = bus.state;
  const sn = s.units.find((u) => u.datasheet === "francotiradores")!;
  const mind = s.units.find((u) => u.datasheet === "mente")!;
  // Adelanta a los francotiradores a z = 9 (lo que permite la infiltración)
  const ps = s.pieces.filter((p) => p.unit === sn.id);
  const r = checkDeploy(s, ps.map((p, i) => ({ id: p.id, x: -14 + (i - 2) * 1.4, z: 10 })));
  bus.dispatch({ type: "moveMany", moves: r.moves });
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const rifle = shootingOptions(bus.state, sn.id).weapons.find((w) => w.weapon.id === "rifleFrancotirador")!;
  const t = rifle.targets.find((x) => x.unit === mind.id);
  assert.ok(t, "la Mente es un objetivo posible");
  assert.equal(t!.blocked, undefined, `bloqueado: ${t!.blocked}`);
});
