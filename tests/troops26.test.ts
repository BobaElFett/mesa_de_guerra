import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, validateList } from "../src/rules/armies";
import { cloneState, GameState } from "../src/core/state";
import { applyShoot } from "../src/rules/shooting";
import { applyFight, pendingChargers } from "../src/rules/melee";
import { repairVehicles } from "../src/rules/special";
import { woundTarget } from "../src/rules/attack";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "capitan", models: 1 }, { datasheet: "ingeniero", models: 1 }, { datasheet: "guardiaHonor", models: 3 }, { datasheet: "tanque", models: 1 }] };
const SWA: ArmyList = { units: [{ datasheet: "mente", models: 1 }, { datasheet: "lictor", models: 1 }, { datasheet: "aguijones", models: 20 }, { datasheet: "garras", models: 20 }] };

function game(seed = 2, clear = true) {
  const bus = new CommandBus(seed);
  if (clear) for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}
const uid = (s: GameState, ds: string) => s.units.find((u) => u.datasheet === ds)!.id;
function place(s: GameState, unit: string, x: number, z: number) {
  s.pieces.filter((p) => p.unit === unit).forEach((p, i) => { p.x = x + (i % 10) * 1.3; p.z = z + Math.floor(i / 10) * 1.3; });
}
const away = (s: GameState, keep: string[]) => s.pieces.forEach((p, i) => { if (!keep.includes(p.unit!)) { p.x = -28 + (i % 40) * 1.4; p.z = p.faction === "legion" ? 20 : -20; } });

test("listas válidas", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
});

test("Veneno: hiere a 4+ como mucho", () => {
  assert.equal(woundTarget(3, 10), 6);
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "combate")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const a = uid(s, "aguijones"), t = uid(s, "tanque");
  away(s, [a, t]);
  place(s, t, 0, 3); place(s, a, -3, 0.6);
  const out = applyFight(s, a, t);
  assert.ok(out && out.length);
  const r = out![0].result;
  assert.ok(r.woundRolls.length > 0);
  assert.equal(r.wounds, r.woundRolls.filter((x) => x >= 4).length);
});

test("Sigilo: −1 para impactar al Acechador oculto con disparos", () => {
  const bus = game();
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const l = uid(s, "lictor"), g = uid(s, "garras"), tank = uid(s, "tanque");
  away(s, [l, g, tank]);
  place(s, tank, 0, 10); place(s, l, -2, -4); place(s, g, 8, -4);
  const vsL = applyShoot(cloneState(s), tank, "canonBatalla", l)!.result;
  const vsG = applyShoot(cloneState(s), tank, "canonBatalla", g)!.result;
  // Cañón de batalla a 3+: contra el Acechador hace falta 4+
  assert.equal(vsL.hits, vsL.hitRolls.filter((x) => x >= 4).length);
  assert.equal(vsG.hits, vsG.hitRolls.filter((x) => x >= 3).length);
});

test("Contraataque: la Guardia de Honor combate primero aunque la hayan cargado", () => {
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "combate")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const gh = uid(s, "guardiaHonor"), g = uid(s, "garras");
  away(s, [gh, g]);
  place(s, gh, 0, 1.3); place(s, g, -3, 0);
  s.turnLog.charges = { [g]: { success: true, roll: 8, target: gh } } as never;
  const first = pendingChargers(s);
  assert.ok(first.includes(g) && first.includes(gh));
});

test("Reparar: el Ingeniero cura D3 heridas al tanque cercano al empezar el mando", () => {
  const bus = game();
  bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const e = uid(s, "ingeniero"), t = uid(s, "tanque");
  place(s, t, 0, 10); place(s, e, 3.5, 10);
  s.pieces.find((p) => p.unit === t)!.damage = 6;
  repairVehicles(s);
  const left = s.pieces.find((p) => p.unit === t)!.damage!;
  assert.ok(left >= 3 && left <= 5, `queda ${left}`);
  // Lejos no repara
  place(s, e, 20, 20);
  repairVehicles(s);
  assert.equal(s.pieces.find((p) => p.unit === t)!.damage, left);
});

test("partidas enteras con las cuatro tropas nuevas", () => {
  for (const seed of [1, 2, 3]) {
    const bus = game(seed, false);
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `tropas26 ${seed}`);
    }
    assert.ok(bus.state.gameOver);
  }
});
