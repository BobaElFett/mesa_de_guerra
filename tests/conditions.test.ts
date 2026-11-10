import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList } from "../src/rules/armies";
import { shootingOptions } from "../src/rules/shooting";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "capitan", models: 1 }, { datasheet: "fuegoPesado", models: 5 }] };
const SWA: ArmyList = { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 10 }] };

function at(dist: number, conditions?: "noche" | "tormenta") {
  const bus = new CommandBus(9);
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "caza", ...(conditions ? { conditions } : {}) });
  bus.dispatch({ type: "setTerrain", pieces: [] });
  const s = bus.state;
  const fp = s.units.find((u) => u.datasheet === "fuegoPesado")!.id;
  const gr = s.units.find((u) => u.datasheet === "garras")!.id;
  // Fuego pesado en z=0; las garras a `dist` de borde a borde, lejos el resto
  const moves = [
    ...s.pieces.filter((p) => p.unit === fp).map((p, i) => ({ id: p.id, x: -6 + i * 3, z: -14 })),
    ...s.pieces.filter((p) => p.unit === gr).map((p, i) => ({ id: p.id, x: -10 + i * 2, z: -14 + dist + 0.79 + 0.63 })),
    ...s.pieces.filter((p) => p.unit !== fp && p.unit !== gr).map((p) => ({ id: p.id, x: p.x, z: p.faction === "legion" ? -20 : 20 })),
  ];
  bus.dispatch({ type: "moveMany", moves });
  bus.dispatch({ type: "setRulesMode", on: true });
  for (let i = 0; i < 3; i++) bus.dispatch({ type: "nextPhase" });   // mando, movimiento, disparo
  return { bus, fp, gr };
}

test("noche: no se dispara a más de 24\"", () => {
  const day = at(28), night = at(28, "noche"), close = at(22, "noche");
  const target = (x: ReturnType<typeof at>) => shootingOptions(x.bus.state, x.fp).weapons[0].targets.find((t) => t.unit === x.gr)!;
  assert.equal(day.bus.state.phase, "disparo");
  assert.ok(!target(day).blocked, target(day).blocked);
  assert.match(target(night).blocked ?? "", /noche/);
  assert.ok(!target(close).blocked);
});

test("tormenta: −1 a impactar a más de 12\" (se ve en la tirada)", () => {
  const far = at(20, "tormenta"), near = at(8, "tormenta");
  for (const [x, mod] of [[far, -1], [near, 0]] as const) {
    const w = shootingOptions(x.bus.state, x.fp).weapons[0];
    x.bus.dispatch({ type: "shoot", unit: x.fp, weapon: w.weapon.id, target: x.gr });
    const e = x.bus.state.combatLog.at(-1)!;
    // Cañón pesado HP3 y Pesada (+1 sin moverse): 2+ normalmente, 3+ con tormenta a más de 12".
    // Sostenida 1: cada 6 da un impacto más. (Sin repetir unos: no hay Capitán al mando.)
    const need = mod ? 3 : 2;
    const expect = e.result.hitRolls.filter((r) => r >= need).length + e.result.hitRolls.filter((r) => r === 6).length;
    assert.equal(e.result.hits, expect, `tormenta ${mod}: ${e.result.hitRolls}`);
  }
});

test("IA contra IA de noche y con tormenta, sin romper nada", () => {
  for (const c of ["noche", "tormenta"] as const) {
    const bus = new CommandBus(12);
    bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar", conditions: c });
    bus.dispatch({ type: "setRulesMode", on: true });
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, c);
    }
    assert.ok(bus.state.gameOver);
    assert.equal(bus.state.conditions, c);
  }
});
