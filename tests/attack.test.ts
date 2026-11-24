import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAttack, woundTarget, saveTarget, ScriptedDice, SeededDice, AttackInput, rollDiceExpr, hitSkill } from "../src/rules/attack";
import { WEAPONS, DATASHEETS, Weapon, unitPoints, avgDice, parseDice } from "../src/rules/datasheets";

const P = (id: keyof typeof DATASHEETS) => DATASHEETS[id].profile;
const models = (n: number, w: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, woundsLeft: w }));
const weapon = (over: Partial<Weapon>): Weapon => ({ ...WEAPONS.rifleBolter, abilities: [], ...over });

test("tabla de herir: Fuerza contra Resistencia", () => {
  assert.equal(woundTarget(8, 4), 2);   // doble o más
  assert.equal(woundTarget(5, 4), 3);   // mayor
  assert.equal(woundTarget(4, 4), 4);   // igual
  assert.equal(woundTarget(3, 4), 5);   // menor
  assert.equal(woundTarget(2, 4), 6);   // mitad o menos
  assert.equal(woundTarget(4, 9), 6);
  assert.equal(woundTarget(12, 9), 3);
});

test("salvación: penetración e invulnerable; la cobertura empeora la HP (11.ª)", () => {
  assert.equal(saveTarget(P("asalto"), 0), 3);
  assert.equal(saveTarget(P("asalto"), -1), 4);
  assert.equal(saveTarget(P("garras"), -2), null);   // 5+ con −2 = 7+: sin salvación
  assert.equal(saveTarget(P("capitan"), -3), 4);     // armadura 6+, invulnerable 4+
  assert.equal(saveTarget(P("reventadores"), 0), null);   // Sv 7+: nunca salva
  assert.equal(hitSkill(WEAPONS.rifleBolter, true), 4);   // 3+ en cobertura: 4+
  assert.equal(hitSkill(WEAPONS.rifleBolter, false), 3);
  assert.equal(hitSkill(weapon({ abilities: [{ kind: "ignoraCobertura" }] }), true), 3);
});

test("dados de la 11.ª: D3+3, D6+1, 2D6", () => {
  assert.deepEqual(parseDice("D3+3"), { n: 1, sides: 3, plus: 3 });
  assert.deepEqual(parseDice("2D6"), { n: 2, sides: 6, plus: 0 });
  assert.equal(avgDice("D3+3"), 5);
  assert.equal(avgDice("D6+1"), 4.5);
  assert.equal(avgDice(2), 2);
  assert.equal(rollDiceExpr("D3+3", new ScriptedDice([5])), 6);    // 5 → 3, +3
  assert.equal(rollDiceExpr("2D6", new ScriptedDice([2, 6])), 8);
  assert.equal(rollDiceExpr("D6+1", new ScriptedDice([4])), 5);
});

test("secuencia completa con dados fijos: rifles contra Garras", () => {
  // 2 legionarios × 2 ataques = 4 a tirar: 3+ impacta
  // impactar: 1 (falla), 3, 5, 6 → 3 impactos; herir F5 vs R3 = 3+: 2 (falla), 4, 6 → 2 heridas
  // salvar 5+ con −1 = 6+: 6 (salva), 3 (falla) → 1 Garra muerta
  const dice = new ScriptedDice([1, 3, 5, 6, 2, 4, 6, 6, 3]);
  const r = resolveAttack({ weapon: WEAPONS.rifleBolter, attackers: 2, target: { profile: P("garras"), models: models(10, 1) } }, dice);
  assert.equal(r.attacks, 4);
  assert.equal(r.hits, 3);
  assert.equal(r.criticalHits, 1);
  assert.equal(r.wounds, 2);
  assert.equal(r.saveTarget, 6);
  assert.deepEqual(r.saveRolls, [6, 3]);
  assert.equal(r.failedSaves, 1);
  assert.deepEqual(r.slain, ["m1"]);
  assert.equal(dice.used, 9);
});

test("un 1 siempre falla y un 6 siempre impacta, con modificadores", () => {
  const w = weapon({ attacks: 2, skill: 6, strength: 4, abilities: [] });
  const r = resolveAttack({ weapon: w, attackers: 1, hitMod: +1, target: { profile: P("garras"), models: models(1, 1) } },
    new ScriptedDice([6, 5, 1, 1, 6]));
  // 6 impacta; 5+1=6 impacta; heridas F4 vs R3: 1 falla, 1 falla
  assert.equal(r.hits, 2);
  assert.equal(r.wounds, 0);
});

