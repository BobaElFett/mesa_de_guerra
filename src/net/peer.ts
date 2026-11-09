import { DataConnection, Peer } from "peerjs";
import { ChunkedTransport } from "./transport";

// Conexión por código de sala (#41): WebRTC con el servidor gratuito de PeerJS para
// encontrarse (solo el saludo pasa por él; la partida va directa entre los dos navegadores).

const PREFIX = "mesa-de-guerra-v1-";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sin 0/O ni 1/I

export function newRoomCode(): string {
  let c = "";
  for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return c;
}

export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export class PeerTransport extends ChunkedTransport {
  readonly kind = "peer";
  constructor(private conn: DataConnection) {
    super();
    conn.on("open", () => this.onOpen());
    conn.on("data", (d) => this.received(typeof d === "string" ? d : JSON.stringify(d)));
    conn.on("close", () => this.onClose());
    conn.on("error", () => this.onClose());
  }
  get isOpen() { return this.conn.open; }
  protected raw(text: string) { this.conn.send(text); }
  close() { try { this.conn.close(); } catch { /* nada */ } }
}

const ERRORS: Record<string, string> = {
  "unavailable-id": "Ese código de sala ya está en uso.",
  "peer-unavailable": "No hay ninguna sala con ese código (¿la ha cerrado el anfitrión?).",
  network: "No se puede llegar al servidor de salas. Prueba la conexión manual.",
  "server-error": "El servidor de salas no responde. Prueba la conexión manual.",
  "socket-error": "Se ha cortado la conexión con el servidor de salas.",
  "browser-incompatible": "Este navegador no permite WebRTC.",
};
export const peerError = (e: { type?: string; message?: string }) => ERRORS[e.type ?? ""] ?? `Error de conexión: ${e.message ?? e.type ?? "desconocido"}`;

/** Anfitrión: abre la sala y avisa de cada invitado que se conecte. */
export function hostRoom(code: string, onGuest: (t: PeerTransport) => void, onError: (msg: string) => void, onReady: () => void): () => void {
  const peer = new Peer(PREFIX + code, { debug: 0 });
  peer.on("open", () => onReady());
  peer.on("connection", (conn) => onGuest(new PeerTransport(conn)));
  peer.on("error", (e) => onError(peerError(e)));
  return () => { try { peer.destroy(); } catch { /* nada */ } };
}

/** Invitado: se conecta a la sala del código. */
export function joinRoom(code: string, onError: (msg: string) => void): { transport: Promise<PeerTransport>; close: () => void } {
  const peer = new Peer({ debug: 0 });
  const transport = new Promise<PeerTransport>((ok) => {
    peer.on("open", () => ok(new PeerTransport(peer.connect(PREFIX + code, { reliable: true, serialization: "raw" }))));
  });
  peer.on("error", (e) => onError(peerError(e)));
  return { transport, close: () => { try { peer.destroy(); } catch { /* nada */ } } };
}
