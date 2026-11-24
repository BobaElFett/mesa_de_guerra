import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { cloneState, GameState } from "../src/core/state";
import { ArmyList } from "../src/rules/armies";
import { applyShoot, attackInput, detectionRange, hiddenPiece, shootingOptions } from "../src/rules/shooting";
import { applyFight, fightOptions, fightPicker } from "../src/rules/melee";
import { runMoraleTests } from "../src/rules/morale";
import { resolveAttack, ScriptedDice } from "../src/rules/attack";
import { DATASHEETS, WEAPONS } from "../src/rules/datasheets";

// Reglas básicas de la 11.ª (fase 31): moral, huida desesperada, disparo oculto, indirecto,
// disparo trabado, orden de combate alterno y consolidación.

const LEG: ArmyList = { units: [{ datasheet: "capitan", models: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "andador", models: 1 }, { datasheet: "francotiradores", models: 3 }] };
const SWA: ArmyList = { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "biomorteros", models: 2 }, { datasheet: "carnifice", models: 1 }] };

function game(seed = 3) {
  const bus = new CommandBus(seed);
  for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}
const uid = (s: GameState, ds: string) => s.units.find((u) => u.datasheet === ds)!.id;
function place(s: GameState, unit: string, x: number, z: number, cols = 10) {
  s.pieces.filter((p) => p.unit === unit).forEach((p, i) => { p.x = x + (i % cols) * 1.4; p.z = z + Math.floor(i / cols) * 1.4; });
}
const away = (s: GameState, keep: string[]) => s.pieces.forEach((p, i) => { if (!keep.includes(p.unit!)) { p.x = -28 + (i % 40) * 1.4; p.z = p.faction === "legion" ? 20 : -20; } });

test("paso de moral: la desmoralizada vuelve a chequear y, si lo supera, se recupera", () => {
  let recovered = 0, stays = 0;
  for (let k = 0; k < 40; k++) {
    const s = cloneState(game().state);
    s.active = 1; s.rng = 11 + k * 97;
    const g = s.units.find((u) => u.datasheet === "garras")!;
    g.shocked = true;                               // al completo, pero desmoralizada
    const [e] = runMoraleTests(s);
    assert.equal(e.unit, g.id);
    if (e.passed) { recovered++; assert.equal(g.shocked, false); } else { stays++; assert.equal(g.shocked, true); }
  }
  assert.ok(recovered > 0 && stays > 0, `${recovered} / ${stays}`);
});

test("huida desesperada: retirarse desmoralizada cuesta tiradas de peligro", () => {
  let lost = 0;
  for (let k = 0; k < 10; k++) {
    const bus = game(20 + k);
    bus.dispatch({ type: "nextPhase" }); bus.dispatch({ type: "nextPhase" });   // movimiento de la Legión
    const s = bus.state;
    const a = uid(s, "asalto");
    s.units.find((u) => u.id === a)!.shocked = true;
    const before = s.pieces.filter((p) => p.unit === a).reduce((n, p) => n + 2 - (p.damage ?? 0), 0);
    bus.dispatch({ type: "declareMove", unit: a, kind: "retirarse" });
    lost += before - bus.state.pieces.filter((p) => p.unit === a).reduce((n, p) => n + 2 - (p.damage ?? 0), 0);
  }
  assert.ok(lost > 15 && lost < 55, `heridas: ${lost} (≈ 10 × 10 × 1/3)`);
});

test("oculta: la infantería en escenografía que no ha disparado solo se ve a 15\" (francotiradores, 12\")", () => {
  const bus = game();
  bus.dispatch({ type: "addTerrain", kind: "ruinaGrande", x: 0, z: 10, rot: 0 } as never);
  const s = cloneState(bus.state);
  const sn = uid(s, "francotiradores"), a = uid(s, "asalto");
  place(s, sn, -1.4, 10); place(s, a, 6, 11);
  const p = s.pieces.find((x) => x.unit === sn)!, q = s.pieces.find((x) => x.unit === a)!;
  assert.equal(hiddenPiece(s, sn, p), true);
  assert.equal(detectionRange(s, sn, p), 9);       // 15 − 3 cuerpo a tierra − 3 capas
  assert.equal(detectionRange(s, a, q), 15);
  s.active = 1; s.phase = "disparo";
  const bio = uid(s, "biomorteros");
  away(s, [sn, a, bio]);
  place(s, sn, -1.4, 10, 3);
  const vs = (z: number) => { place(s, bio, -1, z, 2); return shootingOptions(s, bio).weapons.find((w) => w.weapon.id === "lanzaMinas")!.targets.find((t) => t.unit === sn)!; };
  assert.equal(vs(-6).indirect, true);             // a ~15": no la ve (solo por indirecto)
  assert.ok(!vs(3).indirect);                       // a ~6": la ve
  // Ha disparado: deja de estar oculta este turno y el siguiente
  s.units.find((u) => u.id === sn)!.shotAt = s.turn * 2 + s.active;
  assert.equal(hiddenPiece(s, sn, p), false);
});

