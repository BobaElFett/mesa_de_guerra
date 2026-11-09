import type { BusOp, CommandBus } from "../core/commands";
import type { Faction } from "../core/state";
import type { ArmyList } from "../rules/armies";
import type { MissionId } from "../rules/missions";
import { NetMsg, permission, PROTOCOL, Role, stateHash } from "./protocol";
import type { Transport } from "./transport";

// Una sesión en línea (#40, #42, #43). El anfitrión aplica todo y lo reenvía; el invitado
// pide y aplica lo que le llega, en orden, comprobando la huella del estado.

export const other = (f: Faction): Faction => (f === "legion" ? "swarm" : "legion");

const PING_MS = 3000;
const SILENT_MS = 10000;

export type NetStatus = "esperando" | "conectando" | "conectado" | "desconectado";

export class NetSession {
  /** Bando de este jugador. */
  side: Faction;
  status: NetStatus = "esperando";
  opponent = "";
  rtt = 0;
  /** Operaciones aplicadas (numeradas por el anfitrión). */
  seq = 0;
  /** Veces que el invitado ha tenido que pedir la partida entera. */
  resyncs = 0;
  /** Quién hizo cada orden del registro (solo el anfitrión lo lleva). */
  private issuers: Role[] = [];
  private transport: Transport | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  /** Ya se han saludado (el invitado tiene la partida). */
  private joined = false;

  onStatus: () => void = () => {};
  onChat: (text: string, by: Role) => void = () => {};
  onReject: (reason: string) => void = () => {};
  onList: (faction: Faction, list: ArmyList) => void = () => {};
  onSetup: (mission: MissionId) => void = () => {};
  /** Tras recibir la partida entera (al entrar o al resincronizar). */
  onSnapshot: () => void = () => {};

  constructor(private bus: CommandBus, readonly role: Role, side: Faction, readonly name: string) {
    this.side = side;
    if (role === "host") this.issuers = new Array(this.bus.serialize().log.length).fill("host");
    bus.remote = (op) => {
      if (this.role === "host") this.hostApply(op, "host");
      else if (this.status === "conectado") this.send({ t: "req", op });
      else this.onReject("Sin conexión con el anfitrión.");
      return true;
    };
  }

  get connected() { return this.status === "conectado"; }

  /** Engancha un transporte ya abierto (o que se abrirá). El invitado saluda al abrirse. */
  attach(t: Transport) {
    this.transport?.close();
    this.transport = t;
    this.status = "conectando";
    t.onMessage = (m) => this.receive(m);
    t.onOpen = () => {
      this.lastHeard = Date.now();
      if (this.role === "guest") this.send({ t: "hello", v: PROTOCOL, name: this.name });
      this.onStatus();
    };
    t.onClose = () => {
      if (this.transport !== t) return;
      if (this.role === "guest") this.joined = false;
      this.status = "desconectado";
      this.onStatus();
    };
    if (t.isOpen) t.onOpen();
    this.startPing();
    this.onStatus();
  }

  leave() {
    try { this.send({ t: "bye" }); } catch { /* nada */ }
    this.transport?.close();
    this.transport = null;
    if (this.timer) clearInterval(this.timer);
    this.bus.remote = null;
    this.status = "desconectado";
    this.onStatus();
  }

  sendChat(text: string) {
    if (!text.trim()) return;
    this.send({ t: "chat", text: text.slice(0, 400), by: this.role });
    this.onChat(text.slice(0, 400), this.role);
  }

  /** El invitado manda su lista de ejército al anfitrión. */
  sendList(list: ArmyList) { this.send({ t: "list", faction: this.side, list }); }
  /** El anfitrión avisa de la misión elegida (informativo). */
  sendSetup(mission: MissionId) { this.send({ t: "setup", mission }); }

  private send(m: NetMsg) {
    if (this.transport?.isOpen) this.transport.send(m);
  }

  private startPing() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.transport?.isOpen) return;
      // El invitado insiste en saludar hasta que el anfitrión conteste (otra pestaña que aún no escuchaba)
      if (this.role === "guest" && !this.joined) this.send({ t: "hello", v: PROTOCOL, name: this.name });
      this.send({ t: "ping", at: Date.now() });
      if (this.status === "conectado" && Date.now() - this.lastHeard > SILENT_MS) { this.status = "desconectado"; this.onStatus(); }
    }, PING_MS);
    (this.timer as unknown as { unref?: () => void }).unref?.();   // en Node (pruebas) no retiene el proceso
  }

  // --- Anfitrión ---------------------------------------------------------------

  private hostApply(op: BusOp, by: Role) {
    const s = this.bus.state;
    const side = by === "host" ? this.side : other(this.side);
    const at = this.bus.length;
    const why = permission(s, op, by, side, this.issuers[at - 1] ?? null, this.issuers[at] ?? null);
    if (why) {
      if (by === "host") this.onReject(why);
      else this.send({ t: "reject", reason: why });
      return;
    }
    if (op.k === "cmd") { this.issuers.length = at; this.issuers.push(by); }
    if (op.k === "reset") this.issuers = [];
    if (op.k === "load") this.issuers = new Array(op.saved.log.length).fill("host");
    this.bus.apply(op);
    this.seq++;
    this.send({ t: "op", seq: this.seq, op, by, hash: stateHash(this.bus.state) });
  }

  private welcome() {
    this.send({ t: "welcome", v: PROTOCOL, name: this.name, hostSide: this.side, snapshot: this.bus.serialize(), issuers: this.issuers.slice(), seq: this.seq });
  }

  // --- Mensajes ----------------------------------------------------------------

  private receive(m: NetMsg) {
    this.lastHeard = Date.now();
    switch (m.t) {
      case "hello":
        if (this.role !== "host") return;
        if (m.v !== PROTOCOL) { this.send({ t: "reject", reason: "Versión distinta del juego: actualizad los dos." }); return; }
        this.opponent = m.name;
        this.status = "conectado";
        this.joined = true;
        this.welcome();
        this.onStatus();
        return;
      case "welcome":
        if (this.role !== "guest") return;
        if (m.v !== PROTOCOL) { this.onReject("Versión distinta del juego: actualizad los dos."); return; }
        this.opponent = m.name;
        this.side = other(m.hostSide);
        this.bus.apply({ k: "load", saved: m.snapshot });
        this.seq = m.seq;
        this.status = "conectado";
        this.joined = true;
        this.onSnapshot();
        this.onStatus();
        return;
      case "req":
        if (this.role === "host" && this.status === "conectado") this.hostApply(m.op, "guest");
        return;
      case "op":
        if (this.role !== "guest") return;
        if (m.seq !== this.seq + 1) { this.resync(); return; }
        this.bus.apply(m.op);
        this.seq = m.seq;
        if (stateHash(this.bus.state) !== m.hash) this.resync();
        return;
      case "sync":
        if (this.role === "host") this.welcome();
        return;
      case "reject": this.onReject(m.reason); return;
      case "chat": this.onChat(m.text, m.by); return;
      case "list": if (this.role === "host") this.onList(m.faction, m.list); return;
      case "setup": if (this.role === "guest") this.onSetup(m.mission); return;
      case "ping": this.send({ t: "pong", at: m.at }); return;
      case "pong":
        this.rtt = Date.now() - m.at;
        if (this.status === "desconectado" && this.transport?.isOpen && this.joined) this.status = "conectado";
        this.onStatus();
        return;
      case "bye":
        this.status = "desconectado";
        this.onStatus();
        return;
    }
  }

  private resync() {
    this.resyncs++;
    this.send({ t: "sync" });
  }
}
