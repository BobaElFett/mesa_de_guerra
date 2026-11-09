// Chat de la sala (#44): mensajes entre los dos jugadores y avisos de la partida.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export class ChatPanel {
  onSend: (text: string) => void = () => {};

  constructor() {
    $("chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>("chat-input");
      const t = input.value.trim();
      if (!t) return;
      this.onSend(t);
      input.value = "";
    });
    // Que las teclas del chat no muevan la cámara ni pasen de fase
    $("chat-input").addEventListener("keydown", (e) => e.stopPropagation());
    $("chat-fold").addEventListener("click", () => {
      const folded = $("chat").classList.toggle("folded");
      $("chat-fold").textContent = folded ? "Ver" : "Plegar";
    });
  }

  show(on: boolean) {
    $("chat").hidden = !on;
    if (!on) $("chat-log").innerHTML = "";
  }

  who(text: string) { $("chat-who").textContent = text; }

  add(who: string, text: string) { this.line(`<b>${esc(who)}:</b> ${esc(text)}`); }

  system(text: string) { this.line(esc(text), "sys"); }

  private line(html: string, cls = "") {
    const log = $("chat-log");
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.innerHTML = html;
    log.appendChild(d);
    while (log.children.length > 80) log.firstChild!.remove();
    log.scrollTop = log.scrollHeight;
  }
}
