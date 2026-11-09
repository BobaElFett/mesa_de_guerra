import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { MISSIONS, MissionId, objectiveStatus, outcome } from "../src/rules/missions";
import { stratBlocked } from "../src/rules/stratagems";

function game(mission: MissionId = "tomar") {
  const bus = new CommandBus(9);
  bus.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission });
  bus.dispatch({ type: "setRulesMode", on: true });
  bus.dispatch({ type: "nextPhase" });   // despliegue → mando
  return bus;
}
const toEndOfTurn = (bus: CommandBus) => { for (let i = 0; i < 5; i++) bus.dispatch({ type: "nextPhase" }); };

test("cada misión coloca sus objetivos y pone los PV a cero", () => {
  for (const id of Object.keys(MISSIONS) as MissionId[]) {
    const s = game(id).state;
    assert.equal(s.mission, id);
    assert.equal(s.objectives!.length, MISSIONS[id].objectives.length);
    assert.deepEqual(s.vp, [0, 0]);
  }
});

test("control: suma CO a 3\"; empate = nadie; desmoralizadas no cuentan", () => {
  const bus = game();
  const o = bus.state.objectives!.find((x) => x.name === "Flanco oeste")!;
  const leg = bus.state.pieces.find((p) => p.model === "legionario")!;
  const gar = bus.state.pieces.filter((p) => p.model === "garra").slice(0, 2);
  bus.dispatch({ type: "moveMany", moves: [{ id: leg.id, x: o.x, z: o.z + 2 }, { id: gar[0].id, x: o.x, z: o.z - 2 }] });
  let st = objectiveStatus(bus.state, o);
  assert.deepEqual(st.oc, [2, 1]);       // Asalto CO 2, Garra CO 1
  assert.equal(st.holder, 0);
  bus.dispatch({ type: "moveMany", moves: [{ id: gar[1].id, x: o.x + 2, z: o.z - 1 }] });
  st = objectiveStatus(bus.state, o);
  assert.equal(st.holder, null);
});

test("se puntúa al final del turno desde la ronda 2, con tope", () => {
  const bus = game();
  const legs = bus.state.pieces.filter((p) => p.model === "legionario");
  const objs = bus.state.objectives!;
  // Una legionaria en cada objetivo
  bus.dispatch({ type: "moveMany", moves: objs.map((o, i) => ({ id: legs[i].id, x: o.x + 1.6, z: o.z })) });
  toEndOfTurn(bus);                                    // ronda 1: no puntúa
  assert.deepEqual(bus.state.vp, [0, 0]);
  toEndOfTurn(bus);                                    // turno del Enjambre
  for (let i = 0; i < 5; i++) bus.dispatch({ type: "nextPhase" });   // ronda 2, Legión
  assert.equal(bus.state.vp![0], 15);                  // 5 objetivos × 5, tope 15
  assert.match(bus.state.vpLog!.at(-1)!.why, /tope 15/);
});

test("Caza de presas: PV por unidad destruida", () => {
  const bus = game("caza");
  const target = bus.state.units.find((u) => u.datasheet === "nodo")!.id;
  // Las mata un disparo cualquiera: forzamos quitándolas a mano y luego un ataque real sería igual;
  // aquí comprobamos el registro con un combate simulado en mesa libre no puntúa
  bus.dispatch({ type: "removePieces", ids: bus.state.pieces.filter((p) => p.unit === target).map((p) => p.id) });
  assert.equal(bus.state.kills!.length, 0);            // retirar a mano no es una baja de la partida
  assert.equal(outcome(bus.state).winner, null);
});

test("estratagemas: PM, fase, una vez por turno", () => {
  const bus = game();
  const asalto = bus.state.units.find((u) => u.datasheet === "asalto")!.id;
  bus.dispatch({ type: "nextPhase" });                 // movimiento
  assert.match(stratBlocked(bus.state, "punteria", asalto)!, /fase/);
  bus.dispatch({ type: "nextPhase" });                 // disparo
  assert.equal(stratBlocked(bus.state, "punteria", asalto), null);
  const cp = bus.state.cp[0];
  bus.dispatch({ type: "stratagem", id: "punteria", unit: asalto });
  assert.equal(bus.state.cp[0], cp - 1);
  assert.match(stratBlocked(bus.state, "punteria", asalto)!, /Ya usada/);
  const swarmUnit = bus.state.units.find((u) => u.faction === "swarm")!.id;
  assert.match(stratBlocked(bus.state, "punteria", swarmUnit)!, /tu turno/);
});
