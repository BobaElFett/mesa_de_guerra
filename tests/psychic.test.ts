import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, validateList } from "../src/rules/armies";
import { psychicBlocked, psychicTargets } from "../src/rules/psychic";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "psiquico", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "fuegoPesado", models: 5 }] };
const SWA: ArmyList = { units: [{ datasheet: "mente", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "escupidores", models: 10 }] };

function setup(seed: number) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "caza" });
  bus.dispatch({ type: "setTerrain", pieces: [] });
  const s = bus.state;
  // Todos cerca: la Legión en z=-6, el Enjambre en z=+6 (a unos 10")
  bus.dispatch({ type: "moveMany", moves: s.pieces.map((p, i) => ({ id: p.id, x: -16 + (i % 16) * 2, z: (p.faction === "legion" ? -6 : 6) + Math.floor(i / 16) * (p.faction === "legion" ? -2 : 2) })) });
  bus.dispatch({ type: "setRulesMode", on: true });
  for (let i = 0; i < 3; i++) bus.dispatch({ type: "nextPhase" });
  return bus;
}

test("listas con psíquicos son válidas", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
});

test("poder psíquico: una vez por turno; con 7+ hace heridas mortales; con doble 1/6, daño propio", () => {
  let ok = 0, fail = 0, perils = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const bus = setup(seed);
    const s = bus.state;
    assert.equal(s.phase, "disparo");
    const psy = s.units.find((u) => u.datasheet === "psiquico")!.id;
    assert.equal(psychicBlocked(s, psy), null);
    const t = psychicTargets(s, psy)[0];
    const before = s.history?.length ?? 0;
    const hp = s.pieces.find((p) => p.unit === psy)!.damage ?? 0;
    bus.dispatch({ type: "psychic", unit: psy, target: t });
    const s2 = bus.state;
    const use = s2.turnLog.psychic!.find((x) => x.unit === psy)!;
    const [a, b] = use.roll;
    const hit = s2.combatLog.some((e) => e.weapon === "rayoMental" && e.mortal);
    assert.equal(hit, a + b >= 7, `tirada ${a}+${b}`);
    if (hit) ok++; else fail++;
    const me = s2.pieces.find((p) => p.unit === psy);
    const self = me ? (me.damage ?? 0) - hp : 1;
    if (a === b && (a === 1 || a === 6)) { perils++; assert.equal(self, 1); } else assert.equal(self, 0);
    assert.match(psychicBlocked(s2, psy) ?? "", /Ya ha usado/);
    assert.ok((s2.history?.length ?? 0) > before);
  }
  assert.ok(ok > 20 && fail > 10, `salen ${ok}, fallan ${fail}`);
  void perils;
});

test("IA con psíquicos: los usa y nada se rompe", () => {
  let used = 0;
  for (const seed of [3, 4]) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
    bus.dispatch({ type: "setRulesMode", on: true });
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      const before = bus.state.history?.length;
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `psíquicos ${seed}`);
      if ((bus.state.history ?? []).slice(before).some((h) => /Rayo mental|Grito psíquico/.test(h.text))) used++;
    }
  }
  assert.ok(used >= 2, `usados ${used}`);
});
