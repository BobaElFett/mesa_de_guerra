import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { cloneState, GameState } from "../src/core/state";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { shootingOptions, shootSteps } from "../src/rules/shooting";
import { fightSteps } from "../src/rules/melee";
import { chance2d6, expectText, previewAttacks, rollsNeeded } from "../src/rules/preview";
import { attackInput } from "../src/rules/shooting";
import { stateHash } from "../src/net/protocol";

function game() {
  const bus = new CommandBus(9);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}
const units = (s: GameState, ds: string) => s.units.filter((u) => u.datasheet === ds).map((u) => u.id);
function place(bus: CommandBus, unit: string, x: number, z: number) {
  const ms = bus.state.pieces.filter((p) => p.unit === unit);
  bus.dispatch({ type: "moveMany", moves: ms.map((p, i) => ({ id: p.id, x: x + (i % 10) * 1.3, z: z + Math.floor(i / 10) * 1.3 })) });
}

test("2D6: probabilidades de carga", () => {
  assert.equal(chance2d6(2), 1);
  assert.ok(Math.abs(chance2d6(7) - 21 / 36) < 1e-9);
  assert.ok(Math.abs(chance2d6(7, true) - (1 - (15 / 36) ** 2)) < 1e-9);
  assert.equal(chance2d6(13), 0);
});

test("vista previa del disparo: tiradas, medias deterministas y sin tocar el estado", () => {
  const bus = game();
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const sq = units(bus.state, "asalto")[1], g = units(bus.state, "garras")[0];
  place(bus, sq, -6, 6); place(bus, g, -6, -6);
  const s = bus.state;
  const h0 = stateHash(s);
  const steps = shootSteps(s, sq, g, shootingOptions(s, sq).weapons.map((w) => w.weapon.id));
  assert.ok(steps.length >= 1);
  const a = previewAttacks(s, steps, 200), b = previewAttacks(s, steps, 200);
  assert.deepEqual(a, b);
  assert.equal(stateHash(s), h0);
  // Rifle bólter (3+, F4, FP−1) contra Garras (R4, Sv5+): 3+, 4+ y salvan a 6+
  const rifle = steps.find((x) => x.weapon.id === "rifleBolter")!;
  const r = rollsNeeded(attackInput(s, "disparo", sq, rifle.attackers, rifle.weapon, g, rifle.extra));
  assert.deepEqual(r, { hitOn: 3, woundOn: 4, saveOn: 6 });
  // Las medias tienen sentido: 5 rifles × 2 a 3+, 4+ y 6+ ≈ 2,8 bajas, como mucho las que hay
  assert.ok(a.kills > 2 && a.kills < 3.6, String(a.kills));
});

test("Disparar con todas las armas: una orden, varias tiradas, hasta que cae", () => {
  const bus = game();
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const sq = units(bus.state, "asalto")[0], g = units(bus.state, "garras")[1];
  place(bus, sq, -6, 2); place(bus, g, -6, -1);
  const ws = shootingOptions(bus.state, sq).weapons.map((w) => w.weapon.id);
  const n = bus.length;
  bus.dispatch({ type: "shootAll", unit: sq, target: g, weapons: ws });
  assert.equal(bus.length, n + 1);
  const log = bus.state.combatLog.filter((e) => e.attacker === sq);
  assert.ok(log.length >= 1);
  assert.deepEqual(bus.state.turnLog.shot?.[sq]?.sort(), log.map((e) => e.weapon).sort());
});

test("vista previa del combate: sobre una copia, tras agruparse", () => {
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "combate")) bus.dispatch({ type: "nextPhase" });
  const g = units(bus.state, "garras")[0], sq = units(bus.state, "asalto")[1];
  place(bus, sq, 0, 1.6); place(bus, g, 0, 0);
  const s = bus.state;
  const before = JSON.stringify(s.pieces);
  const { state, steps } = fightSteps(s, g, sq);
  assert.equal(JSON.stringify(s.pieces), before);
  assert.ok(steps.length >= 1);
  const pv = previewAttacks(state, steps, 200);
  assert.ok(pv.kills > 0);
  void cloneState;
});

test("texto de lo esperado", () => {
  assert.equal(expectText(2.04, 2, 1), "≈ 2 bajas");
  assert.equal(expectText(1, 1, 1), "≈ 1 baja");
  assert.equal(expectText(0.2, 3.46, 11), "≈ 3,5 heridas");
});
