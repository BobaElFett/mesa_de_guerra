import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { aiPlayPhase, aiStep, assignObjectives, roleOf } from "../src/ai/tactics";
import { expectedAttack, p2D6 } from "../src/ai/evaluate";
import { MissionId, outcome } from "../src/rules/missions";
import { WEAPONS } from "../src/rules/datasheets";
import type { AiLevel } from "../src/ai/settings";
import { invariants } from "./fullgame.test";

function game(seed: number, mission: MissionId, L: AiLevel, S: AiLevel, check = false) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission });
  bus.dispatch({ type: "setRulesMode", on: true });
  let steps = 0;
  while (!bus.state.gameOver && steps++ < 300) {
    const s = bus.state;
    if (s.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
    aiPlayPhase(bus, s.active === 0 ? L : S, s.active === 0 ? S : L);
    if (check) invariants(bus.state, `${mission} semilla ${seed} ronda ${bus.state.turn} ${bus.state.phase}`);
  }
  return bus;
}

test("cuentas: 2D6 y valor esperado de un disparo", () => {
  assert.equal(p2D6(2), 1);
  assert.ok(Math.abs(p2D6(7) - 21 / 36) < 1e-9);
  assert.equal(p2D6(13), 0);
  const bus = new CommandBus(1);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  const garras = bus.state.units.find((u) => u.datasheet === "garras")!.id;
  // 10 rifles: 20 ataques, 2/3 impactan, F4 vs R4 hiere a 4+, Sv 5+ con FP −1 → 6+: 5/6 fallan
  const e = expectedAttack(bus.state, WEAPONS.rifleBolter, 10, garras);
  assert.ok(Math.abs(e.damage - 20 * (4 / 6) * 0.5 * (5 / 6)) < 1e-6, String(e.damage));
});

test("papeles: Garras de cuerpo a cuerpo, Fuego Pesado pesada, Asalto de disparo", () => {
  const bus = new CommandBus(1);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  const id = (d: string) => bus.state.units.find((u) => u.datasheet === d)!.id;
  assert.equal(roleOf(bus.state, id("garras")), "melee");
  assert.equal(roleOf(bus.state, id("fuegoPesado")), "heavy");
  assert.equal(roleOf(bus.state, id("asalto")), "shooter");
});

test("reparto de objetivos: cada objetivo a una sola unidad", () => {
  const bus = new CommandBus(3);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
  const a = assignObjectives(bus.state, "legion");
  assert.ok(a.size >= 2);
  assert.equal(new Set(a.values()).size, a.size);
});

test("la IA juega una fase paso a paso y acaba", () => {
  const bus = new CommandBus(4);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });
  bus.dispatch({ type: "nextPhase" });     // movimiento
  let n = 0;
  while (aiStep(bus, "dificil") && n < 50) n++;
  assert.ok(n >= 3, `pasos: ${n}`);       // una por unidad (el Capitán va con su escuadra)
  const units = bus.state.units.filter((u) => u.faction === "legion");
  for (const u of units) assert.ok(bus.state.turnLog.moves[u.id], `${u.id} sin movimiento declarado`);
});

test("partidas IA contra IA en las tres misiones: sin romper nada y reproducibles", () => {
  for (const m of ["tomar", "corazon", "caza"] as MissionId[]) {
    const a = game(77, m, "dificil", "normal", true);
    assert.ok(a.state.gameOver);
    const b = game(77, m, "dificil", "normal");
    assert.deepEqual(outcome(a.state), outcome(b.state));
    assert.equal(a.state.rng, b.state.rng);
  }
});

test("niveles: Difícil gana a Fácil con claridad y a Normal más veces que al revés", () => {
  const rec = (A: AiLevel, B: AiLevel, n: number) => {
    let w = 0, l = 0;
    for (const m of ["tomar", "corazon", "caza"] as MissionId[]) for (let i = 0; i < n; i++) {
      const x = outcome(game(500 + i, m, A, B).state); if (x.winner === "legion") w++; else if (x.winner === "swarm") l++;
      const y = outcome(game(900 + i, m, B, A).state); if (y.winner === "swarm") w++; else if (y.winner === "legion") l++;
    }
    return [w, l];
  };
  const [w1, l1] = rec("dificil", "facil", 4);
  assert.ok(w1 >= 18 && l1 <= 3, `Difícil contra Fácil: ${w1}-${l1}`);
  const [w2, l2] = rec("dificil", "normal", 6);
  console.log(`# Difícil contra Fácil ${w1}-${l1}; contra Normal ${w2}-${l2}`);
  assert.ok(w2 > l2, `Difícil contra Normal: ${w2}-${l2}`);
});
