import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { chargeOptions, fightOptions, pendingChargers, CHARGE_RANGE } from "../src/rules/melee";
import { engaged } from "../src/rules/geometry";

/** Mesa sin escenografía, Garras a `gapZ` pulgadas de la Legión, en modo reglas hasta la fase indicada. */
function setup(seed: number, gapZ: number, phases: number) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "removeTerrain", ids: bus.state.terrain.map((t) => t.id) });
  const moves = bus.state.pieces.filter((p) => p.unit === "U2").map((p, i) => ({ id: p.id, x: -4 + (i % 5) * 2, z: 17 - gapZ - Math.floor(i / 5) * 1.8 }));
  bus.dispatch({ type: "moveMany", moves });
  bus.dispatch({ type: "setRulesMode", on: true });
  for (let i = 0; i < phases; i++) bus.dispatch({ type: "nextPhase" });
  return bus;
}
const U = (bus: CommandBus, u: string) => bus.state.pieces.filter((p) => p.unit === u);

test("opciones de carga: a 12\" o menos, con la tirada necesaria", () => {
  const bus = setup(1, 8, 3);                          // fase de carga
  assert.equal(bus.state.phase, "carga");
  const o = chargeOptions(bus.state, "U1");
  assert.equal(o.blocked, undefined);
  const t = o.targets[0];
  assert.ok(t.distance > 6.5 && t.distance < 7.5, String(t.distance));
  assert.equal(t.blocked, undefined);
  assert.equal(t.need, Math.ceil(t.distance - 1 - 1e-6));
  const far = setup(1, 20, 3);
  assert.match(chargeOptions(far.state, "U1").targets[0].blocked!, new RegExp(`${CHARGE_RANGE}`));
});

test("carga con éxito: entra en contacto; fallida: no se mueve", () => {
  let ok = 0, fail = 0;
  for (let seed = 1; seed <= 40 && (!ok || !fail); seed++) {
    const bus = setup(seed, 8, 3);
    const before = JSON.stringify(U(bus, "U1").map((p) => [p.x, p.z]));
    bus.dispatch({ type: "charge", unit: "U1", target: "U2" });
    const rec = bus.state.turnLog.charges!.U1;
    assert.ok(rec.roll >= 2 && rec.roll <= 12);
    if (rec.success) {
      ok++;
      assert.ok(engaged(U(bus, "U1"), U(bus, "U2")), `seed ${seed}: tras cargar debe quedar trabada`);
    } else {
      fail++;
      assert.equal(JSON.stringify(U(bus, "U1").map((p) => [p.x, p.z])), before);
    }
    // una sola carga por turno
    const n = bus.length;
    assert.ok(chargeOptions(bus.state, "U1").done);
    bus.dispatch({ type: "charge", unit: "U1", target: "U2" });
    assert.equal(bus.state.turnLog.charges!.U1.roll, rec.roll);
    assert.equal(bus.length, n + 1);
  }
  assert.ok(ok > 0 && fail > 0, `éxitos ${ok}, fallos ${fail}`);
});

test("combate: primero quien cargó; golpean, consolidan y no repiten", () => {
  // Busca una semilla en la que la carga entre
  let bus: CommandBus | null = null;
  for (let seed = 1; seed < 60; seed++) {
    const b = setup(seed, 5, 3);
    b.dispatch({ type: "charge", unit: "U1", target: "U2" });
    if (b.state.turnLog.charges!.U1.success) { bus = b; break; }
  }
  assert.ok(bus, "alguna carga debe salir");
  bus!.dispatch({ type: "nextPhase" });                // combate
  assert.equal(bus!.state.phase, "combate");
  assert.deepEqual(pendingChargers(bus!.state), ["U1"]);
  assert.match(fightOptions(bus!.state, "U2").blocked!, /cargado/);
  const before = U(bus!, "U2").length;
  bus!.dispatch({ type: "fight", unit: "U1", target: "U2" });
  const log = bus!.state.combatLog.filter((e) => e.kind === "combate");
  assert.ok(log.length >= 1);
  assert.ok(log.every((e) => e.attacker === "U1" && e.target === "U2"));
  const weapons = new Set(log.map((e) => e.weapon));
  assert.ok(weapons.has("cuchillo"));
  const slain = log.reduce((n, e) => n + e.result.slain.length, 0);
  assert.equal(before - U(bus!, "U2").length, slain);
  assert.equal(fightOptions(bus!.state, "U1").fought, true);
  assert.match(fightOptions(bus!.state, "U1").blocked!, /Ya ha combatido/);
  // ahora puede devolver el golpe el Enjambre, si le quedan Garras trabadas
  if (U(bus!, "U2").length) assert.equal(fightOptions(bus!.state, "U2").blocked, undefined);
});

test("tras avanzar no se carga (salvo Rapidez)", () => {
  const bus = setup(4, 8, 1);                          // movimiento
  bus.dispatch({ type: "declareMove", unit: "U1", kind: "avanzar" });
  bus.dispatch({ type: "nextPhase" }); bus.dispatch({ type: "nextPhase" });
  assert.match(chargeOptions(bus.state, "U1").blocked!, /avanzado/);
});

test("deshacer una carga devuelve las miniaturas y la tirada", () => {
  const bus = setup(9, 6, 3);
  const before = JSON.stringify(bus.state.pieces.map((p) => [p.id, p.x, p.z]));
  bus.dispatch({ type: "charge", unit: "U1", target: "U2" });
  bus.undo();
  assert.equal(JSON.stringify(bus.state.pieces.map((p) => [p.id, p.x, p.z])), before);
  assert.equal(bus.state.turnLog.charges?.U1, undefined);
});
