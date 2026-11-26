import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { cloneState } from "../src/core/state";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { applyStratagem, heroicTargets, stratBlocked } from "../src/rules/stratagems";
import { reactionOptions } from "../src/rules/reactions";

// Estratagemas básicas de la 11.ª (fase 32)

function base(seed = 32) {
  const bus = new CommandBus(seed);
  for (const t of bus.state.terrain.map((x) => x.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });                 // mando de la Legión
  return bus;
}
const idOf = (bus: CommandBus, ds: string, n = 0) => bus.state.units.filter((u) => u.datasheet === ds)[n].id;

test("cada estratagema una vez por fase por jugador; una unidad, una estratagema por fase", () => {
  const bus = base();
  bus.dispatch({ type: "nextPhase" }); bus.dispatch({ type: "nextPhase" });   // disparo
  if (bus.state.reaction) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const fp = idOf(bus, "fuegoPesado"), a5 = bus.state.units.find((u) => u.datasheet === "asalto" && u.startingModels === 5)!.id;
  assert.equal(stratBlocked(s, "fuegoSostenido", fp), null);
  assert.ok(applyStratagem(s, "fuegoSostenido", fp));
  assert.match(stratBlocked(s, "fuegoSostenido", a5) ?? "", /Ya usada esta fase/);
  // Otra estratagema para la misma unidad, tampoco
  s.cp = [5, 5];
  assert.match(stratBlocked(s, "avanceTactico", fp) ?? "", /Solo en la fase|ya ha recibido/);
});

test("Valor demente: solo desmoralizada, una vez por partida", () => {
  const bus = base();
  const s = cloneState(bus.state);
  const fp = idOf(bus, "fuegoPesado"), a5 = s.units.find((u) => u.datasheet === "asalto" && u.startingModels === 5)!.id;
  assert.match(stratBlocked(s, "valor", fp) ?? "", /No está desmoralizada/);
  s.units.find((u) => u.id === fp)!.shocked = true;
  s.units.find((u) => u.id === a5)!.shocked = true;
  s.cp = [5, 5];
  assert.ok(applyStratagem(s, "valor", fp));
  assert.equal(s.units.find((u) => u.id === fp)!.shocked, false);
  s.turnLog.strats = [];                                // aunque fuese otra fase…
  assert.match(stratBlocked(s, "valor", a5) ?? "", /Ya usada en esta partida/);
});

test("una unidad desmoralizada no recibe estratagemas (salvo Valor demente)", () => {
  const bus = base();
  const s = cloneState(bus.state);
  const fp = idOf(bus, "fuegoPesado");
  s.units.find((u) => u.id === fp)!.shocked = true;
  s.phase = "disparo";
  assert.match(stratBlocked(s, "fuegoSostenido", fp) ?? "", /Desmoralizada/);
});

test("Desafío épico: hace falta un personaje en la unidad", () => {
  const bus = base();
  const s = cloneState(bus.state);
  s.phase = "combate";
  const cap = idOf(bus, "capitan");
  const led = s.units.find((u) => u.id === cap)!.attachedTo!;
  const fp = idOf(bus, "fuegoPesado");
  assert.match(stratBlocked(s, "desafio", fp) ?? "", /personaje/);
  assert.equal(stratBlocked(s, "desafio", led), null);
});

test("Impacto aplastante: solo monstruos y vehículos que han cargado", () => {
  const bus = base();
  const s = cloneState(bus.state);
  s.phase = "carga";
  assert.match(stratBlocked(s, "impacto", idOf(bus, "fuegoPesado")) ?? "", /monstruos y vehículos/);
});

test("Cortina de humo: sin unidades con humo no se abre la ventana del rival", () => {
  const bus = base();
  // La Legión de prueba no lleva tanque ni francotiradores: el Enjambre no tiene humo en su turno, y la Legión tampoco
  assert.equal(reactionOptions(bus.state, "inicioDisparo", 1).length, 0);
  assert.equal(reactionOptions(bus.state, "inicioDisparo", 0).length, 0);
});

test("Intervención heroica: contra una unidad que ha cargado, a 12\" o menos, en la ventana del rival", () => {
  const bus = base();
  const s = cloneState(bus.state);
  const fp = idOf(bus, "fuegoPesado"), g = s.units.find((u) => u.datasheet === "garras" && u.startingModels === 10)!.id;
  const f = s.pieces.filter((p) => p.unit === fp);
  // El Enjambre ha cargado con las garras a 8" de la Escuadra de fuego pesado
  s.pieces.filter((p) => p.unit === g).forEach((p, i) => { p.x = f[0].x + (i % 5) * 1.2; p.z = f[0].z - 8 - Math.floor(i / 5) * 1.2; });
  s.active = 1; s.phase = "carga";
  s.turnLog.charges = { [g]: { target: idOf(bus, "asalto"), roll: 9, need: 7, success: true } };
  assert.deepEqual(heroicTargets(s, fp), [g]);
  assert.match(stratBlocked(s, "intervencion", fp) ?? "", /Solo en su momento/);
  s.reaction = { kind: "finCarga", player: 0 };
  assert.equal(stratBlocked(s, "intervencion", fp), null);
  assert.ok(reactionOptions(s, "finCarga", 0).some((o) => o.id === "intervencion" && o.unit === fp && o.target === g));
});

test("Contraofensiva: 2 PM, justo después de que combata una unidad enemiga; elige el siguiente", () => {
  const bus = base();
  const s = cloneState(bus.state);
  const fp = idOf(bus, "fuegoPesado"), g = s.units.find((u) => u.datasheet === "garras" && u.startingModels === 10)!.id;
  const f = s.pieces.filter((p) => p.unit === fp);
  s.pieces.filter((p) => p.unit === g).forEach((p, i) => { p.x = f[0].x + (i % 5) * 1.2; p.z = f[0].z - 1.6 - Math.floor(i / 5) * 1.2; });
  s.active = 1; s.phase = "combate"; s.cp = [5, 0];
  assert.match(stratBlocked(s, "contraofensiva", fp) ?? "", /Justo después/);
  s.turnLog.fought = [g];
  s.cp = [1, 0];
  assert.match(stratBlocked(s, "contraofensiva", fp) ?? "", /PM/);
  s.cp = [2, 0];
  assert.ok(applyStratagem(s, "contraofensiva", fp));
  assert.equal(s.cp[0], 0);
  assert.equal(s.turnLog.fightPick, 0);
  assert.equal(s.turnLog.counter, fp);
});
