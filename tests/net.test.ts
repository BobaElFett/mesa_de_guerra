import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandBus } from "../src/core/commands";
import { TEST_LEGION, TEST_SWARM } from "../src/rules/armies";
import { NetSession } from "../src/net/session";
import { ChunkedTransport } from "../src/net/transport";
import { NetMsg, stateHash } from "../src/net/protocol";
import { aiPlayPhase, aiReact } from "../src/ai/tactics";
import { PLAYERS } from "../src/core/state";

// Par de transportes en memoria, síncrono (el mensaje llega en el acto)
class Mem extends ChunkedTransport {
  readonly kind = "local";
  peer!: Mem;
  open = true;
  sent = 0;
  get isOpen() { return this.open; }
  protected raw(text: string) { this.sent++; if (this.peer.open) this.peer.received(text); }
  close() { this.open = false; this.onClose(); }
}
function pair() { const a = new Mem(), b = new Mem(); a.peer = b; b.peer = a; return [a, b]; }

function room(setup = true) {
  const hb = new CommandBus(42), gb = new CommandBus(7);
  const host = new NetSession(hb, "host", "legion", "Ana");
  const guest = new NetSession(gb, "guest", "swarm", "Beto");
  const rejects: string[] = [];
  guest.onReject = (r) => rejects.push(r);
  host.onReject = (r) => rejects.push("host: " + r);
  const [a, b] = pair();
  host.attach(a);
  guest.attach(b);
  if (setup) {
    hb.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM, mission: "tomar" });
    hb.dispatch({ type: "setRulesMode", on: true });
  }
  return { hb, gb, host, guest, rejects, a, b };
}

test("el invitado entra y recibe la partida entera", () => {
  const { hb, gb, host, guest } = room(false);
  assert.equal(host.status, "conectado");
  assert.equal(guest.status, "conectado");
  assert.equal(guest.side, "swarm");
  assert.equal(guest.opponent, "Ana");
  assert.equal(stateHash(gb.state), stateHash(hb.state));
  hb.dispatch({ type: "setArmies", legion: TEST_LEGION, swarm: TEST_SWARM });
  assert.equal(stateHash(gb.state), stateHash(hb.state));
});

test("permisos en modo reglas: cada uno lo suyo, preparar es del anfitrión", () => {
  const { hb, gb, rejects } = room();
  hb.dispatch({ type: "nextPhase" });                   // despliegue → mando
  const legPiece = gb.state.pieces.find((p) => p.faction === "legion")!;
  gb.dispatch({ type: "move", id: legPiece.id, x: 0, z: 0 });
  assert.match(rejects.at(-1)!, /rival/);
  gb.dispatch({ type: "setRulesMode", on: false });
  assert.match(rejects.at(-1)!, /anfitrión/);
  gb.dispatch({ type: "nextPhase" });
  assert.match(rejects.at(-1)!, /No es tu turno/);
  assert.equal(hb.state.phase, "mando");
  // El anfitrión sí avanza; el invitado lo ve
  hb.dispatch({ type: "nextPhase" });
  assert.equal(gb.state.phase, "movimiento");
  assert.equal(stateHash(gb.state), stateHash(hb.state));
});

test("deshacer: solo lo propio en modo reglas", () => {
  const { hb, gb, rejects } = room();
  const n = hb.length;
  gb.undo();                                             // lo último es del anfitrión
  assert.match(rejects.at(-1)!, /deshacer lo tuyo/);
  assert.equal(hb.length, n);
  hb.undo();
  assert.equal(hb.length, n - 1);
  assert.equal(gb.length, n - 1);
});

test("partida entera: la Legión en un navegador, el Enjambre en otro, acaban igual", () => {
  const { hb, gb, guest } = room();
  let guard = 0;
  while (!hb.state.gameOver && guard++ < 400) {
    const s = hb.state;
    const busOf = (i: 0 | 1) => (i === 0 ? hb : gb);
    if (s.phase === "despliegue") { hb.dispatch({ type: "nextPhase" }); continue; }
    if (s.pendingCharge) { aiReact(busOf(s.pendingCharge.defender), "dificil"); continue; }
    if (s.phase === "combate") {
      // Cada navegador combate con lo suyo: el bot del activo hace la fase entera, los dos bandos;
      // aquí lo repartimos: el activo juega su fase y sus combates; los del otro se mandan desde el otro bus
      aiPlayPhaseSplit(hb, gb);
      continue;
    }
    aiPlayPhase(busOf(s.active), "dificil", "dificil", { humanDefends: true });
  }
  assert.ok(hb.state.gameOver);
  assert.equal(stateHash(gb.state), stateHash(hb.state));
  assert.equal(guest.resyncs, 0);
});

import { canFight, fightStep } from "../src/ai/tactics";
function aiPlayPhaseSplit(hb: CommandBus, gb: CommandBus) {
  const act = PLAYERS[hb.state.active];
  const busOf = (f: string) => (f === "legion" ? hb : gb);
  const opp = act === "legion" ? "swarm" : "legion";
  let side: "legion" | "swarm" = opp;
  for (let g = 0; g < 60; g++) {
    if (!canFight(hb.state, act) && !canFight(hb.state, opp)) break;
    if (!fightStep(busOf(side), side, "dificil")) fightStep(busOf(side === act ? opp : act), side === act ? opp : act, "dificil");
    side = side === act ? opp : act;
  }
  busOf(act).dispatch({ type: "nextPhase" });
}

test("si el invitado se desincroniza, pide la partida y se arregla solo", () => {
  const { hb, gb, guest } = room();
  gb.state.pieces[0] = { ...gb.state.pieces[0], x: gb.state.pieces[0].x + 5 };   // trampa: se tuerce su mesa
  assert.notEqual(stateHash(gb.state), stateHash(hb.state));
  hb.dispatch({ type: "roll", count: 2, sides: 6 });
  assert.equal(guest.resyncs, 1);
  assert.equal(stateHash(gb.state), stateHash(hb.state));
});

test("si se pierde un mensaje, el número de orden lo delata y se resincroniza", () => {
  const { hb, gb, guest, b } = room();
  b.open = false;                                         // el invitado no recibe esta
  hb.dispatch({ type: "roll", count: 1, sides: 6 });
  b.open = true;
  hb.dispatch({ type: "roll", count: 1, sides: 6 });
  assert.equal(guest.resyncs, 1);
  assert.equal(stateHash(gb.state), stateHash(hb.state));
});

test("los mensajes grandes se trocean y llegan enteros", () => {
  const [a, b] = pair();
  let got: NetMsg | null = null;
  b.onMessage = (m) => { got = m; };
  const text = "x".repeat(50000);
  a.send({ t: "chat", text, by: "host" });
  assert.ok(a.sent >= 5);
  assert.equal((got as unknown as { text: string }).text, text);
});

test("chat y lista del invitado", () => {
  const { host, guest } = room(false);
  const chat: string[] = [];
  host.onChat = (t, by) => chat.push(`${by}:${t}`);
  let list: unknown = null;
  host.onList = (f, l) => { list = { f, l }; };
  guest.sendChat("¡Hola!");
  guest.sendList(TEST_SWARM);
  assert.deepEqual(chat, ["guest:¡Hola!"]);
  assert.deepEqual(list, { f: "swarm", l: TEST_SWARM });
});
