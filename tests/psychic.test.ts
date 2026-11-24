import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, validateList } from "../src/rules/armies";
import { psychicBlocked } from "../src/rules/psychic";
import { attackInput, shootingOptions } from "../src/rules/shooting";
import { WEAPONS } from "../src/rules/datasheets";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "psiquico", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "fuegoPesado", models: 5 }] };
const SWA: ArmyList = { units: [{ datasheet: "mente", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "escupidores", models: 10 }] };

function setup(seed: number) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "caza" });
  bus.dispatch({ type: "setTerrain", pieces: [] });
  const s = bus.state;
  // Todos cerca: la Legión en z=-6, el Enjambre en z=+6 (a unos 10")
  bus.dispatch({ type: "moveMany", moves: s.pieces.map((p, i) => ({ id: p.id, x: -16 + (i % 16) * 2, z: (p.faction === "legion" ? -6 : 6) + Math.floor(i / 16) * (p.faction === "legion" ? -2 : 2) })) });
  bus.dispatch({ type: "setRulesMode", on: true });
  for (let i = 0; i < 3; i++) bus.dispatch({ type: "nextPhase" });
  return bus;
}

test("listas con psíquicos son válidas", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
});

test("11.ª: el Psíquico dispara Golpe mental (arma psíquica) y ya no usa el poder de 2D6", () => {
  const bus = setup(3);
  const s = bus.state;
  const psy = s.units.find((u) => u.datasheet === "psiquico")!.id;
  assert.match(psychicBlocked(s, psy) ?? "", /.+/);   // nadie tiene ya el poder antiguo
  const w = shootingOptions(s, psy).weapons.find((x) => x.weapon.id === "golpeMental")!;
  assert.ok(w, "lleva Golpe mental");
  assert.ok(w.weapon.abilities.some((a) => a.kind === "psiquica"));
  assert.equal(w.weapon.range, 24);
});

test("Cúpula de fuerza: al empezar su movimiento, 4+ invulnerable hasta su siguiente turno (con un 1, desmoralizada)", () => {
  let domes = 0, shocks = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
    bus.dispatch({ type: "setRulesMode", on: true });
    bus.dispatch({ type: "nextPhase" });   // mando
    bus.dispatch({ type: "nextPhase" });   // movimiento: tira la cúpula
    const s = bus.state;
    const psy = s.units.find((u) => u.datasheet === "psiquico")!;
    const squad = s.units.find((u) => u.id === psy.attachedTo)!;
    if (psy.shocked) { shocks++; assert.equal(squad.shocked, true); continue; }
    domes++;
    assert.equal(squad.domeUntil, psy.domeUntil);
    const g = s.units.find((u) => u.datasheet === "escupidores")!.id;
    const inp = attackInput(s, "disparo", g, s.pieces.filter((p) => p.unit === g), WEAPONS.escupidor, squad.id);
    assert.equal(inp.target.profile.Inv, 4);
  }
  assert.ok(domes > 25 && shocks > 2, `cúpulas ${domes}, fallos ${shocks}`);
});

test("IA con psíquicos: nada se rompe", () => {
  for (const seed of [3, 4]) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
    bus.dispatch({ type: "setRulesMode", on: true });
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `psíquicos ${seed}`);
    }
    assert.ok(bus.state.gameOver);
  }
});
