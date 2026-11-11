import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { BASE_RADIUS } from "../src/core/state";
import { ArmyList, validateList } from "../src/rules/armies";
import { arrivalBlocked, arrivalPlacement, ARRIVE_GAP, reserveUnits } from "../src/rules/reserves";
import { allowance } from "../src/rules/movement";
import { aiPlayPhase } from "../src/ai/tactics";
import { disc, gap } from "../src/rules/geometry";
import { outcome } from "../src/rules/missions";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "exterminadores", models: 5, reserve: true }] };
const SWA: ArmyList = { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "acechadores", models: 3, reserve: true }, { datasheet: "escupidores", models: 10 }] };

function game(mission: "tomar" | "caza" = "tomar", seed = 41) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });     // despliegue → mando
  return bus;
}

test("listas: solo pueden ir a la reserva las que tienen la habilidad, y como mucho la mitad de los puntos", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  const bad: ArmyList = { units: [{ datasheet: "capitan", models: 1 }, { datasheet: "asalto", models: 5, reserve: true }] };
  assert.ok(validateList(bad, "legion").some((e) => /no puede empezar en reserva/.test(e)));
  const much: ArmyList = { units: [{ datasheet: "capitan", models: 1 }, { datasheet: "exterminadores", models: 5, reserve: true }] };
  assert.ok(validateList(much, "legion").some((e) => /mitad/.test(e)));
});

test("las reservas empiezan fuera de la mesa y no llegan en la ronda 1", () => {
  const bus = game();
  const s = bus.state;
  const ext = s.units.find((u) => u.datasheet === "exterminadores")!;
  assert.equal(ext.reserve, true);
  assert.equal(s.pieces.filter((p) => p.unit === ext.id).length, 0);
  assert.equal(s.reserves!.filter((p) => p.unit === ext.id).length, 5);
  bus.dispatch({ type: "nextPhase" });   // movimiento ronda 1
  assert.match(arrivalBlocked(bus.state, ext.id)!, /ronda 2/);
});

test("llegada: a más de 9\" de todo enemigo, sin solapes; ese turno ya no mueve", () => {
  const bus = game();
  for (let i = 0; i < 10; i++) bus.dispatch({ type: "nextPhase" });   // ronda 2, mando de la Legión
  bus.dispatch({ type: "nextPhase" });                               // movimiento
  const s = bus.state;
  const ext = s.units.find((u) => u.datasheet === "exterminadores")!.id;
  assert.equal(arrivalBlocked(s, ext), null);
  // Pegado a un enemigo: no vale
  const e = s.pieces.find((p) => p.faction === "swarm")!;
  assert.equal(arrivalPlacement(s, ext, e.x, e.z + 2), null);
  bus.dispatch({ type: "arrive", unit: ext, x: 0, z: 14 });
  const s2 = bus.state;
  const ms = s2.pieces.filter((p) => p.unit === ext);
  assert.equal(ms.length, 5);
  for (const p of ms) for (const q of s2.pieces.filter((x) => x.faction === "swarm")) assert.ok(gap(disc(p), disc(q)) > ARRIVE_GAP - 1e-6);
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) assert.ok(Math.hypot(ms[i].x - ms[j].x, ms[i].z - ms[j].z) >= 2 * BASE_RADIUS.exterminador - 0.02);
  assert.equal(allowance(s2, ext, s2.turnLog.moves[ext]), 0);
  assert.equal(s2.units.find((u) => u.id === ext)!.reserve, false);
});

test("lo que no ha llegado al acabar la ronda 3 se pierde (y en Caza de presas da PV)", () => {
  const bus = game("caza");
  for (let i = 0; i < 30; i++) bus.dispatch({ type: "nextPhase" });   // 3 rondas enteras sin llegar
  const s = bus.state;
  assert.equal(s.turn, 4);
  assert.equal(reserveUnits(s).length, 0);
  assert.equal((s.reserves ?? []).length, 0);
  const ext = s.units.find((u) => u.datasheet === "exterminadores")!.id;
  assert.ok(s.kills!.some((k) => k.unit === ext && k.by === 1));
  assert.ok(s.vp![1] >= 8);                                            // 175 pts / 20
});

test("partidas IA contra IA con reservas: llegan, sin romper nada", () => {
  for (const seed of [1, 2, 3]) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
    bus.dispatch({ type: "setRulesMode", on: true });
    let arrivedL = false, arrivedS = false, guard = 0;
    while (!bus.state.gameOver && guard++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `reservas semilla ${seed} ronda ${bus.state.turn}`);
      const st = bus.state;
      if (st.units.some((u) => u.datasheet === "exterminadores" && !u.reserve && st.pieces.some((p) => p.unit === u.id))) arrivedL = true;
      if (st.units.some((u) => u.datasheet === "acechadores" && !u.reserve && st.pieces.some((p) => p.unit === u.id))) arrivedS = true;
    }
    assert.ok(bus.state.gameOver);
    assert.ok(arrivedL && arrivedS, `semilla ${seed}: llegan L ${arrivedL} S ${arrivedS}`);
    void outcome;
  }
});