test("Pesada: +1 al impactar si no se movió (y el límite de ±1)", () => {
  const w = weapon({ attacks: 3, skill: 3, strength: 5, abilities: [{ kind: "pesada" }] });
  const r = resolveAttack({ weapon: w, attackers: 1, stationary: true, hitMod: +1, target: { profile: P("asalto"), models: models(5, 2) } },
    new ScriptedDice([2, 2, 2, /* herir F5 vs R5 4+ */ 1, 1, 1]));
  assert.equal(r.hits, 3);   // 2 + 1 (límite ±1) = 3: impacta
});

test("Sostenida 1: cada crítico da un impacto más; Letal hiere solo", () => {
  const sus = resolveAttack({ weapon: WEAPONS.canonAsalto, attackers: 1, target: { profile: P("asalto"), models: models(5, 2) } },
    new ScriptedDice([6, 6, 1, 1, 1, 1, /* 4 impactos a herir */ 1, 1, 1, 1]));
  assert.equal(sus.hits, 4);
  const let_ = resolveAttack({ weapon: weapon({ attacks: 2, abilities: [{ kind: "letal" }] }), attackers: 1, target: { profile: P("andador"), models: models(1, 8) } },
    new ScriptedDice([6, 6, /* 2 heridas automáticas a salvar 2+ con −1 = 3+ */ 1, 1]));
  assert.equal(let_.autoWounds, 2);
  assert.equal(let_.woundRolls.length, 0);
  assert.equal(let_.wounds, 2);
});

test("Devastadora: la herida crítica no permite salvar", () => {
  const w = weapon({ attacks: 1, skill: 2, strength: 5, ap: 0, damage: 1, abilities: [{ kind: "devastadora" }] });
  const r = resolveAttack({ weapon: w, attackers: 2, target: { profile: P("asalto"), models: models(5, 2) } },
    new ScriptedDice([3, 3, /* herir 4+ */ 6, 4, /* solo la segunda se salva (3+) */ 2]));
  assert.equal(r.criticalWounds, 1);
  assert.deepEqual(r.saveRolls, [2]);
  assert.equal(r.failedSaves, 2);
});

test("Torrente impacta sin tirar; Ráfaga suma ataques a media distancia", () => {
  const t = resolveAttack({ weapon: WEAPONS.lanzallamasPesado, attackers: 1, target: { profile: P("asalto"), models: models(5, 2) } },
    new ScriptedDice([/* herir F5 vs R5 4+ */ 1, 1, 1, 1]));
  assert.equal(t.attacks, 4);           // 3 + 1 por Explosiva (5 miniaturas)
  assert.equal(t.hitRolls.length, 0);
  assert.equal(t.hits, 4);
  const near = resolveAttack({ weapon: WEAPONS.rifleBolter, attackers: 1, distance: 12, target: { profile: P("garras"), models: models(20, 1) } },
    new SeededDice(1));
  const far = resolveAttack({ weapon: WEAPONS.rifleBolter, attackers: 1, distance: 13, target: { profile: P("garras"), models: models(20, 1) } },
    new SeededDice(1));
  assert.equal(near.attacks, 3);
  assert.equal(far.attacks, 2);
});

test("daño: primero la herida, el sobrante se pierde", () => {
  // Puño del andador (D3) contra legionarios de 2 heridas: 3 de daño a una miniatura de 2 → muere, se pierde 1
  const r = resolveAttack({ weapon: WEAPONS.punoAndador, attackers: 1,
    target: { profile: P("asalto"), models: [{ id: "a", woundsLeft: 2 }, { id: "b", woundsLeft: 1 }] } },
    new ScriptedDice([3, 3, 3, 3, 3, /* herir 2+ */ 2, 2, 2, 2, 2, /* salvar 3+ con −2 = 5+ */ 1, 1, 6, 6, 6]));
  // la herida «b» (ya herida) cae primero; luego «a»
  assert.deepEqual(r.slain, ["b", "a"]);
  assert.equal(r.failedSaves, 2);
});

