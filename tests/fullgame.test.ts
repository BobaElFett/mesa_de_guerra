import { onForbiddenTerrain } from "../src/rules/geometry";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { BASE_RADIUS, BOARD, GameState } from "../src/core/state";
import { playPhase, survivingPoints } from "../src/ai/bot";
import { ArmyList, listPoints, validateList, TEST_LEGION, TEST_SWARM } from "../src/rules/armies";

export const LEGION: ArmyList = TEST_LEGION;
export const SWARM: ArmyList = TEST_SWARM;

export function invariants(s: GameState, where: string) {
  const units = new Set(s.units.map((u) => u.id));
  for (const p of s.pieces) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), `${where}: ${p.id} posición`);
    const r = BASE_RADIUS[p.model];
    assert.ok(Math.abs(p.x) <= BOARD.w / 2 + 1e-6 && Math.abs(p.z) <= BOARD.d / 2 + 1e-6, `${where}: ${p.id} fuera de la mesa`);
    assert.ok(p.unit && units.has(p.unit), `${where}: ${p.id} sin unidad`);
    assert.ok((p.damage ?? 0) >= 0, `${where}: ${p.id} daño negativo`);
    const t = onForbiddenTerrain(s.terrain, p.x, p.z, r);
    assert.ok(!t, `${where}: ${p.id} (${p.model}) encima de ${t?.kind} en ${p.x},${p.z}`);
  }
  for (let i = 0; i < s.pieces.length; i++) for (let j = i + 1; j < s.pieces.length; j++) {
    const a = s.pieces[i], b = s.pieces[j];
    const d = Math.hypot(a.x - b.x, a.z - b.z), need = BASE_RADIUS[a.model] + BASE_RADIUS[b.model];
    assert.ok(d >= need - 0.02, `${where}: ${a.id} y ${b.id} se solapan (${d.toFixed(2)} < ${need})`);
  }
}

export function playGame(seed: number, check = false) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: LEGION, swarm: SWARM });
  bus.dispatch({ type: "setRulesMode", on: true });
  let steps = 0;
  while (!bus.state.gameOver && steps++ < 200) {
    const where = `semilla ${seed}, ronda ${bus.state.turn} ${bus.state.phase} J${bus.state.active}`;
    playPhase(bus);
    if (check) invariants(bus.state, where);
  }
  return bus;
}

test("las listas de prueba son válidas: 460 y 485 puntos", () => {
  assert.deepEqual(validateList(LEGION, "legion"), []);
  assert.deepEqual(validateList(SWARM, "swarm"), []);
  assert.equal(listPoints(LEGION), 460);
  assert.equal(listPoints(SWARM), 485);
});

test("validación de listas", () => {
  assert.match(validateList({ units: [{ datasheet: "asalto", models: 5 }] }, "legion").join(" "), /personaje/);
  assert.match(validateList({ units: [{ datasheet: "capitan", models: 1 }, { datasheet: "asalto", models: 7 }] }, "legion").join(" "), /tamaño/);
  assert.match(validateList({ units: [{ datasheet: "tirano", models: 1 }] }, "legion").join(" "), /bando/);
  const many = { units: [{ datasheet: "capitan" as const, models: 1 }, ...Array(4).fill({ datasheet: "asalto", models: 5 })] };
  assert.match(validateList(many, "legion").join(" "), /Como mucho 3/);
});

test("despliegue: cada bando en su zona, sin solapes", () => {
  const bus = new CommandBus(1);
  bus.dispatch({ type: "setArmies", legion: LEGION, swarm: SWARM });
  const s = bus.state;
  assert.equal(s.units.length, 9);
  assert.equal(s.pieces.length, 1 + 10 + 5 + 5 + 1 + 3 + 20 + 10 + 10);
  for (const p of s.pieces) assert.ok(p.faction === "legion" ? p.z >= 12 - 1e-6 : p.z <= -12 + 1e-6, `${p.id} z=${p.z}`);
  invariants(s, "despliegue");
});

test("partidas completas: 5 rondas sin romper nada, y reproducibles", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const bus = playGame(seed, true);
    assert.equal(bus.state.gameOver, true, `semilla ${seed} no terminó`);
    assert.equal(bus.state.turn, 5);
    assert.ok(bus.state.combatLog.length > 0, "hubo combate");
    // Rehacer desde el registro da exactamente el mismo estado final
    const again = CommandBus.restore(bus.serialize());
    assert.equal(JSON.stringify(again.state), JSON.stringify(bus.state), `semilla ${seed} no es reproducible`);
  }
});

test("estadística de 40 partidas (para la prueba de diversión)", () => {
  let legionWins = 0, swarmWins = 0, draws = 0, attacks = 0, charges = 0, shocked = 0;
  const N = 40;
  for (let seed = 100; seed < 100 + N; seed++) {
    const bus = playGame(seed);
    const s = bus.state;
    const L = survivingPoints(s, "legion"), E = survivingPoints(s, "swarm");
    const lf = L / listPoints(LEGION), ef = E / listPoints(SWARM);
    if (Math.abs(lf - ef) < 0.05) draws++; else if (lf > ef) legionWins++; else swarmWins++;
    attacks += s.combatLog.length;
    charges += bus.serialize().log.filter((c) => c.type === "charge").length;
    shocked += s.moraleLog.filter((m) => !m.passed).length;
  }
  console.log(`# ${N} partidas: Legión gana ${legionWins}, Enjambre gana ${swarmWins}, empates ${draws}; ` +
    `${(attacks / N).toFixed(1)} ataques, ${(charges / N).toFixed(1)} cargas y ${(shocked / N).toFixed(1)} desmoralizadas por partida`);
  assert.ok(legionWins + swarmWins + draws === N);
});
