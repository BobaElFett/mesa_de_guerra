import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, listPoints, validateList } from "../src/rules/armies";
import { DATASHEETS, pieceWeaponIds } from "../src/rules/datasheets";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [
  { datasheet: "capitan", models: 1, options: ["puno"] },
  { datasheet: "asalto", models: 10, options: ["sgtEnergia", "granadas", "granadas2"] },
  { datasheet: "fuegoPesado", models: 5, options: ["perf", "vengadora"] },
] };
const SWA: ArmyList = { units: [
  { datasheet: "tirano", models: 1, options: ["veneno"] },
  { datasheet: "carnifice", models: 2, options: ["espinas", "bioplasma"] },
  { datasheet: "escupidores", models: 10, options: ["devorador"] },
] };

test("equipo: coste y validación", () => {
  assert.equal(listPoints(LEG), 90 + 170 + 140 + 5);   // en la 11.ª casi todo el equipo es gratis
  assert.equal(listPoints(SWA), 195 + 180 + 55);
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
  const clash: ArmyList = { units: [{ datasheet: "tirano", models: 1, options: ["veneno", "espinas"] }] };
  assert.ok(validateList(clash, "swarm").some((e) => /misma arma/.test(e)));
  const bad: ArmyList = { units: [{ datasheet: "capitan", models: 1 }, { datasheet: "fuegoPesado", models: 5, options: ["sable"] }] };
  assert.ok(validateList(bad, "legion").some((e) => /desconocido/.test(e)));
  const small: ArmyList = { units: [{ datasheet: "capitan", models: 1 }, { datasheet: "asalto", models: 5, options: ["granadas2"] }] };
  assert.ok(validateList(small, "legion").some((e) => /10 miniaturas/.test(e)));
});

test("equipo: al desplegar, cada miniatura lleva lo elegido (cambios de varias armas y armas añadidas)", () => {
  const bus = new CommandBus(5);
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  const s = bus.state;
  const of = (ds: string) => s.pieces.filter((p) => s.units.find((u) => u.id === p.unit)!.datasheet === ds);
  assert.deepEqual(pieceWeaponIds(DATASHEETS.capitan, of("capitan")[0]), ["pistolaPesadaMaestra", "bolterMaestro", "punoEnergiaMaestro"]);
  const asalto = of("asalto"), A = DATASHEETS.asalto;
  const sgt = asalto.find((p) => p.leader)!;
  assert.deepEqual(pieceWeaponIds(A, sgt), ["pistolaBolter", "rifleBolter", "armaEnergia"]);
  const ws = asalto.map((p) => pieceWeaponIds(A, p));
  assert.equal(ws.filter((w) => w.includes("lanzagranadas")).length, 2);
  assert.equal(ws.filter((w) => w.includes("rifleBolter")).length, 10);   // el lanzagranadas se añade
  const fp = of("fuegoPesado").map((p) => pieceWeaponIds(DATASHEETS.fuegoPesado, p));
  assert.equal(fp.filter((w) => w.includes("lanzaderaVengadora") && !w.includes("cohetesPerf")).length, 1);
  assert.equal(fp.filter((w) => w.includes("cohetesPerf")).length, 4);
  assert.ok(of("carnifice").every((p) => { const w = pieceWeaponIds(DATASHEETS.carnifice, p); return w.includes("canonEspinas") && w.includes("bioplasma") && !w.includes("guadanasExtra"); }));
  assert.ok(of("escupidores").every((p) => pieceWeaponIds(DATASHEETS.escupidores, p).includes("devoradorCorto")));
  assert.ok(pieceWeaponIds(DATASHEETS.tirano, of("tirano")[0]).includes("canonVenenoTirano"));
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
  for (const w of ["cohetesPerf", "canonEspinas", "bioplasma", "lanzagranadas"]) assert.ok(used.has(w), `usa ${w}: ${[...used].join(",")}`);
});

test("el equipo cuenta en lo que vale la unidad al destruirla (#66)", async () => {
  const { unitCost } = await import("../src/rules/datasheets");
  const { statsOf } = await import("../src/rules/stats");
  const bus = new CommandBus(5);
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "caza" });
  const s0 = bus.state;
  const fp = s0.units.find((u) => u.datasheet === "fuegoPesado")!;
  assert.equal(unitCost(fp), 145);   // 140 + 5 de la lanzadera vengadora
  assert.equal(unitCost(s0.units.find((u) => u.datasheet === "capitan")!), 90);
  bus.dispatch({ type: "setRulesMode", on: true });
  const { recordCasualties } = await import("../src/rules/missions");
  const { cloneState } = await import("../src/core/state");
  const s = cloneState(bus.state);
  s.pieces = s.pieces.filter((p) => p.unit !== fp.id);
  recordCasualties(s, 1, fp.id, 5);
  assert.equal(s.killPts![1], 145);
  void statsOf;
});
