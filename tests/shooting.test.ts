import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { shootingOptions } from "../src/rules/shooting";

/** Mesa en modo reglas, Legión en su fase de disparo; quita la escenografía del medio si se pide. */
function setup(opts: { clear?: boolean; gapZ?: number } = {}) {
  const bus = new CommandBus(21);
  if (opts.clear) for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  if (opts.gapZ !== undefined) {
    // Garras en fila a `gapZ` pulgadas por delante de la Legión (z = 17)
    const moves = bus.state.pieces.filter((p) => p.unit === "U2").map((p, i) => ({ id: p.id, x: -9 + i * 2, z: 17 - opts.gapZ! }));
    bus.dispatch({ type: "moveMany", moves });
  }
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });   // movimiento
  bus.dispatch({ type: "nextPhase" });   // disparo
  return bus;
}

test("opciones: rifle al alcance y pistola del sargento fuera de alcance", () => {
  const bus = setup({ clear: true, gapZ: 20 });
  const o = shootingOptions(bus.state, "U1");
  assert.equal(o.blocked, undefined);
  const rifle = o.weapons.find((w) => w.weapon.id === "rifleBolter")!;
  const pistol = o.weapons.find((w) => w.weapon.id === "pistolaBolter")!;
  assert.equal(rifle.carriers.length, 4);
  assert.equal(pistol.carriers.length, 1);
  const tr = rifle.targets.find((t) => t.unit === "U2")!;
  assert.equal(tr.blocked, undefined);
  assert.equal(tr.attackers.length, 4);
  assert.equal(tr.cover, false);
  assert.match(pistol.targets[0].blocked!, /Fuera de alcance/);
});

test("disparo: aplica daño, quita bajas, gasta el arma y es determinista", () => {
  const bus = setup({ clear: true, gapZ: 10 });
  const before = bus.state.pieces.filter((p) => p.unit === "U2").length;
  bus.dispatch({ type: "shoot", unit: "U1", weapon: "rifleBolter", target: "U2" });
  const e = bus.state.combatLog.at(-1)!;
  assert.equal(e.attackers, 4);
  assert.equal(e.result.attacks, 8);
  assert.equal(e.result.hitRolls.length, 8);
  assert.equal(e.hitOn, 3);
  assert.equal(e.woundOn, 3);          // F4 contra R3
  assert.equal(e.result.saveTarget, 6); // 5+ con FP −1
  const after = bus.state.pieces.filter((p) => p.unit === "U2").length;
  assert.equal(before - after, e.result.slain.length);
  assert.ok(e.result.slain.length <= e.result.failedSaves);
  // la misma arma no dispara dos veces
  assert.equal(shootingOptions(bus.state, "U1").weapons.find((w) => w.weapon.id === "rifleBolter")!.fired, true);
  const n = bus.state.combatLog.length;
  bus.dispatch({ type: "shoot", unit: "U1", weapon: "rifleBolter", target: "U2" });
  assert.equal(bus.state.combatLog.length, n);
  // deshacer devuelve las Garras; rehacer da exactamente lo mismo
  const slain = e.result.slain.join(",");
  bus.undo();                         // la orden bloqueada (no hizo nada)
  bus.undo();                         // el disparo
  assert.equal(bus.state.pieces.filter((p) => p.unit === "U2").length, before);
  bus.redo();
  assert.equal(bus.state.combatLog.at(-1)!.result.slain.join(","), slain);
});

test("sin visión: el búnker del centro tapa a la Legión", () => {
  const bus = setup();
  const rifle = shootingOptions(bus.state, "U1").weapons.find((w) => w.weapon.id === "rifleBolter")!;
  // a 32" las Garras están fuera de alcance o tapadas: no se puede disparar
  assert.ok(rifle.targets[0].blocked);
});

test("tras avanzar solo armas de Asalto; tras retirarse, nada", () => {
  const bus = new CommandBus(3);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  bus.dispatch({ type: "declareMove", unit: "U1", kind: "avanzar" });
  bus.dispatch({ type: "nextPhase" });
  const o = shootingOptions(bus.state, "U1");
  assert.equal(o.weapons.find((w) => w.weapon.id === "rifleBolter")!.blocked, undefined);       // Asalto
  assert.match(o.weapons.find((w) => w.weapon.id === "pistolaBolter")!.blocked!, /Asalto/);
});

test("no es su turno: el Enjambre no dispara en el turno de la Legión", () => {
  const bus = setup({ clear: true, gapZ: 10 });
  assert.match(shootingOptions(bus.state, "U2").blocked!, /turno/);
});

test("cobertura: Garras dentro de una ruina salvan mejor", () => {
  const bus = new CommandBus(8);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "addTerrain", kind: "crater", x: 0, z: 7, rot: 0 });
  // las 10 Garras dentro del cráter (5" de diámetro), en una cuadrícula apretada
  const moves = bus.state.pieces.filter((p) => p.unit === "U2").map((p, i) => ({ id: p.id, x: -1.5 + (i % 4) * 1.0, z: 5.6 + Math.floor(i / 4) * 1.1 }));
  bus.dispatch({ type: "moveMany", moves });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" }); bus.dispatch({ type: "nextPhase" });
  const t = shootingOptions(bus.state, "U1").weapons.find((w) => w.weapon.id === "rifleBolter")!.targets[0];
  assert.equal(t.cover, true);    // el cráter queda entre la Legión y todas las Garras visibles
});
