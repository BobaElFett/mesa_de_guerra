import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, validateList } from "../src/rules/armies";
import { allowance } from "../src/rules/movement";
import { runMoraleTests } from "../src/rules/morale";
import { DATASHEETS } from "../src/rules/datasheets";
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

test("Turbo: los Motoristas avanzan siempre +6\" sin tirar", () => {
  const bus = game();
  const id = bus.state.units.find((u) => u.datasheet === "motoristas")!.id;
  const rng = bus.state.rng, rolls = bus.state.rolls.length;
  bus.dispatch({ type: "declareMove", unit: id, kind: "avanzar" });
  const s = bus.state;
  assert.equal(s.turnLog.moves[id].advance, 6);
  assert.equal(allowance(s, id, s.turnLog.moves[id]), 12 + 6);
  assert.equal(s.rng, rng);
  assert.equal(s.rolls.length, rolls);
});

test("Aterrador: −1 al Liderazgo de los enemigos a 6\" o menos", () => {
  const bus = game();
  const base = cloneState(bus.state);
  const asalto = base.units.find((u) => u.datasheet === "asalto")!;
  const carn = base.units.find((u) => u.datasheet === "carnifice")!;
  // Deja la escuadra por debajo de la mitad y pon el Carnífice al lado (o lejos)
  const ms = base.pieces.filter((p) => p.unit === asalto.id);
  const keep = new Set(ms.slice(0, 2).map((p) => p.id));
  const prep = (near: boolean) => {
    const s = cloneState(base);
    s.pieces = s.pieces.filter((p) => p.unit !== asalto.id || keep.has(p.id));
    const a = s.pieces.find((p) => keep.has(p.id))!;
    const c = s.pieces.find((p) => p.unit === carn.id)!;
    c.x = a.x + (near ? 4 : 20); c.z = a.z;
    return s;
  };
  const need = (s: ReturnType<typeof prep>) => runMoraleTests(s).find((m) => m.unit === asalto.id)!.need;
  assert.equal(need(prep(false)), DATASHEETS.asalto.profile.Ld);
  assert.equal(need(prep(true)), DATASHEETS.asalto.profile.Ld + 1);
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
