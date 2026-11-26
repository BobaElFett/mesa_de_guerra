import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { reactionOptions } from "../src/rules/reactions";
import { crossesSolid, onForbiddenTerrain } from "../src/rules/geometry";
import { checkMove } from "../src/rules/movement";

/** Asalto (5) de la Legión a ~6" de los Escupidores, en la fase de carga de la Legión. */
function chargeSetup(cpSwarm = 1) {
  const bus = new CommandBus(21);
  for (const t of bus.state.terrain.map((x) => x.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });                         // mando
  const s = bus.state;
  const asl = s.units.find((u) => u.datasheet === "asalto" && !s.units.some((x) => x.attachedTo === u.id))!.id;
  const esc = s.units.find((u) => u.datasheet === "escupidores")!.id;
  const ez = Math.max(...s.pieces.filter((p) => p.unit === esc).map((p) => p.z));
  const ex = s.pieces.find((p) => p.unit === esc)!.x;
  bus.dispatch({ type: "moveMany", moves: s.pieces.filter((p) => p.unit === asl).map((p, i) => ({ id: p.id, x: ex + i * 1.4, z: ez + 6 })) });
  if (cpSwarm === 0) bus.dispatch({ type: "spendCP", player: 1, amount: 1 });
  for (let i = 0; i < 3; i++) bus.dispatch({ type: "nextPhase" });   // movimiento, disparo, carga
  return { bus, asl, esc };
}

test("11.ª: al acabar el movimiento del rival se abre la ventana de Fuego defensivo; la partida espera", () => {
  const bus = new CommandBus(21);
  for (const t of bus.state.terrain.map((x) => x.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });                         // mando
  bus.dispatch({ type: "nextPhase" });                         // movimiento
  const s = bus.state;
  const asl = s.units.find((u) => u.datasheet === "asalto" && !s.units.some((x) => x.attachedTo === u.id))!.id;
  const esc = s.units.find((u) => u.datasheet === "escupidores")!.id;
  const ez = Math.max(...s.pieces.filter((p) => p.unit === esc).map((p) => p.z));
  const ex = s.pieces.find((p) => p.unit === esc)!.x;
  bus.dispatch({ type: "moveMany", moves: s.pieces.filter((p) => p.unit === asl).map((p, i) => ({ id: p.id, x: ex + i * 1.4, z: ez + 10 })) });
  bus.dispatch({ type: "nextPhase" });                         // fin del movimiento: ventana
  assert.equal(bus.state.phase, "movimiento");
  assert.deepEqual(bus.state.reaction, { kind: "finMovimiento", player: 1 });
  const opts = reactionOptions(bus.state, "finMovimiento", 1);
  assert.ok(opts.some((o) => o.unit === esc && o.target === asl));
  bus.dispatch({ type: "shoot", unit: asl, weapon: "rifleBolter", target: esc });   // mientras, no se puede hacer otra cosa
  assert.equal(bus.state.phase, "movimiento");
  const cp = bus.state.cp[1], n = bus.state.combatLog.length;
  bus.dispatch({ type: "react", id: "fuegoDefensivo", unit: esc, target: asl });
  assert.equal(bus.state.reaction, null);
  assert.equal(bus.state.cp[1], cp - 1);
  assert.equal(bus.state.phase, "disparo");                    // sigue el paso de fase
  const shots = bus.state.combatLog.slice(n);
  assert.ok(shots.length >= 1 && shots.every((e) => e.overwatch && e.target === asl));
  assert.ok(shots.every((e) => e.result.hits === e.result.hitRolls.filter((r) => r === 6).length || e.hitOn === null));
  // «Siguiente fase» con la ventana abierta = no reaccionar
  bus.dispatch({ type: "nextPhase" }); bus.dispatch({ type: "nextPhase" });   // carga → fin de la carga (sin intervención posible) → combate
});

test("sin PM o sin nada que hacer, no hay ventana", () => {
  const bus = new CommandBus(21);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  bus.dispatch({ type: "spendCP", player: 1, amount: bus.state.cp[1] });
  bus.dispatch({ type: "nextPhase" });
  bus.dispatch({ type: "nextPhase" });
  assert.equal(bus.state.reaction ?? null, null);
  assert.equal(bus.state.phase, "disparo");
});

test("escenografía: no se acaba en un búnker ni se atraviesa", () => {
  const bus = new CommandBus(3);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  bus.dispatch({ type: "nextPhase" });                         // movimiento
  const s = bus.state;
  const bunker = s.terrain.find((t) => t.kind === "bunker")!;
  assert.ok(onForbiddenTerrain(s.terrain, bunker.x, bunker.z, 0.6));
  assert.ok(crossesSolid(s.terrain, bunker.x, bunker.z + 5, bunker.x, bunker.z - 5, 0.6));
  assert.equal(crossesSolid(s.terrain, bunker.x + 8, bunker.z + 5, bunker.x + 8, bunker.z - 5, 0.6), null);
  // Una miniatura justo delante del búnker que intenta cruzarlo
  const p = s.pieces.find((x) => x.model === "legionario")!;
  bus.dispatch({ type: "moveMany", moves: [{ id: p.id, x: bunker.x, z: bunker.z + 3.5 }] });
  const s2 = bus.state;
  bus.dispatch({ type: "declareMove", unit: p.unit!, kind: "normal" });
  const r = checkMove(bus.state, p.unit!, [{ id: p.id, x: bunker.x, z: bunker.z - 3.5 }], bus.state.turnLog.moves[p.unit!]);
  assert.ok(r.rejected.includes(p.id));
  assert.match(r.message!, /No se puede atravesar/);
  void s2;
});

test("hitboxes: en una ruina se entra por los huecos, pero los muros no se pisan ni se cruzan", () => {
  const ruin = { id: "T1", kind: "ruina" as const, x: 0, z: 0, rot: 0 };
  const t = [ruin];
  // Dentro de la ruina, lejos de los muros: vale
  assert.equal(onForbiddenTerrain(t, 0.5, 0.5, 0.63), null);
  // Encima del muro largo (z = −1,8): no
  assert.ok(onForbiddenTerrain(t, 0, -1.8, 0.63));
  // Entrar por el lado abierto (x = +3, sin muro): vale; cruzar el muro largo desde fuera: no
  assert.equal(crossesSolid(t, 5, 0.5, 0.5, 0.5, 0.63), null);
  assert.ok(crossesSolid(t, 0.5, -4, 0.5, 0.5, 0.63));
  // Girada 90°: el muro largo pasa a estar en x = −1,8
  const r90 = [{ ...ruin, rot: Math.PI / 2 }];
  assert.ok(onForbiddenTerrain(r90, -1.8, 0, 0.63) || onForbiddenTerrain(r90, 1.8, 0, 0.63));
  assert.equal(onForbiddenTerrain(r90, 0.5, 0.5, 0.63), null);
  // Cráter: se entra y se puede acabar dentro
  assert.equal(onForbiddenTerrain([{ id: "T2", kind: "crater", x: 0, z: 0, rot: 0 }], 0, 0, 0.63), null);
});
