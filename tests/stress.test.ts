import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { GameState } from "../src/core/state";
import { DATASHEETS } from "../src/rules/datasheets";
import { MissionId } from "../src/rules/missions";
import { randomList } from "../src/rules/randomList";
import { randomMap } from "../src/rules/maps";
import { relicOf } from "../src/rules/relic";
import { statsOf } from "../src/rules/stats";
import { aiPlayPhase } from "../src/ai/tactics";
import { stateHash } from "../src/net/protocol";
import { invariants } from "./fullgame.test";

const MISSIONS: MissionId[] = ["tomar", "corazon", "caza", "reliquia", "asalto"];
const CONDS = [undefined, "noche", "tormenta"] as const;
const LEVELS = ["facil", "normal", "dificil"] as const;

/** Invariantes de más (#80) sobre las de fullgame. */
export function deepInvariants(s: GameState, where: string) {
  invariants(s, where);
  assert.ok(s.cp[0] >= 0 && s.cp[1] >= 0, `${where}: PM negativos`);
  assert.ok((s.vp?.[0] ?? 0) >= 0 && (s.vp?.[1] ?? 0) >= 0, `${where}: PV negativos`);
  assert.ok(s.turn >= 1 && s.turn <= 6, `${where}: ronda ${s.turn}`);
  for (const p of s.pieces) {
    const u = s.units.find((x) => x.id === p.unit)!;
    assert.ok((p.damage ?? 0) < DATASHEETS[u.datasheet].profile.W, `${where}: ${p.id} sigue en la mesa con todas sus heridas perdidas`);
  }
  const onTable = new Set(s.pieces.map((p) => p.id));
  for (const r of s.reserves ?? []) assert.ok(!onTable.has(r.id), `${where}: ${r.id} en reserva y en la mesa`);
  for (const u of s.units) {
    if (u.reserve) assert.ok(!s.pieces.some((p) => p.unit === u.id), `${where}: ${u.datasheet} en reserva con miniaturas en la mesa`);
    const st = statsOf(s, u.id);
    assert.ok(st.dmg >= 0 && st.taken >= 0 && st.kills >= 0 && st.lost >= 0, `${where}: estadísticas negativas`);
  }
  const relic = relicOf(s);
  if (relic?.carrier) assert.ok(s.pieces.some((p) => p.unit === relic.carrier), `${where}: la reliquia la lleva una unidad sin miniaturas`);
  if (s.pendingCharge) assert.ok(s.phase === "carga", `${where}: carga pendiente fuera de la fase de carga`);
}

export function stressGame(seed: number) {
  const pick = <T,>(xs: readonly T[], k: number) => xs[(seed * 7 + k * 13) % xs.length];
  const mission = pick(MISSIONS, 1), cond = pick(CONDS, 2), lvA = pick(LEVELS, 3), lvB = pick(LEVELS, 5);
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setTerrain", pieces: randomMap(seed * 31 + 7) });
  bus.dispatch({ type: "setArmies", legion: randomList("legion", seed * 2 + 1), swarm: randomList("swarm", seed * 2 + 2), mission, ...(cond ? { conditions: cond } : {}) });
  bus.dispatch({ type: "setRulesMode", on: true });
  const where = () => `semilla ${seed} (${mission}${cond ? ", " + cond : ""}) ronda ${bus.state.turn} ${bus.state.phase} J${bus.state.active}`;
  deepInvariants(bus.state, where());
  let g = 0;
  while (!bus.state.gameOver && g++ < 200) {
    if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
    aiPlayPhase(bus, bus.state.active === 0 ? lvA : lvB);
    deepInvariants(bus.state, where());
  }
  assert.ok(bus.state.gameOver, `${where()}: no acaba`);
  // Guardar y cargar, y repetir desde el principio, dan la misma mesa
  const h = stateHash(bus.state);
  assert.equal(stateHash(CommandBus.restore(bus.serialize()).state), h, `${where()}: guardar y cargar cambia la mesa`);
  const end = bus.length;
  bus.seek(0); bus.seek(end);
  assert.equal(stateHash(bus.state), h, `${where()}: repetir cambia la mesa`);
  return bus;
}

test("prueba de resistencia: partidas IA contra IA con listas, misiones y condiciones al azar", () => {
  for (let seed = 1; seed <= 24; seed++) stressGame(seed);
});

test("Oleada sin fin con unidades en reserva: los ids nuevos no chocan con los de la reserva", () => {
  for (let seed = 120; seed <= 160; seed += 36) stressGame(seed);
});
