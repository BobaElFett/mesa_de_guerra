import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, TEST_LEGION, TEST_SWARM, validateList } from "../src/rules/armies";
import { formation, formationModels, isGuarded, partnerOf, underCommand } from "../src/rules/leaders";
import { allowance } from "../src/rules/movement";
import { outOfCoherency } from "../src/rules/geometry";
import { shootingOptions } from "../src/rules/shooting";
import { chargeOptions } from "../src/rules/melee";

const ids = (bus: CommandBus) => {
  const s = bus.state;
  const cap = s.units.find((u) => u.datasheet === "capitan")!.id;
  return { cap, squad: s.units.find((u) => u.id === s.units.find((x) => x.id === cap)!.attachedTo)!.id };
};

function game(legion: ArmyList = TEST_LEGION) {
  const bus = new CommandBus(5);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });   // despliegue → mando
  return bus;
}

test("el Capitán se despliega unido a su escuadra y en coherencia con ella", () => {
  const bus = game();
  const { cap, squad } = ids(bus);
  assert.equal(bus.state.units.find((u) => u.id === squad)!.datasheet, "asalto");
  assert.equal(partnerOf(bus.state, cap), squad);
  assert.equal(partnerOf(bus.state, squad), cap);
  assert.deepEqual(formation(bus.state, cap), [squad, cap]);
  assert.equal(formationModels(bus.state, cap).length, 11);
  assert.deepEqual(outOfCoherency(formationModels(bus.state, squad)), []);
});

test("declarar el movimiento vale para los dos; mueven lo que la más lenta", () => {
  const list: ArmyList = { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "fuegoPesado", models: 5 }] };
  const bus = game(list);
  const { cap, squad } = ids(bus);
  bus.dispatch({ type: "nextPhase" });   // movimiento
  bus.dispatch({ type: "declareMove", unit: cap, kind: "avanzar" });
  const m = bus.state.turnLog.moves;
  assert.ok(m[cap] && m[squad]);
  assert.deepEqual(m[cap], m[squad]);
  assert.equal(allowance(bus.state, cap, undefined), 5);   // Fuego Pesado M5, Capitán M6
});

test("no se puede disparar al líder mientras quede alguien de su escuadra", () => {
  const bus = game();
  const { cap, squad } = ids(bus);
  for (let i = 0; i < 7; i++) bus.dispatch({ type: "nextPhase" });   // turno del Enjambre, disparo
  assert.equal(bus.state.phase, "disparo");
  const spitters = bus.state.units.find((u) => u.datasheet === "escupidores")!.id;
  const t = shootingOptions(bus.state, spitters).weapons[0].targets.find((x) => x.unit === cap)!;
  assert.match(t.blocked!, /Protegido/);
  assert.equal(isGuarded(bus.state, cap), true);
  bus.dispatch({ type: "removePieces", ids: bus.state.pieces.filter((p) => p.unit === squad).map((p) => p.id) });
  assert.equal(isGuarded(bus.state, cap), false);
  assert.deepEqual(formation(bus.state, cap), [cap]);
  const t2 = shootingOptions(bus.state, spitters).weapons[0].targets.find((x) => x.unit === cap)!;
  assert.doesNotMatch(t2.blocked ?? "", /Protegido/);
});

test("Al mando: la escuadra y el líder repiten los 1 solo mientras van juntos", () => {
  const bus = game();
  const { cap, squad } = ids(bus);
  const other = bus.state.units.find((u) => u.datasheet === "asalto" && u.id !== squad)!.id;
  assert.equal(underCommand(bus.state, squad), true);
  assert.equal(underCommand(bus.state, cap), true);
  assert.equal(underCommand(bus.state, other), false);
  bus.dispatch({ type: "removePieces", ids: bus.state.pieces.filter((p) => p.unit === squad).map((p) => p.id) });
  assert.equal(underCommand(bus.state, cap), false);
});

test("cargan juntos: una tirada y registro para los dos", () => {
  const bus = game();
  const { cap, squad } = ids(bus);
  // Formación a unos 6" de las Garras
  const garras = bus.state.units.find((u) => u.datasheet === "garras")!.id;
  const gz = Math.max(...bus.state.pieces.filter((p) => p.unit === garras).map((p) => p.z));
  const gx = bus.state.pieces.find((p) => p.unit === garras)!.x;
  bus.dispatch({ type: "moveMany", moves: formationModels(bus.state, squad).map((p, i) => ({ id: p.id, x: gx - 6 + (i % 6) * 1.6, z: gz + 6 + Math.floor(i / 6) * 1.6 })) });
  bus.dispatch({ type: "nextPhase" });   // movimiento
  bus.dispatch({ type: "nextPhase" });   // disparo
  bus.dispatch({ type: "nextPhase" });   // carga
  const o = chargeOptions(bus.state, cap);
  assert.equal(o.blocked, undefined);
  bus.dispatch({ type: "charge", unit: squad, target: garras });
  const c = bus.state.turnLog.charges!;
  assert.ok(c[squad] && c[cap]);
  assert.deepEqual(c[squad], c[cap]);
  assert.ok(chargeOptions(bus.state, cap).done);
});

test("validación: solo escuadras que puede liderar y un líder por escuadra", () => {
  const ok: ArmyList = { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 5 }] };
  assert.deepEqual(validateList(ok, "legion"), []);
  const bad: ArmyList = { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "andador", models: 1 }] };
  assert.ok(validateList(bad, "legion").some((e) => /no puede liderar/.test(e)));
  const two: ArmyList = { units: [{ datasheet: "capitan", models: 1, leads: 2 }, { datasheet: "capitan", models: 1, leads: 2 }, { datasheet: "asalto", models: 5 }] };
  assert.ok(validateList(two, "legion").some((e) => /dos líderes/.test(e)));
});