test("Gemela repite la herida fallada; Fusión suma daño a media distancia; Anti hace críticos", () => {
  const twin = resolveAttack({ weapon: weapon({ attacks: 1, skill: 2, strength: 4, ap: 0, abilities: [{ kind: "gemela" }] }), attackers: 1,
    target: { profile: P("asalto"), models: models(5, 2) } }, new ScriptedDice([4, /* herir 5+: 2 falla, repite 5 */ 2, 5, /* salva */ 1]));
  assert.deepEqual(twin.woundRolls, [5]);
  assert.equal(twin.wounds, 1);
  const melta = resolveAttack({ weapon: WEAPONS.multiFusion, attackers: 1, distance: 6,
    target: { profile: P("tanque"), models: models(1, 11) } }, new ScriptedDice([4, 4, /* F10 vs R10 4+ */ 4, 4, /* salva 3+ −3 = 6+ y daño D3+2, herida a herida */ 1, 2, 1, 2]));
  assert.deepEqual(melta.damageRolls, [1 + 2 + 3, 1 + 2 + 3]);   // D3 (1) + 2 + Fusión 3
  const anti = resolveAttack({ weapon: WEAPONS.pistolaGrav, attackers: 1, target: { profile: P("tanque"), models: models(1, 11), type: "vehiculo" } },
    new ScriptedDice([3, 3, /* F2 vs R10 6+, pero Anti-vehículo 2+ */ 2, 3, /* salvas 3+ −1 = 4+ */ 1, 1]));
  assert.equal(anti.wounds, 2);
  assert.equal(anti.criticalWounds, 2);
});

test("mejora de penetración y daño de más", () => {
  const r = resolveAttack({ weapon: WEAPONS.rifleBolter, attackers: 1, apMod: 1, damageMod: 1, target: { profile: P("asalto"), models: models(5, 2) } },
    new ScriptedDice([3, 3, /* herir F5 vs R5 4+ */ 4, 4, /* salvar 3+ con −2 = 5+ */ 4, 5]));
  assert.equal(r.saveTarget, 5);
  assert.deepEqual(r.damageRolls, [2]);
  assert.deepEqual(r.slain, ["m1"]);
});

test("Explosiva: +1 ataque por cada 5 miniaturas del objetivo", () => {
  const w = weapon({ attacks: 1, abilities: [{ kind: "explosiva" }] });
  const r = resolveAttack({ weapon: w, attackers: 1, target: { profile: P("garras"), models: models(12, 1) } }, new SeededDice(3));
  assert.equal(r.attacks, 3);
});

test("estadística: 10 000 rifles contra Garras dan lo esperado", () => {
  // Esperado por ataque: 2/3 impactan × 2/3 hieren (F5 contra R3) × 5/6 no salvan (6+) = 0,370
  const r = resolveAttack({ weapon: WEAPONS.rifleBolter, attackers: 5000, target: { profile: P("garras"), models: models(100000, 1) } }, new SeededDice(12345));
  const rate = r.slain.length / r.attacks;
  assert.ok(Math.abs(rate - (2 / 3) * (2 / 3) * (5 / 6)) < 0.015, `tasa ${rate}`);
});

test("es determinista: misma semilla, mismo resultado", () => {
  const input: AttackInput = { weapon: WEAPONS.garrasGuerrero, attackers: 3, target: { profile: P("asalto"), models: models(5, 2) } };
  assert.deepEqual(resolveAttack(input, new SeededDice(99)), resolveAttack(input, new SeededDice(99)));
});

test("puntos de las unidades (11.ª): por tamaño y la 3.ª unidad igual", () => {
  assert.equal(unitPoints(DATASHEETS.asalto, 5), 85);
  assert.equal(unitPoints(DATASHEETS.asalto, 10), 170);
  assert.equal(unitPoints(DATASHEETS.garras, 20), 120);
  assert.equal(unitPoints(DATASHEETS.asalto, 7), null);
  assert.equal(unitPoints(DATASHEETS.exterminadores, 5), 190);
  assert.equal(unitPoints(DATASHEETS.exterminadores, 5, 3), 230);
  assert.equal(unitPoints(DATASHEETS.asalto, 5, 3), 85);       // sin precio de 3.ª: el mismo
  for (const ds of Object.values(DATASHEETS)) {
    for (const id of [...ds.weapons, ...(ds.leaderWeapons ?? []), ...(ds.options ?? []).map((o) => o.with)]) assert.ok(WEAPONS[id], `${ds.id}: arma ${id}`);
    for (const o of ds.options ?? []) for (const r of [o.replace].flat()) assert.ok(WEAPONS[r], `${ds.id}: ${o.id} cambia ${r}`);
  }
});
