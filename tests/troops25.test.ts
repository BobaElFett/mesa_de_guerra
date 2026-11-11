import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, validateList } from "../src/rules/armies";
import { cloneState, GameState } from "../src/core/state";
import { nearAura } from "../src/rules/auras";
import { objectiveStatus } from "../src/rules/missions";
import { applyShoot } from "../src/rules/shooting";
import { devour } from "../src/rules/special";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "portaestandarte", models: 1, leads: 1 }, { datasheet: "asalto", models: 5 }, { datasheet: "tanque", models: 1 }, { datasheet: "asalto", models: 5 }] };
const SWA: ArmyList = { units: [{ datasheet: "mente", models: 1 }, { datasheet: "guardiana", models: 1 }, { datasheet: "devorador", models: 1 }, { datasheet: "garras", models: 10 }, { datasheet: "escupidores", models: 10 }] };

function game(seed = 2) {
  const bus = new CommandBus(seed);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}
const units = (s: GameState, ds: string) => s.units.filter((u) => u.datasheet === ds).map((u) => u.id);
function place(s: GameState, unit: string, x: number, z: number) {
  s.pieces.filter((p) => p.unit === unit).forEach((p, i) => { p.x = x + (i % 10) * 1.3; p.z = z + Math.floor(i / 10) * 1.3; });
}

test("las listas con las cuatro tropas nuevas son válidas", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
});

test("Estandarte: +1 al control de objetivos de cada miniatura cercana", () => {
  const bus = game();
  const s = cloneState(bus.state);
  const [, free] = units(s, "asalto");
  const banner = units(s, "portaestandarte")[0];
  const o = s.objectives![0];
  // Escuadra libre sobre el objetivo, estandarte lejos
  place(s, free, o.x - 2, o.z);
  place(s, banner, 30, 0); place(s, s.units.find((u) => u.id === banner)!.attachedTo!, 30, 3);
  s.pieces.filter((p) => p.faction === "swarm").forEach((p, i) => { p.x = -30 + (i % 10); p.z = -20 + Math.floor(i / 10); });
  const near = (st: GameState) => objectiveStatus(st, o).oc[0];
  const base = near(s);
  assert.equal(nearAura(s, free, "estandarte"), false);
  // El estandarte a 3"
  place(s, banner, o.x - 2, o.z + 3);
  assert.equal(nearAura(s, free, "estandarte"), true);
  assert.ok(near(s) >= base + 5);
});

test("Escudo vivo: invulnerable 5+ contra disparos cerca de la Bestia Guardiana", () => {
  const bus = game();
  bus.dispatch({ type: "nextPhase" });
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const g = units(s, "garras")[0], guard = units(s, "guardiana")[0], tank = units(s, "tanque")[0];
  place(s, g, -6, -6); place(s, tank, 0, 14);
  place(s, guard, 30, -20);
  const far = applyShoot(cloneState(s), tank, "canonBatalla", g)!;
  place(s, guard, -2, -10);
  assert.ok(nearAura(s, g, "escudoVivo"));
  const near = applyShoot(cloneState(s), tank, "canonBatalla", g)!;
  // Garras Sv6 contra FP−2: sin salvación lejos; con el escudo, 5+
  assert.equal(far.result.saveTarget, null);
  assert.equal(near.result.saveTarget, 5);
});

test("Devorar: cura 1 herida por cada miniatura que mata en combate", () => {
  const bus = game();
  const s = cloneState(bus.state);
  const d = units(s, "devorador")[0];
  const p = s.pieces.find((x) => x.unit === d)!;
  p.damage = 5;
  devour(s, d, 3);
  assert.equal(s.pieces.find((x) => x.unit === d)!.damage, 2);
  devour(s, d, 9);
  assert.equal(s.pieces.find((x) => x.unit === d)!.damage, 0);
});

test("Blindado: el Tanque Martillo resta 1 al daño de cada ataque", () => {
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "disparo")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const tank = units(s, "tanque")[0], esc = units(s, "escupidores")[0];
  place(s, tank, 0, 4); place(s, esc, -6, -6);
  const e = applyShoot(s, esc, "escupidor", tank)!;
  const dmg = s.pieces.find((x) => x.unit === tank)?.damage ?? 0;
  assert.ok(dmg <= e.result.failedSaves);   // D1 sigue siendo 1 como mínimo
});

test("partidas enteras con las cuatro tropas nuevas", () => {
  for (const seed of [1, 2, 3]) {
    const bus = game(seed);
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `tropas25 ${seed}`);
    }
    assert.ok(bus.state.gameOver);
  }
});
