import * as THREE from "three";
import { FACTIONS, Faction } from "../core/state";
import { DATASHEETS, Datasheet, DatasheetId, UNIT_ABILITY_TEXT, WEAPON_ABILITY_TEXT, WEAPONS } from "../rules/datasheets";
import { FACTION_LORE, UNIT_LORE } from "../rules/lore";
import { makeMiniature } from "../models/miniatures";
import { weaponLine } from "./hud";
import { modal } from "./modal";

// Códice (#91): todas las unidades, con su miniatura girando, perfil, armas, habilidades,
// equipo opcional y trasfondo.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Codex {
  private faction: Faction = "legion";
  private current: DatasheetId = "capitan";
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private model: THREE.Object3D | null = null;
  private raf = 0;

  constructor() {
    $("codex-backdrop").addEventListener("click", (e) => {
      if (e.target === $("codex-backdrop")) { this.hide(); return; }
      const b = (e.target as HTMLElement).closest("button[data-cx]") as HTMLButtonElement | null;
      if (!b) return;
      const v = b.dataset.cx!;
      if (v === "close") this.hide();
      else if (v === "legion" || v === "swarm") { this.faction = v; this.current = this.first(v); this.render(); }
      else { this.current = v as DatasheetId; this.render(); }
    });
    window.addEventListener("keydown", (e) => { if (e.code === "Escape" && this.open) this.hide(); });
    this.scene.add(new THREE.HemisphereLight("#dfe6f2", "#3a2e26", 1.2));
    const key = new THREE.DirectionalLight("#fff0d8", 2.4);
    key.position.set(3, 6, 4);
    this.scene.add(key);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.1, 40), new THREE.MeshStandardMaterial({ color: "#2a2c33", roughness: 0.9 }));
    disc.position.y = -0.05;
    this.scene.add(disc);
  }

  get open() { return !$("codex-backdrop").hidden; }

  private first(f: Faction): DatasheetId {
    return (Object.values(DATASHEETS).find((d) => d.faction === f)!.id) as DatasheetId;
  }

  /** Abre el Códice (en una unidad concreta, si se da). */
  show(unit?: DatasheetId) {
    if (unit && DATASHEETS[unit]) { this.current = unit; this.faction = DATASHEETS[unit].faction; }
    $("codex-backdrop").hidden = false;
    modal.open = true;
    this.render();
    const tick = () => {
      if (!this.open) return;
      if (this.model) this.model.rotation.y += 0.012;
      this.renderer?.render(this.scene, this.cam);
      this.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  hide() {
    $("codex-backdrop").hidden = true;
    modal.open = false;
    cancelAnimationFrame(this.raf);
  }

  private render() {
    const list = Object.values(DATASHEETS).filter((d) => d.faction === this.faction);
    const ds = DATASHEETS[this.current];
    $("codex").innerHTML = `
      <div class="cx-head"><h2>Códice</h2>
        <button data-cx="legion" class="${this.faction === "legion" ? "on" : ""}">${FACTIONS.legion.name}</button>
        <button data-cx="swarm" class="${this.faction === "swarm" ? "on" : ""}">${FACTIONS.swarm.name}</button>
        <button data-cx="close" style="margin-left:auto">Cerrar</button></div>
      <p class="cx-lore dim">${FACTION_LORE[this.faction]}</p>
      <div class="cx-body">
        <div class="cx-list">${list.map((d) => `<button data-cx="${d.id}" class="${d.id === this.current ? "on" : ""}">${d.name}${d.character ? ' <span class="dim">· personaje</span>' : ""}</button>`).join("")}</div>
        <div class="cx-view"><canvas id="codex-canvas" width="300" height="300"></canvas></div>
        <div class="cx-sheet">${this.sheet(ds)}</div>
      </div>`;
    const canvas = $<HTMLCanvasElement>("codex-canvas");
    this.renderer?.dispose();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(300, 300, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (this.model) this.scene.remove(this.model);
    this.model = makeMiniature(ds.model, 0, false);
    // Encuadre según el tamaño del modelo
    const box = new THREE.Box3().setFromObject(this.model), size = box.getSize(new THREE.Vector3());
    const h = Math.max(size.y, size.x * 0.9, 1);
    this.cam.position.set(0, h * 0.75, h * 2.6);
    this.cam.lookAt(0, h * 0.42, 0);
    this.cam.updateProjectionMatrix();
    this.scene.add(this.model);
  }

  private sheet(ds: Datasheet): string {
    const P = ds.profile;
    const stats = [["M", `${P.M}"`], ["R", P.T], ["Sv", `${P.Sv}+`], ...(P.Inv ? [["Inv", `${P.Inv}+`]] : []), ["H", P.W], ["L", `${P.Ld}+`], ["CO", P.OC]];
    const weapons = [...new Set([...ds.weapons, ...(ds.leaderWeapons ?? [])])].map((id) => WEAPONS[id]);
    const optW = (ds.options ?? []).map((o) => WEAPONS[o.with]).filter((w) => !weapons.includes(w));
    const row = (w: (typeof WEAPONS)[string], note = "") => `<tr><td><b>${w.name}</b>${note}</td><td class="dim">${weaponLine(w)}</td></tr>`;
    return `<h3 style="color:${FACTIONS[ds.faction].color}">${ds.name}</h3>
      <div class="dim">${ds.sizes.map((s) => `${s.models} miniatura${s.models > 1 ? "s" : ""}: ${s.points} pts`).join(" · ")}${ds.big ? " · grande (límite por ejército)" : ""}${ds.leads ? ` · lidera: ${ds.leads.map((l) => DATASHEETS[l].name).join(", ")}` : ""}</div>
      <div class="cx-stats">${stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
      <table class="cx-weapons">${weapons.map((w) => row(w, ds.leaderWeapons?.includes(w.id) && !ds.weapons.includes(w.id) ? ' <span class="dim">(líder)</span>' : "")).join("")}
        ${optW.map((w) => row(w, ' <span class="dim">(equipo)</span>')).join("")}</table>
      ${(() => { const kinds = [...new Set([...weapons, ...optW].flatMap((w) => w.abilities.map((a) => a.kind)))]; return kinds.length ? `<div class="cx-abil dim">${kinds.map((k) => `<div><b>${WEAPON_ABILITY_TEXT[k].name}:</b> ${WEAPON_ABILITY_TEXT[k].text}</div>`).join("")}</div>` : ""; })()}
      ${ds.abilities.length ? `<div class="cx-abil">${ds.abilities.map((a) => `<div><b>${UNIT_ABILITY_TEXT[a].name}:</b> ${UNIT_ABILITY_TEXT[a].text}</div>`).join("")}</div>` : ""}
      ${ds.options?.length ? `<div class="cx-abil"><b>Equipo opcional:</b> ${ds.options.map((o) => `${o.name}${o.points ? ` (+${o.points}${o.perModel ? " por miniatura" : ""})` : ""}`).join("; ")}</div>` : ""}
      <p class="cx-lore">${UNIT_LORE[ds.id as DatasheetId]}</p>`;
  }
}
