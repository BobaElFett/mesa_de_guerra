import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, validateList } from "../src/rules/armies";
import { cloneState, GameState } from "../src/core/state";
import { applyShoot, attackInput, shootingOptions } from "../src/rules/shooting";
import { inSynapse } from "../src/rules/morale";
import { WEAPONS } from "../src/rules/datasheets";
import { applyFight, pendingChargers } from "../src/rules/melee";
import { repairVehicles } from "../src/rules/special";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "capitan", models: 1 }, { datasheet: "ingeniero", models: 1 }, { datasheet: "guardiaHonor", models: 3 }, { datasheet: "tanque", models: 1 }] };
const SWA: ArmyList = { units: [{ datasheet: "mente", models: 1 }, { datasheet: "lictor", models: 1 }, { datasheet: "aguijones", models: 22 }, { datasheet: "garras", models: 20 }] };

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

test("Neurocitos: los Aguijones en sinapsis también dan sinapsis", () => {
  const bus = game();
  const s = cloneState(bus.state);
  const a = uid(s, "aguijones"), g = uid(s, "garras"), m = uid(s, "mente");
  away(s, [a, g, m]);
  place(s, a, 0, 0); place(s, g, 0, 6.5); place(s, m, 0, -5);
  assert.equal(inSynapse(s, a), true);
  assert.equal(inSynapse(s, g), true);       // por los Aguijones, a 6" de ellas
  place(s, m, 25, -15);
  assert.equal(inSynapse(s, a), false);
  assert.equal(inSynapse(s, g), false);
});

test("Sigilo: los disparos contra el Acechador oculto lo tratan en cobertura (−1 a la HP); Operativo solitario: solo a 12\"", () => {
  const bus = game();
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const l = uid(s, "lictor"), g = uid(s, "garras"), tank = uid(s, "tanque");
  away(s, [l, g, tank]);
  place(s, tank, 0, 4); place(s, l, -2, -4); place(s, g, 8, -4);
  const vsL = applyShoot(cloneState(s), tank, "autocanonTanque", l)!;
  const vsG = applyShoot(cloneState(s), tank, "autocanonTanque", g)!;
  assert.equal(vsL.cover, true);
  assert.equal(vsL.result.hits, vsL.result.hitRolls.filter((x) => x >= 4).length);
  assert.equal(vsG.result.hits, vsG.result.hitRolls.filter((x) => x >= 3).length);
  place(s, l, -2, -14);
  const t = shootingOptions(s, tank).weapons.find((w) => w.weapon.id === "autocanonTanque")!.targets.find((x) => x.unit === l)!;
  assert.match(t.blocked ?? "", /solitario/);
});

test("Golpea primero: el Acechador oculto combate primero aunque lo hayan cargado", () => {
  const bus = game();
  while (!(bus.state.active === 0 && bus.state.phase === "combate")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const gh = uid(s, "guardiaHonor"), l = uid(s, "lictor");
  away(s, [gh, l]);
  place(s, gh, 0, 1.3); place(s, l, 0.6, -0.4);
  s.turnLog.charges = { [gh]: { success: true, roll: 8, need: 3, target: l } };
  const first = pendingChargers(s);
  assert.ok(first.includes(gh) && first.includes(l));
});

test("Guardia de la hoja: −1 para impactar a quien la ataca antes de que golpee; si golpea primero, +1", () => {
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "combate")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const gh = uid(s, "guardiaHonor"), g = uid(s, "garras");
  away(s, [gh, g]);
  place(s, gh, 0, 1.3); place(s, g, -3, 0);
  const atk = attackInput(s, "combate", g, s.pieces.filter((p) => p.unit === g), WEAPONS.garras, gh);
  assert.ok(atk.notes.some((n) => /Guardia de la hoja/.test(n)));
  assert.equal(atk.hitMod, -1);
  applyFight(s, g, gh);
  assert.equal(s.turnLog.guarded?.[gh], g);
  // Ya la ha usado para defenderse: al golpear no suma
  const back = attackInput(s, "combate", gh, s.pieces.filter((p) => p.unit === gh), WEAPONS.espadaMaestra, g);
  assert.equal(back.hitMod, 0);
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
