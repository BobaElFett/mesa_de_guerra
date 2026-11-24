import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { cloneState, GameState } from "../src/core/state";
import { ArmyList, validateList } from "../src/rules/armies";
import { applyShoot, attackInput, shootingOptions, shootSteps } from "../src/rules/shooting";
import { applyFight, chargeOptions } from "../src/rules/melee";
import { applyStratagem, stratCost } from "../src/rules/stratagems";
import { hazardRolls, mortalWounds } from "../src/rules/eleventh";
import { DATASHEETS, WEAPONS } from "../src/rules/datasheets";
import { ARRIVE_GAP } from "../src/rules/reserves";

// Reglas de la 11.ª edición (fase 30) que no tienen prueba propia en otros ficheros.

const LEG: ArmyList = { units: [{ datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "exterminadores", models: 5 }] };
const SWA: ArmyList = { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "nodo", models: 3 }, { datasheet: "garras", models: 20 }, { datasheet: "lictor", models: 1 }] };

function game(seed = 3) {
  const bus = new CommandBus(seed);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}
const uid = (s: GameState, ds: string) => s.units.find((u) => u.datasheet === ds)!.id;
function place(s: GameState, unit: string, x: number, z: number) {
  s.pieces.filter((p) => p.unit === unit).forEach((p, i) => { p.x = x + (i % 10) * 1.3; p.z = z + Math.floor(i / 10) * 1.3; });
}
const away = (s: GameState, keep: string[]) => s.pieces.forEach((p, i) => { if (!keep.includes(p.unit!)) { p.x = -28 + (i % 40) * 1.4; p.z = p.faction === "legion" ? 20 : -20; } });

test("listas de la prueba válidas", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
  assert.equal(ARRIVE_GAP, 8);   // Despliegue profundo a más de 8"
});

test("Corto alcance: la infantería dispara pistolas o las demás armas, no las dos", () => {
  const bus = game();
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const a = uid(s, "asalto"), g = uid(s, "garras");
  away(s, [a, g]);
  place(s, a, 0, 6); place(s, g, 0, -2);
  const steps = shootSteps(s, a, g, ["pistolaBolter", "rifleBolter"]);
  assert.deepEqual(steps.map((x) => x.weapon.id), ["rifleBolter"]);
  applyShoot(s, a, "rifleBolter", g);
  const pistol = shootingOptions(s, a).weapons.find((w) => w.weapon.id === "pistolaBolter")!;
  assert.match(pistol.blocked ?? "", /otras armas/);
});

test("Furia de la Primera: +1 a la penetración a 9\" o menos", () => {
  const bus = game();
  const s = cloneState(bus.state);
  const t = uid(s, "exterminadores"), g = uid(s, "garras");
  away(s, [t, g]);
  place(s, t, 0, 6); place(s, g, 0, -1);
  const ms = s.pieces.filter((p) => p.unit === t);
  assert.equal(attackInput(s, "disparo", t, ms, WEAPONS.bolterTormenta, g).apMod, 1);
  place(s, g, 0, -12);
  assert.equal(attackInput(s, "disparo", t, ms, WEAPONS.bolterTormenta, g).apMod, 0);
});

test("Embate: las armas a distancia a 6\" del Tirano tienen Letal y disparan tras avanzar", () => {
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "movimiento")) bus.dispatch({ type: "nextPhase" });
  const s0 = bus.state;
  const n = uid(s0, "nodo"), t = uid(s0, "tirano"), a = uid(s0, "asalto");
  const tp = s0.pieces.find((p) => p.unit === t)!;
  bus.dispatch({ type: "moveMany", moves: s0.pieces.filter((p) => p.unit === n).map((p, i) => ({ id: p.id, x: tp.x + 3 + i * 1.4, z: tp.z })) });
  bus.dispatch({ type: "declareMove", unit: n, kind: "avanzar" });
  bus.dispatch({ type: "nextPhase" });   // disparo
  const s = bus.state;
  const dev = shootingOptions(s, n).weapons.find((w) => w.weapon.id === "devoradorGuerrero")!;
  assert.equal(dev.blocked, undefined);   // ha avanzado y aun así dispara
  const inp = attackInput(s, "disparo", n, s.pieces.filter((p) => p.unit === n), WEAPONS.devoradorGuerrero, a);
  assert.ok(inp.weapon.abilities.some((x) => x.kind === "letal"));
});

