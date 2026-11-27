import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { cloneState, GameState } from "../src/core/state";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { controller, controlledBy, determineControl, objectiveStatus } from "../src/rules/missions";
import { FD_CARDS, PRIMARIES, primaryEndBattle, primaryEndCommand, primaryEndTurn, primaryFor, primaryStartTurn, PRIMARY_CAP } from "../src/rules/primaries";
import { aiPlayPhase } from "../src/ai/tactics";

// Fase 34: control al acabar cada fase y cada turno; disposición de fuerzas y misiones primarias (11.ª)

function game(fd: ["tomar" | "purga", "tomar" | "purga"] = ["tomar", "tomar"], seed = 34) {
  const bus = new CommandBus(seed);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "disposicion", dispositions: fd });
  bus.dispatch({ type: "setRulesMode", on: true });
  return bus;
}
const obj = (s: GameState, name: RegExp) => s.objectives!.find((o) => name.test(o.name))!;
/** Pone una unidad entera encima de un objetivo. */
function park(s: GameState, unitId: string, x: number, z: number) {
  s.pieces.filter((p) => p.unit === unitId).forEach((p, i) => { p.x = x + (i % 5) * 1.2 - 2.4; p.z = z + Math.floor(i / 5) * 1.2; });
}
const unitOf = (s: GameState, ds: string, n = 0) => s.units.filter((u) => u.datasheet === ds)[n].id;
/** Saca de la mesa todo salvo lo que se quiera mirar. */
function clear(s: GameState, keep: string[]) { s.pieces = s.pieces.filter((p) => !p.unit || keep.includes(p.unit)); }

test("la matriz de disposiciones: con la misma, la misma misión; cada carta, en su orden", () => {
  assert.equal(primaryFor("tomar", "tomar"), "dominio");
  assert.equal(primaryFor("tomar", "purga"), "adquisicion");
  assert.equal(primaryFor("purga", "tomar"), "imparable");
  assert.equal(primaryFor("purga", "purga"), "castigo");
  assert.deepEqual(FD_CARDS.tomar, ["dominio", "inamovible", "adquisicion", "purgarAsegurar", "ineludible"]);
  const bus = game(["tomar", "purga"]);
  assert.deepEqual(bus.state.primaries, ["adquisicion", "imparable"]);
  assert.equal(obj(bus.state, /Casa Legión/).home, 0);
  assert.ok(bus.state.objectives!.some((o) => o.role === "central"));
});

test("el control se decide al acabar la fase y se mantiene hasta la siguiente comprobación", () => {
  const bus = game();
  const s = cloneState(bus.state);
  s.phase = "movimiento";
  const asl = unitOf(s, "asalto"), c = obj(s, /Centro|Flanco oeste/);
  clear(s, [asl]);
  assert.equal(controller(s, c), null);             // al empezar la batalla no es de nadie
  park(s, asl, c.x, c.z + 1);
  assert.equal(objectiveStatus(s, c).holder, 0);     // nivel de control ya, pero…
  assert.equal(controller(s, c), null);             // …no lo controla hasta acabar la fase
  determineControl(s);
  assert.equal(controller(s, c), 0);
  park(s, asl, 0, 20);                               // se va: lo sigue controlando hasta la próxima comprobación
  assert.equal(controller(s, c), 0);
  determineControl(s);
  assert.equal(controller(s, c), null);              // 0 contra 0: nadie (no estaba asegurado)
});

test("asegurado: sigue siendo suyo sin nadie cerca, hasta que el rival suma más al acabar una fase", () => {
  const bus = game();
  const s = cloneState(bus.state);
  const c = obj(s, /Flanco oeste/);
  const asl = unitOf(s, "asalto"), g = unitOf(s, "garras");
  clear(s, [asl, g]);
  park(s, asl, c.x, c.z + 1);
  determineControl(s);
  c.secured = 0;
  park(s, asl, 0, 20);
  determineControl(s);
  assert.equal(controller(s, c), 0);
  park(s, g, c.x, c.z - 1);
  determineControl(s);
  assert.equal(controller(s, c), 1);
  assert.equal(c.secured, undefined);
});

test("en una partida, nextPhase decide el control al acabar cada fase", () => {
  const bus = game();
  const s = bus.state;
  const asl = unitOf(s, "asalto"), c = obj(s, /Flanco oeste/);
  bus.dispatch({ type: "nextPhase" });                // despliegue → mando
  bus.dispatch({ type: "nextPhase" });                // → movimiento
  bus.dispatch({ type: "moveMany", moves: bus.state.pieces.filter((p) => p.unit === asl).map((p, i) => ({ id: p.id, x: c.x + (i % 5) * 1.2 - 2.4, z: c.z + 1 + Math.floor(i / 5) * 1.2 })) });
  assert.equal(controller(bus.state, bus.state.objectives!.find((o) => o.id === c.id)!), null);
  bus.dispatch({ type: "nextPhase" });
  if (bus.state.reaction) bus.dispatch({ type: "nextPhase" });
  assert.equal(controller(bus.state, bus.state.objectives!.find((o) => o.id === c.id)!), 0);
  assert.ok(controlledBy(bus.state, 0).some((o) => o.id === c.id));
});

