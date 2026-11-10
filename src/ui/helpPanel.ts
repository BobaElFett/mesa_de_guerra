import { modal } from "./modal";

// Panel de ayuda (#81) y hoja de atajos (#76).

/** Ayuda ordenada: secciones plegables y buscador. */
export function setupHelpSearch() {
  const search = document.getElementById("help-search") as HTMLInputElement;
  const secs = [...document.querySelectorAll<HTMLDetailsElement>("#help details.hsec")];
  const wasOpen = secs.map((d) => d.open);
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  search.addEventListener("input", () => {
    const q = norm(search.value.trim());
    let any = false;
    secs.forEach((d, i) => {
      const items = [...d.querySelectorAll("li")];
      let hits = 0;
      for (const li of items) {
        const ok = !q || q.split(/\s+/).every((w) => norm(li.textContent ?? "").includes(w));
        (li as HTMLElement).hidden = !ok;
        li.classList.toggle("hit", !!q && ok);
        if (ok) hits++;
      }
      d.hidden = !!q && !hits;
      d.open = q ? hits > 0 : wasOpen[i];
      if (hits) any = true;
    });
    document.getElementById("help-none")!.hidden = !q || any;
  });
  search.addEventListener("keydown", (e) => { if (e.code === "Escape") { search.value = ""; search.dispatchEvent(new Event("input")); search.blur(); } e.stopPropagation(); });
  for (const [i, d] of secs.entries()) d.addEventListener("toggle", () => { if (!search.value) wasOpen[i] = d.open; });
}

/** Hoja de atajos: la tecla ? la abre y la cierra. */
export function setupKeysSheet() {
  const keysBox = document.getElementById("keys-backdrop")!;
  const toggleKeys = (on = keysBox.hidden) => { keysBox.hidden = !on; modal.open = on; };
  keysBox.addEventListener("click", (e) => { if (e.target === keysBox || (e.target as HTMLElement).closest("button[data-k=close]")) toggleKeys(false); });
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
    if (e.key === "?") { e.preventDefault(); toggleKeys(); }
    else if (e.code === "Escape" && !keysBox.hidden) toggleKeys(false);
  });
}
