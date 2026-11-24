import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { cloneState, GameState } from "../src/core/state";
import { TEST_LEGION, TEST_SWARM, ArmyList } from "../src/rules/armies";
import { applyShoot, attackInput, shootingOptions } from "../src/rules/shooting";
import { WEAPONS } from "../src/rules/datasheets";
import { applyCharge, applyFight } from "../src/rules/melee";
import { applyStratagem, stratBlocked } from "../src/rules/stratagems";
import { onHill } from "../src/rules/geometry";
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
  s.objectives = [];   // sin objetivos: que no cuente la Disciplina bólter
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

test("Colina (11.ª): escenografía expuesta; no da +1 (no llega a 3\" de altura) y la infantería dentro está en cobertura", () => {
  const bus = game();
  bus.dispatch({ type: "addTerrain", kind: "colina", x: 0, z: 12, rot: 0 } as never);
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  s.objectives = [];
  const fp = units(s, "asalto")[1], g = units(s, "garras")[0];
  away(s, [fp, g]);
  place(s, fp, -2.5, 12); place(s, g, -6, -4);
  assert.ok(s.pieces.filter((p) => p.unit === fp).every((p) => onHill(s.terrain, p.x, p.z)));
  const hi = applyShoot(cloneState(s), fp, "rifleBolter", g)!.result;
  const low = cloneState(s);
  place(low, fp, -2.5, 20);
  const lo = applyShoot(low, fp, "rifleBolter", g)!.result;
  assert.deepEqual(hi.hitRolls, lo.hitRolls);
  assert.equal(hi.hits, lo.hits);
});

test("Guerrero alfa: la escuadra que lidera la Mente tiene Sostenida 1; la sinapsis da +1 a la Fuerza en combate", () => {
  const led: ArmyList = { units: [{ datasheet: "mente", models: 1, leads: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "garras", models: 10 }] };
  const bus = game(led);
  const s = cloneState(bus.state);
  const [g, other] = units(s, "garras"), a = units(s, "asalto")[0];
  const inp = attackInput(s, "combate", g, s.pieces.filter((p) => p.unit === g), WEAPONS.garras, a);
  assert.ok(inp.weapon.abilities.some((x) => x.kind === "sostenida"));
  assert.equal(inp.weapon.strength, WEAPONS.garras.strength + 1);   // en sinapsis (la Mente va con ellas)
  place(s, other, 25, 0);
  const far = attackInput(s, "combate", other, s.pieces.filter((p) => p.unit === other), WEAPONS.garras, a);
  assert.ok(inp.notes.some((n) => /Guerrero alfa/.test(n)));
  assert.ok(!far.notes.some((n) => /Guerrero alfa/.test(n)));   // (Sostenida sí, por Instintos de enjambre)
  assert.equal(far.weapon.strength, WEAPONS.garras.strength);
});

test("los mapas al azar pueden tener colinas", () => {
  let n = 0;
  for (let i = 0; i < 40; i++) n += randomMap(i * 13, "aleatorio").filter((t) => t.kind === "colina").length;
  assert.ok(n > 0);
});
