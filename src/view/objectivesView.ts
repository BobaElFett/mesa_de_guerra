import * as THREE from "three";
import { FACTIONS, GameState, PLAYERS } from "../core/state";
import { OBJECTIVE_RADIUS, OBJECTIVE_RANGE, objectiveStatus } from "../rules/missions";
import { insideTerrain } from "../rules/geometry";
import { box, build, place } from "../models/lowpoly";

// Marcadores de objetivo (#33): peana de 40 mm con un faro; el cristal y el anillo de 3"
// toman el color del bando que lo controla (blanco si nadie).

const NEUTRAL = "#d9d6c8";
const TOP: Record<string, number> = { bunker: 2.8 };   // altura a la que se ve el faro sobre la escenografía

function marker(): THREE.Group {
  return build([
    place(new THREE.CylinderGeometry(OBJECTIVE_RADIUS, OBJECTIVE_RADIUS * 1.05, 0.14, 12), "#2c2f36", 0, 0.07, 0),
    place(new THREE.CylinderGeometry(OBJECTIVE_RADIUS * 0.7, OBJECTIVE_RADIUS * 0.75, 0.1, 12), "#c9a23a", 0, 0.19, 0),
    box(0.16, 1.7, 0.16, "#4a4e57", 0, 0.24, 0),
    box(0.5, 0.08, 0.5, "#4a4e57", 0, 1.9, 0),
  ]);
}

interface Entry { group: THREE.Group; crystal: THREE.Mesh; ring: THREE.Mesh; disc: THREE.Mesh; key: string; relic: boolean; carried: boolean }
const RELIC = "#ffd36b";

export class ObjectivesView {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private ringGeo = new THREE.RingGeometry(OBJECTIVE_RADIUS + OBJECTIVE_RANGE - 0.07, OBJECTIVE_RADIUS + OBJECTIVE_RANGE + 0.07, 72).rotateX(-Math.PI / 2);
  private discGeo = new THREE.CircleGeometry(OBJECTIVE_RADIUS + OBJECTIVE_RANGE, 72).rotateX(-Math.PI / 2);
  private crystalGeo = new THREE.OctahedronGeometry(0.42, 0);
  private t = 0;

  sync(s: GameState) {
    const seen = new Set<string>();
    for (const o of s.objectives ?? []) {
      seen.add(o.id);
      const key = `${o.x},${o.z}`;
      let e = this.entries.get(o.id);
      if (!e) {
        const group = marker();
        const crystal = new THREE.Mesh(this.crystalGeo, new THREE.MeshStandardMaterial({ color: NEUTRAL, emissive: NEUTRAL, emissiveIntensity: 0.8, flatShading: true }));
        crystal.position.y = 2.45;
        crystal.castShadow = true;
        group.add(crystal);
        const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.7, depthWrite: false }));
        const disc = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.08, depthWrite: false }));
        ring.position.y = 0.035; disc.position.y = 0.03;
        ring.renderOrder = 1; disc.renderOrder = 1;
        if (o.relic) crystal.scale.setScalar(1.35);
        e = { group, crystal, ring, disc, key: "", relic: !!o.relic, carried: false };
        this.group.add(group, ring, disc);
        this.entries.set(o.id, e);
      }
      const carried = !!(o.relic && o.carrier);
      if (carried !== e.carried) {
        e.carried = carried;
        e.group.children[0].visible = !carried;          // la peana con el faro se queda sin poste
        e.ring.visible = e.disc.visible = !carried;
        e.key = "";
      }
      if (e.key !== key) {
        const t = s.terrain.find((x) => TOP[x.kind] && insideTerrain(x, o.x, o.z));
        e.group.position.set(o.x, carried ? 1.2 : t ? TOP[t.kind] : 0, o.z);
        e.ring.position.x = e.disc.position.x = o.x;
        e.ring.position.z = e.disc.position.z = o.z;
        e.key = key;
      }
      const { holder } = objectiveStatus(s, o);
      const color = holder === null ? (e.relic ? RELIC : NEUTRAL) : FACTIONS[PLAYERS[holder]].color;
      const cm = e.crystal.material as THREE.MeshStandardMaterial;
      cm.color.set(color); cm.emissive.set(color);
      (e.ring.material as THREE.MeshBasicMaterial).color.set(color);
      (e.disc.material as THREE.MeshBasicMaterial).color.set(color);
      (e.disc.material as THREE.MeshBasicMaterial).opacity = holder === null ? 0.05 : 0.12;
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) {
      this.group.remove(e.group, e.ring, e.disc);
      this.entries.delete(id);
    }
  }

  update(dt: number) {
    this.t += dt;
    for (const e of this.entries.values()) {
      e.crystal.rotation.y = this.t * 0.8;
      e.crystal.position.y = 2.45 + Math.sin(this.t * 2) * 0.08;
    }
  }
}