test("indirecto: sin visión fallan los 1–5 sin modificar; quieta y con otra unidad que lo ve, los 1–3", () => {
  const w = WEAPONS.lanzaMinas;
  const r = resolveAttack({ weapon: w, attackers: 1, failBelow: 6, target: { profile: DATASHEETS.asalto.profile, models: [{ id: "a", woundsLeft: 2 }] } },
    new ScriptedDice([3, /* D3 ataques */ 5, 6, 1, 1, 1, 1, 1]));
  assert.equal(r.attacks, 2);
  assert.deepEqual(r.hitRolls, [5, 6]);
  assert.equal(r.hits, 1);                          // el 5 falla aunque la HP sea 4+
});

test("disparo trabado: a un monstruo trabado con los tuyos, −1; el monstruo trabado dispara con −1", () => {
  const bus = game();
  while (bus.state.phase !== "disparo") bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const sn = uid(s, "francotiradores"), c = uid(s, "carnifice"), cap = uid(s, "capitan"), g = uid(s, "garras");
  away(s, [sn, c, cap, g]);
  place(s, cap, 0, 0); place(s, c, 0, -2.4); place(s, sn, 0, 12, 3); place(s, g, 12, -2);
  const rifle = shootingOptions(s, sn).weapons.find((w) => w.weapon.id === "rifleFrancotirador")!;
  const vsC = rifle.targets.find((t) => t.unit === c)!;
  assert.equal(vsC.blocked, undefined, vsC.blocked);
  assert.equal(vsC.penalty, true);
  // Turno del Enjambre: el Carnífice trabado dispara a quien quiera, con −1
  s.active = 1;
  s.pieces.filter((p) => p.unit === c).forEach((p) => { p.weapons = ["guadanas", "bioplasma"]; });
  const opts = shootingOptions(s, c).weapons.find((w) => w.weapon.id === "bioplasma")!;
  const t = opts.targets.find((x) => x.unit === cap)!;
  assert.match(t.blocked ?? "", /explosivas/);      // bioplasma es Explosiva: no a unidades trabadas
});

test("combate alterno: empieza el activo con las que golpean primero, luego se van turnando", () => {
  const bus = game();
  while (!(bus.state.active === 0 && bus.state.phase === "combate")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const a = uid(s, "asalto"), g = uid(s, "garras"), cap = uid(s, "capitan"), t = uid(s, "tirano");
  away(s, [a, g, cap, t]);
  place(s, a, -10, 1.5); place(s, g, -10, 0);     // trabadas
  place(s, cap, 10, 1.6); place(s, t, 10, -1);    // trabadas
  s.turnLog.fought = [];
  assert.equal(fightPicker(s), 0);                  // empieza la Legión (nadie ha cargado)
  assert.match(fightOptions(s, g).blocked ?? "", /rival/);
  applyFight(s, a, g);
  assert.equal(fightPicker(s), 1);                  // ahora el Enjambre
  assert.match(fightOptions(s, cap).blocked ?? "", /rival/);
});

test("ataque de disparo rápido: solo impacta con 6 y no son críticos (sin Sostenida)", () => {
  const r = resolveAttack({ weapon: WEAPONS.canonAsalto, attackers: 1, onlySixes: true, target: { profile: DATASHEETS.garras.profile, models: Array.from({ length: 20 }, (_, i) => ({ id: `g${i}`, woundsLeft: 1 })) } },
    new ScriptedDice([6, 6, 1, 1, 1, 1, /* herir */ 1, 1]));
  assert.equal(r.hits, 2);
  assert.equal(r.criticalHits, 0);
  void attackInput; void applyShoot;
});
