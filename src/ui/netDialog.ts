import type { CommandBus } from "../core/commands";
import { Faction, FACTIONS } from "../core/state";
import { NetSession, other } from "../net/session";
import { LocalTransport, manualGuest, manualHost, Transport } from "../net/transport";
import { hostRoom, joinRoom, newRoomCode, normalizeCode } from "../net/peer";
import { modal } from "./modal";

// Diálogo «En línea» (#42): crear una sala o unirse, por código (internet), a mano (copiar y
// pegar) o entre dos pestañas; estado de la conexión y salir. El chat va aparte (#44).

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const NAME_KEY = "mesa-de-guerra.nombre";

export type Method = "peer" | "manual" | "local";

const METHOD_TEXT: Record<Method, string> = {
  peer: "Por internet, con código de sala",
  manual: "Manual: copiar y pegar dos textos",
  local: "En este ordenador (otra pestaña)",
};

type View =
  | { v: "inicio"; error?: string }
  | { v: "esperando"; method: Method; code: string; error?: string }
  | { v: "oferta"; offer: string; error?: string }
  | { v: "respuesta"; answer: string }
  | { v: "uniendo"; method: Method; code: string; error?: string }
  | { v: "sala" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export class NetDialog {
  session: NetSession | null = null;
  private view: View = { v: "inicio" };
  private method: Method = "peer";
  private side: Faction = "legion";
  private cleanup: (() => void) | null = null;
  private acceptAnswer: ((a: string) => Promise<void>) | null = null;
  private room: { method: Method; code: string; role: "host" | "guest" } | null = null;
  private lastHtml = "";

  /** Se abre o se cierra una sesión (main ajusta permisos, IA, guardado…). */
  onSession: (s: NetSession | null) => void = () => {};

  constructor(private bus: CommandBus, private notify: (m: string) => void) {
    $("net-open").addEventListener("click", () => this.show());
    $("net-close").addEventListener("click", () => this.hide());
    $("net-backdrop").addEventListener("pointerdown", (e) => { if (e.target === $("net-backdrop")) this.hide(); });
    window.addEventListener("keydown", (e) => { if (e.code === "Escape" && !$("net-backdrop").hidden) this.hide(); });
    $("net-body").addEventListener("click", (e) => this.click(e));
    $("net-body").addEventListener("change", (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.id === "net-method") { this.method = t.value as Method; this.render(); }
      if (t.id === "net-side") this.side = t.value as Faction;
      if (t.id === "net-name") { try { localStorage.setItem(NAME_KEY, t.value.trim()); } catch { /* nada */ } }
    });
  }

  get name(): string {
    try { return localStorage.getItem(NAME_KEY) || "Jugador"; } catch { return "Jugador"; }
  }

  show() {
    $("net-backdrop").hidden = false;
    this.lastHtml = "";
    modal.open = true;
    this.render();
  }

  hide() {
    $("net-backdrop").hidden = true;
    modal.open = false;
  }

  /** Vuelve a pintar (p. ej. al cambiar el estado de la conexión). */
  refresh() { if (!$("net-backdrop").hidden) this.render(); }

  // --- Abrir y cerrar ------------------------------------------------------------

  private startSession(role: "host" | "guest", side: Faction) {
    this.session?.leave();
    const s = new NetSession(this.bus, role, side, this.name);
    this.session = s;
    this.onSession(s);
    return s;
  }

  leave() {
    this.cleanup?.();
    this.cleanup = null;
    this.session?.leave();
    this.session = null;
    this.room = null;
    this.acceptAnswer = null;
    this.view = { v: "inicio" };
    this.onSession(null);
    this.refresh();
  }

  private async createRoom() {
    const s = this.startSession("host", this.side);
    const attach = (t: Transport) => { s.attach(t); };
    if (this.method === "local") {
      const code = newRoomCode();
      attach(new LocalTransport(code, "host"));
      this.room = { method: "local", code, role: "host" };
      this.view = { v: "esperando", method: "local", code };
    } else if (this.method === "peer") {
      const code = newRoomCode();
      this.room = { method: "peer", code, role: "host" };
      this.view = { v: "esperando", method: "peer", code };
      this.cleanup = hostRoom(code, attach, (msg) => { this.view = { v: "esperando", method: "peer", code, error: msg }; this.refresh(); }, () => this.refresh());
    } else {
      this.view = { v: "oferta", offer: "Preparando…" };
      this.render();
      try {
        const h = await manualHost();
        attach(h.transport);
        this.acceptAnswer = h.accept;
        this.view = { v: "oferta", offer: h.offer };
        this.room = { method: "manual", code: "", role: "host" };
      } catch (e) {
        this.view = { v: "inicio", error: `No se pudo crear la oferta: ${(e as Error).message}` };
      }
    }
    this.render();
  }

  private async join(input: string) {
    if (this.method === "manual") {
      try {
        const s = this.startSession("guest", "swarm");
        const g = await manualGuest(input);
        this.view = { v: "respuesta", answer: g.answer };
        this.room = { method: "manual", code: "", role: "guest" };
        this.render();
        s.attach(await g.transport);
      } catch (e) {
        this.leave();
        this.view = { v: "inicio", error: (e as Error).message || "Ese texto no vale." };
        this.render();
      }
      return;
    }
    const code = normalizeCode(input);
    if (code.length < 4) { this.view = { v: "inicio", error: "Escribe el código de la sala." }; this.render(); return; }
    const s = this.startSession("guest", "swarm");
    this.room = { method: this.method, code, role: "guest" };
    this.view = { v: "uniendo", method: this.method, code };
    this.render();
    if (this.method === "local") s.attach(new LocalTransport(code, "guest"));
    else {
      const j = joinRoom(code, (msg) => { this.view = { v: "uniendo", method: "peer", code, error: msg }; this.refresh(); });
      this.cleanup = j.close;
      s.attach(await j.transport);
    }
  }

  /** El invitado vuelve a la misma sala tras un corte (código o pestaña). */
  private async reconnect() {
    if (!this.room || this.room.role !== "guest" || this.room.method === "manual" || !this.session) return;
    this.cleanup?.();
    if (this.room.method === "local") this.session.attach(new LocalTransport(this.room.code, "guest"));
    else {
      const j = joinRoom(this.room.code, (msg) => this.notify(msg));
      this.cleanup = j.close;
      this.session.attach(await j.transport);
    }
  }

  /** Cuando la sesión cambia de estado. */
  sessionChanged() {
    if (this.session?.connected && this.view.v !== "sala") {
      this.view = { v: "sala" };
      this.notify(`Conectado con ${this.session.opponent}. Llevas ${FACTIONS[this.session.side].of.replace(/^de la /, "la ").replace(/^del /, "el ")}.`);
    }
    this.refresh();
  }

  // --- Pintar --------------------------------------------------------------------

  private render() {
    const s = this.session;
    const v = this.view;
    const err = "error" in v && v.error ? `<div class="net-err">${esc(v.error)}</div>` : "";
    let html = "";
    if (v.v === "inicio") {
      const methodSel = (Object.keys(METHOD_TEXT) as Method[]).map((m) => `<option value="${m}"${m === this.method ? " selected" : ""}>${METHOD_TEXT[m]}</option>`).join("");
      const sideSel = (["legion", "swarm"] as Faction[]).map((f) => `<option value="${f}"${f === this.side ? " selected" : ""}>${FACTIONS[f].name}</option>`).join("");
      const joinField = this.method === "manual"
        ? `<label>Texto del anfitrión<textarea id="net-join-text" placeholder="Pega aquí el texto que te ha mandado (empieza por MDG1.)"></textarea></label>`
        : `<label>Código de la sala<input type="text" id="net-join-text" placeholder="p. ej. K7QXM" maxlength="12" style="text-transform:uppercase"></label>`;
      html = `<label>Tu nombre <input type="text" id="net-name" value="${esc(this.name)}" maxlength="24"></label>
        <label>Conexión <select id="net-method">${methodSel}</select></label>
        <div class="net-note">${this.method === "peer" ? "Un servidor gratuito (PeerJS) solo os presenta; la partida va directa entre los dos navegadores. Hace falta internet."
          : this.method === "manual" ? "Sin ningún servidor: el anfitrión manda un texto (por mensaje o correo), el invitado contesta con otro. Funciona en casi todas las redes de casa."
          : "Para probar o jugar en la misma pantalla: abre el juego en otra pestaña de este navegador y únete con el código."}</div>
        <div class="net-grid" style="margin-top:8px">
          <div class="net-box"><h3>Crear sala</h3>
            <label>Tu bando <select id="net-side">${sideSel}</select></label>
            <div class="net-note">La mesa actual pasa a ser la de la sala. Tú preparas la partida (misión, despliegue).</div>
            <div class="row end"><button data-act="create" class="primary">Crear sala</button></div></div>
          <div class="net-box"><h3>Unirse</h3>${joinField}
            <div class="net-note">Tu mesa se sustituye por la del anfitrión (guárdala antes en Mesas si la quieres).</div>
            <div class="row end"><button data-act="join" class="primary">Unirse</button></div></div>
        </div>${err}`;
    } else if (v.v === "esperando") {
      html = `<h3>Sala abierta · llevas ${FACTIONS[this.side].name}</h3>
        <div class="net-note">${v.method === "peer" ? "Pásale este código a tu rival: en En línea → Unirse, por internet." : "En otra pestaña de este navegador: En línea → En este ordenador → Unirse con este código."}</div>
        <div class="code">${v.code}</div>
        <div class="net-note" style="text-align:center">${s?.status === "desconectado" ? "Se cortó: esperando a que vuelva a entrar…" : "Esperando a tu rival…"}</div>${err}
        <div class="row end"><button data-act="leave">Cerrar la sala</button></div>`;
    } else if (v.v === "oferta") {
      html = `<h3>1. Manda este texto a tu rival</h3>
        <textarea readonly id="net-offer">${esc(v.offer)}</textarea>
        <div class="row end"><button data-act="copy" data-src="net-offer">Copiar</button></div>
        <h3>2. Pega aquí el texto que te conteste</h3>
        <textarea id="net-answer" placeholder="Empieza por MDG1."></textarea>${err}
        <div class="row end"><button data-act="leave">Cancelar</button><button data-act="accept" class="primary">Conectar</button></div>`;
    } else if (v.v === "respuesta") {
      html = `<h3>Manda este texto al anfitrión</h3>
        <textarea readonly id="net-answer-out">${esc(v.answer)}</textarea>
        <div class="row end"><button data-act="copy" data-src="net-answer-out">Copiar</button></div>
        <div class="net-note">En cuanto lo pegue, os conectáis solos.</div>
        <div class="row end"><button data-act="leave">Cancelar</button></div>`;
    } else if (v.v === "uniendo") {
      html = `<h3>Entrando en la sala ${v.code}…</h3>${err}<div class="row end"><button data-act="leave">Cancelar</button></div>`;
    } else if (s) {
      const on = s.connected;
      const mine = FACTIONS[s.side], theirs = FACTIONS[other(s.side)];
      html = `<h3>${on ? "Conectado" : "Sin conexión"} con <b>${esc(s.opponent || "tu rival")}</b></h3>
        <div>Tú llevas <b style="color:${mine.color}">${mine.name}</b>; tu rival, <b style="color:${theirs.color}">${theirs.name}</b>.
        ${s.role === "host" ? "Eres el anfitrión." : "Eres el invitado."}</div>
        <div class="net-note">${s.role === "host"
          ? "Siguiente: tu rival manda su lista desde Ejércitos; tú eliges la misión y pulsas Desplegar."
          : "Siguiente: abre Ejércitos, prepara tu lista y pulsa «Enviar mi lista a la sala». El anfitrión despliega."}
          En modo reglas cada uno solo mueve y da órdenes a su ejército, y solo deshace lo suyo.</div>
        ${s.resyncs ? `<div class="net-note">Resincronizaciones: ${s.resyncs}</div>` : ""}
        <div class="row end">${!on && this.room?.role === "guest" && this.room.method !== "manual" ? `<button data-act="reconnect">Reconectar</button>` : ""}
          <button data-act="armies">Ejércitos</button><button data-act="leave">Salir de la sala</button></div>`;
    }
    // Solo si cambia: así no se pierde lo que se está escribiendo ni el botón bajo el ratón
    if (html !== this.lastHtml) { $("net-body").innerHTML = html; this.lastHtml = html; }
  }

  private async click(e: Event) {
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!b) return;
    switch (b.dataset.act) {
      case "create": await this.createRoom(); break;
      case "join": await this.join(($("net-join-text") as HTMLInputElement).value); break;
      case "accept": {
        const a = ($("net-answer") as HTMLTextAreaElement).value;
        try { await this.acceptAnswer?.(a); } catch (er) { if (this.view.v === "oferta") this.view = { ...this.view, error: (er as Error).message || "Ese texto no vale." }; this.render(); }
        break;
      }
      case "copy": {
        const el = $(b.dataset.src!) as HTMLTextAreaElement;
        el.select();
        try { await navigator.clipboard.writeText(el.value); b.textContent = "Copiado"; } catch { document.execCommand("copy"); b.textContent = "Copiado"; }
        break;
      }
      case "leave": this.leave(); break;
      case "reconnect": await this.reconnect(); break;
      case "armies": this.hide(); $("armies-open").click(); break;
    }
  }
}