/** Estado en el turno de la Legión, ronda r, con el control ya decidido tal como se ha colocado. */
function scene(fd: ["tomar" | "purga", "tomar" | "purga"], r: number, place: (s: GameState) => void) {
  const bus = game(fd);
  const s = cloneState(bus.state);
  s.phase = "mando"; s.turn = r; s.active = 0;
  primaryStartTurn(s);
  place(s);
  determineControl(s);
  return s;
}
const vpFrom = (s: GameState, from = 0) => (s.vpLog ?? []).slice(from).filter((v) => v.player === 0).reduce((n, v) => n + v.vp, 0);

test("Dominio del campo: 3 PV por objetivo y 2 más por cada otro si tienes la casa", () => {
  const s = scene(["tomar", "tomar"], 2, (t) => {
    clear(t, [unitOf(t, "asalto"), unitOf(t, "asalto", 1)]);
    const home = obj(t, /Casa Legión/), w = obj(t, /Flanco oeste/);
    park(t, unitOf(t, "asalto"), home.x, home.z);
    park(t, unitOf(t, "asalto", 1), w.x, w.z);
  });
  primaryEndCommand(s);
  assert.equal(vpFrom(s), 3 * 2 + 2);                // 2 objetivos · 3, y +2 por el flanco con la casa
});

test("tope de 15 PV por ronda en la primaria (no al acabar la batalla)", () => {
  const s = scene(["tomar", "tomar"], 2, (t) => {
    const ids = t.units.filter((u) => u.faction === "legion").map((u) => u.id);
    clear(t, ids);
    t.objectives!.forEach((o, i) => { if (ids[i % ids.length]) park(t, ids[i % ids.length], o.x, o.z); });
    for (const o of t.objectives!) o.secured = 0;
  });
  primaryEndCommand(s);
  primaryEndTurn(s);
  assert.ok(s.primaryState!.inRound[0] <= 15);
  assert.equal(s.primaryState!.total[0], 15);
});

test("Adquisición decidida: 2 PV por objetivo tomado este turno (no la casa)", () => {
  const s = scene(["tomar", "purga"], 1, () => { /* nadie en objetivos al empezar */ });
  s.phase = "combate";
  const asl = unitOf(s, "asalto"), w = obj(s, /Flanco oeste/);
  clear(s, [asl]);
  park(s, asl, w.x, w.z);
  determineControl(s);
  primaryEndTurn(s);
  assert.equal(vpFrom(s), 2);
});

test("Fuerza imparable y Picadora: bajas enemigas en este turno", () => {
  const bus = game(["purga", "tomar"]);
  const s = cloneState(bus.state);
  s.phase = "combate"; s.turn = 1; s.active = 0;
  primaryStartTurn(s);
  const g = unitOf(s, "garras");
  s.kills = [{ turn: 1, by: 0, unit: g, during: 0 }];
  primaryEndTurn(s);
  assert.equal(vpFrom(s), 3);
  assert.equal(PRIMARIES.picadora.turn!({ ...s, turn: 2 } as GameState, 0).reduce((n, x) => n + x.vp, 0), 0);   // en la ronda 2 no hay bajas de esa ronda
});

test("Castigo: condena al empezar el turno y da 5 PV si cae una condenada", () => {
  const bus = game(["purga", "purga"]);
  const s = cloneState(bus.state);
  s.phase = "mando"; s.turn = 2; s.active = 0;
  primaryStartTurn(s);
  const cond = s.primaryState!.condemned![0];
  assert.ok(cond.length >= 1 && cond.length <= 3);
  s.kills = [{ turn: 2, by: 0, unit: cond[0], during: 0 }];
  s.pieces = s.pieces.filter((p) => p.unit !== cond[0]);
  s.phase = "combate";
  primaryEndTurn(s);
  assert.ok((s.vpLog ?? []).some((v) => v.player === 0 && v.vp === 5 && /condenada/.test(v.why)));
});

test("Ineludible al acabar la batalla: 5 PV por la casa rival, fuera del tope por ronda", () => {
  const bus = game(["tomar", "tomar"]);
  const s = cloneState(bus.state);
  s.primaries = ["ineludible", "dominio"];
  s.turn = 5; s.active = 1; s.phase = "combate";
  const asl = unitOf(s, "asalto"), home = obj(s, /Casa Enjambre/);
  clear(s, [asl]);
  park(s, asl, home.x, home.z);
  determineControl(s);
  s.primaryState!.round = 5; s.primaryState!.inRound = [15, 0];
  primaryEndBattle(s);
  assert.equal(s.primaryState!.total[0], 5);
});

test("tope total de 45 PV de primaria", () => {
  const bus = game();
  const s = cloneState(bus.state);
  s.primaryState!.total = [44, 0];
  s.turn = 3; s.active = 0; s.phase = "mando";
  const asl = unitOf(s, "asalto"), w = obj(s, /Flanco oeste/);
  clear(s, [asl]);
  park(s, asl, w.x, w.z);
  determineControl(s);
  primaryEndCommand(s);
  assert.equal(s.primaryState!.total[0], PRIMARY_CAP);
});

test("una partida entera con disposiciones: la IA puntúa la primaria y acaba", () => {
  const bus = game(["tomar", "purga"], 9);
  let g = 0;
  while (!bus.state.gameOver && g++ < 300) aiPlayPhase(bus, "normal");
  assert.ok(bus.state.gameOver);
  const t = bus.state.primaryState!.total;
  assert.ok(t[0] + t[1] > 0, `primaria ${t}`);
  assert.ok(t[0] <= 45 && t[1] <= 45);
});
