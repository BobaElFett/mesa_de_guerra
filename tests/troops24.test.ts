import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { ArmyList, validateList } from "../src/rules/armies";
import { cloneState, GameState } from "../src/core/state";
import { shootingOptions, applyShoot } from "../src/rules/shooting";
import { applyCharge, applyFight } from "../src/rules/melee";
import { healLedSquads } from "../src/rules/special";
import { aiPlayPhase } from "../src/ai/tactics";
import { invariants } from "./fullgame.test";

const LEG: ArmyList = { units: [{ datasheet: "medico", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "saltadores", models: 5 }, { datasheet: "fuegoPesado", models: 5 }] };
const SWA: ArmyList = { units: [{ datasheet: "tirano", models: 1 }, { datasheet: "reventadores", models: 20 }, { datasheet: "biomorteros", models: 2 }, { datasheet: "garras", models: 10 }] };

function game(seed = 2, clear = true) {
  const bus = new CommandBus(seed);
  if (clear) for (const t of bus.state.terrain.map((t) => t.id)) bus.dispatch({ type: "removeTerrain", ids: [t] });
  bus.dispatch({ type: "setArmies", legion: LEG, swarm: SWA, mission: "tomar" });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}
const uid = (s: GameState, ds: string) => s.units.find((u) => u.datasheet === ds)!.id;
/** Pone la unidad `unit` en fila frente a (x, z). */
function place(s: GameState, unit: string, x: number, z: number) {
  s.pieces.filter((p) => p.unit === unit).forEach((p, i) => { p.x = x + (i % 10) * 1.3 - 6; p.z = z + Math.floor(i / 10) * 1.3; });
}

test("las listas con las cuatro tropas nuevas son válidas", () => {
  assert.deepEqual(validateList(LEG, "legion"), []);
  assert.deepEqual(validateList(SWA, "swarm"), []);
});

test("Sanador: al empezar el mando vuelve una miniatura de la escuadra que lidera", () => {
  const bus = game();
  bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const sq = uid(s, "asalto");
  const victims = s.pieces.filter((p) => p.unit === sq && !p.leader).slice(0, 3).map((p) => p.id);
  s.pieces = s.pieces.filter((p) => !victims.includes(p.id));
  healLedSquads(s);
  assert.equal(s.pieces.filter((p) => p.unit === sq).length, 8);
  healLedSquads(s);
  assert.equal(s.pieces.filter((p) => p.unit === sq).length, 9);
  // Ids únicos
  assert.equal(new Set(s.pieces.map((p) => p.id)).size, s.pieces.length);
  // Al completo no añade más
  healLedSquads(s); healLedSquads(s);
  assert.equal(s.pieces.filter((p) => p.unit === sq).length, 10);
});

test("Impacto: tras cargar, los Saltadores hacen dados de heridas mortales", () => {
  const bus = game();
  bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const j = uid(s, "saltadores"), g = uid(s, "garras");
  place(s, j, 0, 4); place(s, g, 0, -2);
  s.phase = "carga";
  let found = false;
  for (let k = 0; k < 20 && !found; k++) {
    const t = cloneState(s);
    t.rng = (k * 7919 + 13) as never;
    const before = t.combatLog.length;
    const rec = applyCharge(t, j, g);
    if (rec?.success) {
      const imp = t.combatLog.slice(before).find((e) => e.weapon === "aterrizaje");
      assert.ok(imp, "hay entrada de Aterrizaje");
      assert.equal(imp!.result.attacks, 5);
      assert.ok(imp!.mortal);
      found = true;
    }
  }
  assert.ok(found, "alguna carga llega");
});

test("Estallido: los Reventadores que caen en combate hieren a quien los mata", () => {
  const bus = game();
  bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const sq = uid(s, "asalto"), r = uid(s, "reventadores");
  // Separa al médico de la formación para que no estorbe: combate solo la escuadra
  place(s, sq, 0, 1.2); place(s, r, 0, 0);
  s.pieces.filter((p) => p.unit === uid(s, "medico")).forEach((p) => { p.x = 20; p.z = 20; });
  s.phase = "combate"; s.turnLog.fought = [];
  const out = applyFight(s, sq, r);
  assert.ok(out);
  const bursts = s.combatLog.filter((e) => e.weapon === "estallidoBio");
  const killed = out!.reduce((n, e) => n + e.result.slain.length, 0);
  assert.ok(killed > 0);
  assert.ok(bursts.every((b) => b.target === sq && b.mortal));
  assert.equal(bursts.reduce((n, b) => n + b.attackers, 0), killed);
});

test("Indirecto: los Biomorteros disparan sin ver, con −1 y el objetivo en cobertura", () => {
  const bus = game(3, true);
  // Un búnker entre medias
  bus.dispatch({ type: "addTerrain", kind: "ruinaGrande", x: 0, z: 0, rot: 0 } as never);
  // Turno del Enjambre, fase de disparo
  while (!(bus.state.active === 1 && bus.state.phase === "disparo")) bus.dispatch({ type: "nextPhase" });
  const s = cloneState(bus.state);
  const m = uid(s, "biomorteros"), a = uid(s, "fuegoPesado");
  s.pieces.filter((p) => p.unit === m).forEach((p, i) => { p.x = -1.1 + i * 2.2; p.z = -6; });
  s.pieces.filter((p) => p.unit !== m && p.faction === "legion").forEach((p, i) => { p.x = -22 + (i % 8) * 1.4; p.z = 18 + Math.floor(i / 8) * 1.4; });
  s.pieces.filter((p) => p.unit === a).forEach((p, i) => { p.x = -1.3 + (i % 3) * 1.3; p.z = 6 + Math.floor(i / 3) * 1.3; });
  const w = shootingOptions(s, m).weapons.find((x) => x.weapon.id === "morteroBio")!;
  const t = w.targets.find((x) => x.unit === a)!;
  assert.equal(t.blocked, undefined, String(t.blocked));
  assert.ok(t.indirect && t.cover);
  const e = applyShoot(s, m, "morteroBio", a);
  assert.ok(e && e.cover);
});

test("partidas enteras con las cuatro tropas nuevas", () => {
  for (const seed of [1, 2, 3]) {
    const bus = game(seed, false);
    let g = 0;
    while (!bus.state.gameOver && g++ < 300) {
      if (bus.state.phase === "despliegue") { bus.dispatch({ type: "nextPhase" }); continue; }
      aiPlayPhase(bus, "dificil");
      invariants(bus.state, `tropas24 ${seed}`);
    }
    assert.ok(bus.state.gameOver);
  }
});
