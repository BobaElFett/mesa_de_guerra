import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, listPoints, validateList } from "../src/rules/armies";
import { DATASHEETS, pieceWeaponIds } from "../src/rules/datasheets";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [
  { datasheet: "capitan", models: 1 },
  { datasheet: "asalto", models: 10, options: ["sgtEspada", "llamas", "misiles"] },
  { datasheet: "fuegoPesado", models: 5, options: ["laser"] },
] };
const SWA: ArmyList = { units: [
  { datasheet: "tirano", models: 1 },
  { datasheet: "garras", models: 20, options: ["veneno"] },
  { datasheet: "escupidores", models: 10, options: ["acido"] },
] };

test("equipo: coste y validación", () => {
  assert.equal(listPoints(LEG), 80 + 170 + 10 + 5 + 10 + 120 + 10);
  assert.equal(listPoints(SWA), 180 + 110 + 20 + 60);
  assert.deepEqual(validateList(LEG, "legion"), []);
  const clash: ArmyList = { units: [{ datasheet: "fuegoPesado", models: 5, options: ["misiles", "laser"] }] };
  assert.ok(validateList(clash, "legion").some((e) => /misma arma/.test(e)));
  const bad: ArmyList = { units: [{ datasheet: "fuegoPesado", models: 5, options: ["sable"] }] };
  assert.ok(validateList(bad, "legion").some((e) => /desconocido/.test(e)));
});

test("equipo: al desplegar, cada miniatura lleva lo elegido", () => {
  const bus = new CommandBus(5);
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  const s = bus.state;
  const of = (ds: string) => s.pieces.filter((p) => s.units.find((u) => u.id === p.unit)!.datasheet === ds);
  const asalto = of("asalto"), A = DATASHEETS.asalto;
  const sgt = asalto.find((p) => p.leader)!;
  assert.deepEqual(pieceWeaponIds(A, sgt), ["pistolaBolter", "espadaEnergia"]);
  const ws = asalto.map((p) => pieceWeaponIds(A, p));
  assert.equal(ws.filter((w) => w.includes("lanzallamas")).length, 1);
  assert.equal(ws.filter((w) => w.includes("lanzamisiles")).length, 1);
  assert.equal(ws.filter((w) => w.includes("rifleBolter")).length, 7);
  assert.ok(of("fuegoPesado").every((p) => pieceWeaponIds(DATASHEETS.fuegoPesado, p).includes("canonLaser")));
  assert.ok(of("garras").every((p) => pieceWeaponIds(DATASHEETS.garras, p)[0] === "garrasVenenosas"));
  assert.ok(of("escupidores").every((p) => pieceWeaponIds(DATASHEETS.escupidores, p).includes("acidoCorrosivo")));
});

test("equipo: se dispara con las armas nuevas y la IA juega con ellas", () => {
  const used = new Set<string>();
  for (const seed of [6, 7]) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "caza" });
    bus.dispatch({ type: "setRulesMode", on: true });
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `equipo ${seed}`);
    }
    for (const a of bus.state.combatLog) used.add(a.weapon);
  }
  for (const w of ["canonLaser", "lanzamisiles", "garrasVenenosas"]) assert.ok(used.has(w), `usa ${w}: ${[...used].join(",")}`);
});
