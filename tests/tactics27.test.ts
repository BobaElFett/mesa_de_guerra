import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { cloneState, GameState } from "../src/core/state";
import { TEST_LEGION, TEST_SWARM, ArmyList } from "../src/rules/armies";
import { applyShoot, shootingOptions } from "../src/rules/shooting";
import { applyCharge, applyFight } from "../src/rules/melee";
import { applyStratagem, stratBlocked } from "../src/rules/stratagems";
import { onHill } from "../src/rules/geometry";
import { nearAura } from "../src/rules/auras";
import { randomMap } from "../src/rules/maps";

const SWA: ArmyList = { units: [{ datasheet: "mente", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "garras", models: 10 }, { datasheet: "escupidores", models: 10 }] };

function game(swarm: ArmyList = TEST_SWARM) {
  const bus = new CommandBus(5);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}
const units = (s: GameState, ds: string) => s.units.filter((u) => u.datasheet === ds).map((u) => u.id);
function place(s: GameState, unit: string, x: number, z: number) {
  s.pieces.filter((p) => p.unit === unit).forEach((p, i) => { p.x = x + (i % 10) * 1.3; p.z = z + Math.floor(i / 10) * 1.3; });
}
const away = (s: GameState, keep: string[]) => s.pieces.forEach((p, i) => { if (!keep.includes(p.unit!)) { p.x = -28 + (i % 40) * 1.4; p.z = p.faction === "legion" ? 20 : -20; } });

test("estratagemas de bando: solo del bando y en su fase", () => {
  const bus = game();
  bus.dispatch({ type: "nextPhase" });
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const s = bus.state;
  const fp = units(s, "fuegoPesado")[0];
  assert.equal(stratBlocked(s, "fuegoSostenido", fp), null);
  assert.ok(stratBlocked(s, "frenesi", fp));
  assert.ok(stratBlocked(s, "avanceTactico", fp));      // fase de movimiento
});

test("Fuego sostenido: cada 6 para impactar da un impacto más", () => {
  const bus = game();
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const fp = units(s, "asalto")[1], g = units(s, "garras")[0];
  away(s, [fp, g]); place(s, fp, 0, 10); place(s, g, -6, -4);
  const plain = cloneState(s);
  assert.ok(applyStratagem(s, "fuegoSostenido", fp));
  const w = shootingOptions(s, fp).weapons.find((x) => x.weapon.id === "rifleBolter")!;
  const r0 = applyShoot(plain, fp, w.weapon.id, g)!.result;
  const r = applyShoot(s, fp, w.weapon.id, g)!.result;
  assert.deepEqual(r.hitRolls, r0.hitRolls);
  assert.equal(r.hits - r0.hits, r.hitRolls.filter((x) => x === 6).length);
});

test("Frenesí: un ataque más por miniatura", () => {
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "combate")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const g = units(s, "garras")[0], a = units(s, "asalto")[1];
  away(s, [g, a]); place(s, a, 0, 1.3); place(s, g, 0, 0);
  const base = applyFight(cloneState(s), g, a)!;
  assert.ok(applyStratagem(s, "frenesi", g));
  const more = applyFight(s, g, a)!;
  const atk = (es: typeof base) => es.reduce((n, e) => n + e.result.attacks, 0);
  const fighters = base.reduce((n, e) => n + e.attackers, 0);
  assert.equal(atk(more) - atk(base), fighters);
});

test("Hambre voraz: +2 a la carga", () => {
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "carga")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const g = units(s, "garras")[0], a = units(s, "asalto")[1];
  away(s, [g, a]); place(s, a, 0, 10); place(s, g, 0, 0);
  const plain = cloneState(s);
  assert.ok(applyStratagem(s, "hambre", g));
  const r1 = applyCharge(plain, g, a)!, r2 = applyCharge(s, g, a)!;
  assert.equal(r2.roll, r1.roll + 2);
});

test("Colina: la miniatura en alto suma +1 al disparar a quien no lo está", () => {
  const bus = game();
  bus.dispatch({ type: "addTerrain", kind: "colina", x: 0, z: 12, rot: 0 } as never);
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const fp = units(s, "asalto")[1], g = units(s, "garras")[0];
  away(s, [fp, g]);
  place(s, fp, -2.5, 12); place(s, g, -6, -4);
  assert.ok(s.pieces.filter((p) => p.unit === fp).every((p) => onHill(s.terrain, p.x, p.z)));
  const w = shootingOptions(s, fp).weapons.find((x) => x.weapon.id === "rifleBolter")!;
  const hi = applyShoot(cloneState(s), fp, w.weapon.id, g)!.result;
  const low = cloneState(s);
  place(low, fp, -2.5, 20);
  const lo = applyShoot(low, fp, w.weapon.id, g)!.result;
  assert.deepEqual(hi.hitRolls, lo.hitRolls);
  assert.equal(hi.hits - lo.hits, hi.hitRolls.filter((x) => x === 2).length);
  place(s, fp, -2.5, 20);
  assert.ok(!s.pieces.filter((p) => p.unit === fp).some((p) => onHill(s.terrain, p.x, p.z)));
});

test("Voluntad de la colmena: +1 para impactar en combate cerca de la Mente", () => {
  const bus = game(SWA);
  const s = cloneState(bus.state);
  const g = units(s, "garras")[0], m = units(s, "mente")[0];
  place(s, g, 0, 0); place(s, m, 20, 0);
  assert.equal(nearAura(s, g, "voluntad"), false);
  place(s, m, -3, 0);
  assert.equal(nearAura(s, g, "voluntad"), true);
});

test("los mapas al azar pueden tener colinas", () => {
  let n = 0;
  for (let i = 0; i < 40; i++) n += randomMap(i * 13, "aleatorio").filter((t) => t.kind === "colina").length;
  assert.ok(n > 0);
});