test("Depredadores adaptables: los Guerreros Nodo cargan aunque se hayan retirado", () => {
  const bus = game();
  const s = cloneState(bus.state);
  s.active = 1; s.phase = "carga";
  const n = uid(s, "nodo"), g = uid(s, "garras");
  s.turnLog.moves = { [n]: { kind: "retirarse" }, [g]: { kind: "retirarse" } } as never;
  assert.equal(chargeOptions(s, n).blocked, undefined);
  assert.match(chargeOptions(s, g).blocked ?? "", /retirado/);
});

test("Hora gloriosa: la primera vez que combate el Capitán, +3 ataques y Devastadora; luego ya no", () => {
  const bus = game();
  while (!(bus.state.active === 0 && bus.state.phase === "combate")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const c = uid(s, "capitan"), g = uid(s, "garras");
  away(s, [c, g]);
  place(s, c, 0, 1.6); place(s, g, -3, 0);
  const first = attackInput(s, "combate", c, s.pieces.filter((p) => p.unit === c), WEAPONS.armaEnergiaMaestra, g);
  assert.equal(first.extraAttacks, 3);
  assert.ok(first.weapon.abilities.some((x) => x.kind === "devastadora"));
  applyFight(s, c, g);
  assert.deepEqual(s.units.find((u) => u.id === c)!.spent, ["horaGloriosa"]);
  const later = attackInput(s, "combate", c, s.pieces.filter((p) => p.unit === c), WEAPONS.armaEnergiaMaestra, g);
  assert.equal(later.extraAttacks, 0);
});

test("Voluntad de la colmena: una estratagema a 12\" del Tirano cuesta 1 PM menos, una vez por ronda", () => {
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "carga")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const g = uid(s, "garras"), t = uid(s, "tirano"), n = uid(s, "nodo");
  place(s, t, 0, -10); place(s, g, 0, -6); place(s, n, 20, -15);
  assert.equal(stratCost(s, "hambre", g), 0);
  assert.equal(stratCost(s, "hambre", n), 1);   // lejos del Tirano
  const cp = s.cp[1];
  assert.ok(applyStratagem(s, "hambre", g));
  assert.equal(s.cp[1], cp);
  assert.equal(s.hiveWillRound, s.turn);
  place(s, n, 2, -8);
  assert.equal(stratCost(s, "hambre", n), 1);   // ya usada esta ronda
});

test("Tentáculos devoradores: matar a un personaje da 1 PM", () => {
  const bus = game();
  while (!(bus.state.active === 1 && bus.state.phase === "combate")) bus.dispatch({ type: "nextPhase" });
  for (let k = 0; k < 10; k++) {
    const s = cloneState(bus.state);
    s.rng = 77 + k * 31;
    const l = uid(s, "lictor"), c = uid(s, "capitan"), sq = uid(s, "asalto");
    s.units.find((u) => u.id === c)!.attachedTo = undefined;
    s.pieces = s.pieces.filter((p) => p.unit !== sq);
    away(s, [l, c]);
    place(s, c, 0, 1.6); place(s, l, 0, 0);
    s.pieces.find((p) => p.unit === c)!.damage = 4;   // le queda 1 herida
    const cp = s.cp[1];
    applyFight(s, l, c);
    if (!s.pieces.some((p) => p.unit === c)) { assert.equal(s.cp[1], cp + 1); return; }
  }
  assert.fail("el Acechador no mató al Capitán herido en 10 intentos");
});

test("tiradas de peligro y heridas mortales sueltas", () => {
  const bus = game();
  const s = cloneState(bus.state);
  const a = uid(s, "asalto");
  const haz = { ...WEAPONS.pistolaPlasma, abilities: [...WEAPONS.pistolaPlasma.abilities, { kind: "peligrosa" as const }] };
  let lost = 0;
  for (let k = 0; k < 30; k++) {
    const t = cloneState(s);
    t.rng = 5 + k * 13;
    const before = t.pieces.filter((p) => p.unit === a).reduce((n, p) => n + 2 - (p.damage ?? 0), 0);
    hazardRolls(t, a, haz, 3);
    lost += before - t.pieces.filter((p) => p.unit === a).reduce((n, p) => n + 2 - (p.damage ?? 0), 0);
  }
  assert.ok(lost > 15 && lost < 45, `heridas por peligro: ${lost} (≈ 30 × 3 × 1/3)`);
  const t = cloneState(s);
  const dead = mortalWounds(t, a, 5, "prueba");
  assert.equal(dead.length, 2);                        // 5 heridas a miniaturas de 2: caen 2 y otra queda herida
  assert.equal(t.pieces.filter((p) => p.unit === a && p.damage === 1).length, 1);
  assert.equal(DATASHEETS.tanque.damaged, 4);
});
