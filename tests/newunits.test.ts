import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, validateList } from "../src/rules/armies";
import { WEAPONS } from "../src/rules/datasheets";
import { attackInput } from "../src/rules/shooting";
import { deadlyDemise } from "../src/rules/eleventh";
import { cloneState } from "../src/core/state";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 5 }, { datasheet: "motoristas", models: 6 }] };
const SWA: ArmyList = { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "carnifice", models: 1 }, { datasheet: "garras", models: 10 }] };

function game(seed = 3) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  bus.dispatch({ type: "nextPhase" });   // movimiento de la Legión
  return bus;
}

test("listas con Motoristas y Carnífice son válidas", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
});

test("Asalto a todo gas: el turno que cargan, Sostenida 1 y +1 al daño en combate", () => {
  const bus = game();
  const s = cloneState(bus.state);
  const moto = s.units.find((u) => u.datasheet === "motoristas")!.id, g = s.units.find((u) => u.datasheet === "garras")!.id;
  const riders = s.pieces.filter((p) => p.unit === moto);
  const calm = attackInput(s, "combate", moto, riders, WEAPONS.espadaSierra, g);
  assert.equal(calm.damageMod, 0);
  assert.ok(!calm.weapon.abilities.some((a) => a.kind === "sostenida"));
  s.turnLog.charges = { [moto]: { target: g, roll: 9, need: 5, success: true } };
  const hot = attackInput(s, "combate", moto, riders, WEAPONS.espadaSierra, g);
  assert.equal(hot.damageMod, 1);
  assert.ok(hot.weapon.abilities.some((a) => a.kind === "sostenida"));
  const hammer = attackInput(s, "combate", moto, riders, WEAPONS.martilloTrueno, g);
  assert.equal(hammer.damageMod, 0);
  assert.equal(hammer.hitMod, 1);
});

test("Muerte explosiva: el Carnífice que cae, con un 6, hace 1 herida mortal a cada unidad a 6\"", () => {
  const bus = game();
  let blasts = 0;
  for (let k = 1; k <= 240; k++) {
    const s = cloneState(bus.state);
    s.rng = k * 7919;
    const carn = s.units.find((u) => u.datasheet === "carnifice")!.id, asalto = s.units.find((u) => u.datasheet === "asalto")!.id;
    const c = s.pieces.find((p) => p.unit === carn)!;
    const a = s.pieces.find((p) => p.unit === asalto)!;
    a.x = c.x + 4; a.z = c.z;
    s.pieces = s.pieces.filter((p) => p !== c);
    deadlyDemise(s, carn, c);
    const hurt = s.pieces.filter((p) => p.unit === asalto).reduce((n, p) => n + (p.damage ?? 0), 0);
    if (hurt) { blasts++; assert.equal(hurt, 1); }
  }
  assert.ok(blasts > 20 && blasts < 65, `explosiones: ${blasts} de 240`);
});

test("partidas IA con las unidades nuevas, sin romper nada", () => {
  for (const seed of [4, 5]) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
    bus.dispatch({ type: "setRulesMode", on: true });
    let guard = 0;
    while (!bus.state.gameOver && guard++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `nuevas semilla ${seed}`);
    }
    assert.ok(bus.state.gameOver);
  }
});
