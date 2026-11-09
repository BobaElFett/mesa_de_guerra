import type { NetMsg } from "./protocol";

// Transportes (#41): la misma interfaz para las tres maneras de conectar.
//  - LocalTransport: dos pestañas del mismo navegador (BroadcastChannel), sin red.
//  - RtcTransport: WebRTC con un canal de datos; la oferta y la respuesta se copian y pegan
//    (no hace falta ningún servidor nuestro; STUN público para atravesar el router).
//  - Peer (en peer.ts): WebRTC con el servidor gratuito de PeerJS y un código de sala.
// Los mensajes van en JSON; los grandes (la partida entera) se trocean.

export interface Transport {
  readonly kind: "local" | "manual" | "peer";
  readonly isOpen: boolean;
  send(m: NetMsg): void;
  close(): void;
  onMessage: (m: NetMsg) => void;
  onOpen: () => void;
  onClose: () => void;
}

const CHUNK = 12000;

interface Chunk { t: "chunk"; id: string; i: number; n: number; d: string }

/** Base: trocea al enviar y recompone al recibir. */
export abstract class ChunkedTransport implements Transport {
  abstract readonly kind: Transport["kind"];
  abstract readonly isOpen: boolean;
  onMessage: (m: NetMsg) => void = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  private parts = new Map<string, string[]>();
  private nextId = 0;

  protected abstract raw(text: string): void;
  abstract close(): void;

  send(m: NetMsg) {
    const text = JSON.stringify(m);
    if (text.length <= CHUNK) { this.raw(text); return; }
    const id = `${Date.now().toString(36)}-${this.nextId++}`;
    const n = Math.ceil(text.length / CHUNK);
    for (let i = 0; i < n; i++) this.raw(JSON.stringify({ t: "chunk", id, i, n, d: text.slice(i * CHUNK, (i + 1) * CHUNK) } satisfies Chunk));
  }

  protected received(text: string) {
    let m: NetMsg | Chunk;
    try { m = JSON.parse(text); } catch { return; }
    if (m.t !== "chunk") { this.onMessage(m); return; }
    const c = m as Chunk;
    const arr = this.parts.get(c.id) ?? new Array(c.n).fill("");
    arr[c.i] = c.d;
    this.parts.set(c.id, arr);
    if (arr.every((x) => x !== "")) {
      this.parts.delete(c.id);
      this.received(arr.join(""));
    }
  }
}

/** Dos pestañas del mismo navegador. */
export class LocalTransport extends ChunkedTransport {
  readonly kind = "local";
  private ch: BroadcastChannel;
  private open = true;
  constructor(code: string, private role: "host" | "guest") {
    super();
    this.ch = new BroadcastChannel(`mesa-de-guerra-${code.toUpperCase()}`);
    this.ch.onmessage = (e) => {
      const d = e.data as { from: string; text: string };
      if (d && d.from !== this.role) this.received(d.text);
    };
  }
  get isOpen() { return this.open; }
  protected raw(text: string) { this.ch.postMessage({ from: this.role, text }); }
  close() { this.open = false; this.ch.close(); this.onClose(); }
}

/** Sobre un RTCDataChannel (manual o PeerJS por debajo usa lo mismo). */
export class DataChannelTransport extends ChunkedTransport {
  constructor(readonly kind: "manual" | "peer", private dc: RTCDataChannel, private pc?: RTCPeerConnection) {
    super();
    dc.onopen = () => this.onOpen();
    dc.onclose = () => this.onClose();
    dc.onmessage = (e) => this.received(String(e.data));
  }
  get isOpen() { return this.dc.readyState === "open"; }
  protected raw(text: string) { this.dc.send(text); }
  close() { try { this.dc.close(); this.pc?.close(); } catch { /* nada */ } }
}

// --- Conexión manual (copiar y pegar) --------------------------------------------

const ICE: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }] };

function gathered(pc: RTCPeerConnection, ms = 4000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((ok) => {
    const done = () => { pc.removeEventListener("icegatheringstatechange", check); ok(); };
    const check = () => { if (pc.iceGatheringState === "complete") done(); };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, ms);   // sin STUN (o tarda): vale con lo que haya
  });
}

async function pack(d: RTCSessionDescription | null): Promise<string> {
  const json = JSON.stringify({ t: d!.type, s: d!.sdp });
  try {
    const cs = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const buf = new Uint8Array(await new Response(cs).arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    return "MDG1." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return "MDG0." + btoa(unescape(encodeURIComponent(json)));
  }
}

async function unpack(code: string): Promise<RTCSessionDescriptionInit> {
  const c = code.trim().replace(/\s+/g, "");
  let json: string;
  if (c.startsWith("MDG1.")) {
    const b64 = c.slice(5).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    json = await new Response(ds).text();
  } else if (c.startsWith("MDG0.")) json = decodeURIComponent(escape(atob(c.slice(5))));
  else throw new Error("Ese texto no es un código de Mesa de Guerra.");
  const d = JSON.parse(json) as { t: RTCSdpType; s: string };
  return { type: d.t, sdp: d.s };
}

/** Anfitrión, conexión manual: crea la oferta y espera la respuesta del invitado. */
export async function manualHost(): Promise<{ offer: string; accept: (answer: string) => Promise<void>; transport: DataChannelTransport }> {
  const pc = new RTCPeerConnection(ICE);
  const dc = pc.createDataChannel("mesa", { ordered: true });
  const transport = new DataChannelTransport("manual", dc, pc);
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  return {
    offer: await pack(pc.localDescription),
    accept: async (answer) => { await pc.setRemoteDescription(await unpack(answer)); },
    transport,
  };
}

/** Invitado, conexión manual: con la oferta del anfitrión, crea la respuesta. */
export async function manualGuest(offer: string): Promise<{ answer: string; transport: Promise<DataChannelTransport> }> {
  const pc = new RTCPeerConnection(ICE);
  const transport = new Promise<DataChannelTransport>((ok) => {
    pc.ondatachannel = (e) => ok(new DataChannelTransport("manual", e.channel, pc));
  });
  await pc.setRemoteDescription(await unpack(offer));
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { answer: await pack(pc.localDescription), transport };
}
