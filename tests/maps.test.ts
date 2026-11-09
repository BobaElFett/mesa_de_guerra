import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { BASE_RADIUS, DEPLOY_DEPTH, BOARD } from "../src/core/state";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { randomMap } from "../src/rules/maps";
import { MISSIONS } from "../src/rules/missions";
import { insideTerrain, onForbiddenTerrain, TERRAIN_RULES } from "../src/rules/geometry";
import { zoneBand } from "../src/rules/deployment";
import { aiDeploy } from "../src/ai/deploy";

test("mapas aleatorios: simétricos, sin sólidos en las zonas y sin tapar objetivos", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = randomMap(seed);
    assert.ok(m.length >= 9, `semilla ${seed}: ${m.length} piezas`);
    for (const t of m) {
      assert.ok(m.some((o) => o.kind === t.kind && Math.abs(o.x + t.x) < 1e-9 && Math.abs(o.z + t.z) < 1e-9), `semilla ${seed}: ${t.id} sin simétrica`);
      if (TERRAIN_RULES[t.kind].solid && !(t.x === 0 && t.z === 0)) assert.ok(Math.abs(t.z) < BOARD.d / 2 - DEPLOY_DEPTH, `semilla ${seed}: sólido en zona`);
    }
    for (const mi of Object.values(MISSIONS)) for (const o of mi.objectives) {
      if (o.x === 0 && o.z === 0) continue;   // el Corazón va en el búnker a propósito
      assert.ok(!m.some((t) => insideTerrain(t, o.x, o.z, 0.8)), `semilla ${seed}: objetivo ${o.name} tapado`);
    }
  }
  assert.deepEqual(randomMap(7), randomMap(7));
});

test("despliegue de la IA: en su zona, sin solapes ni encima de escenografía", () => {
  for (const seed of [1, 2, 3]) {
    const bus = new CommandBus(seed);
    bus.dispatch({ type: "setTerrain", pieces: randomMap(seed) });
    bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
    for (const f of ["legion", "swarm"] as const) {
      const mv = aiDeploy(bus.state, f);
      assert.ok(mv.length > 0);
      bus.dispatch({ type: "moveMany", moves: mv });
    }
    const s = bus.state;
    for (const p of s.pieces) {
      const [lo, hi] = zoneBand(p.faction, BASE_RADIUS[p.model]);
      assert.ok(p.z >= lo - 1e-6 && p.z <= hi + 1e-6, `${p.id} fuera de su zona`);
      assert.ok(!onForbiddenTerrain(s.terrain, p.x, p.z, BASE_RADIUS[p.model]), `${p.id} encima de escenografía`);
    }
    for (let i = 0; i < s.pieces.length; i++) for (let j = i + 1; j < s.pieces.length; j++) {
      const a = s.pieces[i], b = s.pieces[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= BASE_RADIUS[a.model] + BASE_RADIUS[b.model] - 0.02);
    }
  }
});
