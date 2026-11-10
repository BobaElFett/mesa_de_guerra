import { test } from "node:test";
import assert from "node:assert/strict";
import { ACHIEVEMENTS } from "../src/ui/achievements";
import type { GameRecord } from "../src/ui/record";

const rec = (o: Partial<GameRecord>): GameRecord => ({ at: "", side: "legion", level: "normal", mission: "tomar", result: "victoria", vp: [20, 10], rounds: 5, ...o });
const has = (ids: string[], id: string) => ids.includes(id);

test("logros: cada uno sale cuando toca", () => {
  const got = (records: GameRecord[], extra: Partial<Parameters<(typeof ACHIEVEMENTS)[0]["check"]>[0]> = {}) =>
    ACHIEVEMENTS.filter((a) => a.check({ records, stars: {}, campaignWon: false, ...extra })).map((a) => a.id);
  assert.deepEqual(got([]), []);
  assert.deepEqual(got([rec({ result: "derrota" })]), []);
  const a = got([rec({}), rec({ side: "swarm", level: "dificil", conditions: "noche", mission: "reliquia", vp: [35, 10] })]);
  for (const id of ["primera", "dificil", "ambos", "noche", "reliquia", "aplastante"]) assert.ok(has(a, id), id);
  assert.ok(has(got(Array.from({ length: 10 }, () => rec({ result: "derrota" }))), "curtido"));
  assert.ok(has(got([], { stars: { a: 3 } }), "estrella"));
  assert.ok(has(got([], { stars: { a: 3, b: 3, c: 3, d: 3, e: 3 } }), "maestro"));
  assert.ok(has(got([], { campaignWon: true }), "campana"));
});
