import * as THREE from "three";
import type { CommandBus } from "../core/commands";
import type { PiecesView } from "../view/piecesView";
import type { Effects } from "../view/effects";
import { sfx, weaponSound } from "../audio/sfx";
import { WEAPONS } from "../rules/datasheets";
import type { AttackLogEntry } from "../rules/shooting";

// Sensación de juego (#53, #94): trazadoras, chispas, embistes, retrocesos y sonidos de los ataques.

export interface FxDeps { bus: CommandBus; pieces: PiecesView; effects: Effects }

/** Trazadoras y sonidos de los ataques recién resueltos. */
export function playAttackFx(entries: AttackLogEntry[], d: FxDeps) {
  const { bus, pieces, effects } = d;
  let t = 0;
  for (const e of entries) {
    const shooters = bus.state.pieces.filter((p) => p.unit === e.attacker);
    const targets = [...bus.state.pieces.filter((p) => p.unit === e.target).map((p) => p.id), ...e.result.slain];
    const posOf = (id: string) => { const g = pieces.groupOf(id); return g ? new THREE.Vector3(g.position.x, 0.9, g.position.z) : null; };
    const aUnit = bus.state.units.find((u) => u.id === e.attacker);
    const fac = aUnit?.faction ?? "legion";
    const melee = e.kind === "combate";
    const kind = WEAPONS[e.weapon]?.id === "granadas" ? "pesado" : fac === "swarm" ? "acido" : /plasma|rayo|grito/i.test(e.weapon) ? "plasma" : /canon|cañon|pesad/i.test(e.weapon) ? "pesado" : "bala";
    const n = Math.min(12, e.result.attacks);
    for (let i = 0; i < n; i++) {
      const a = shooters[i % Math.max(1, shooters.length)];
      const tid = i < e.result.slain.length ? e.result.slain[i] : targets[i % Math.max(1, targets.length)];
      const pa = a ? posOf(a.id) : null, pb = tid ? posOf(tid) : null;
      if (!pb) continue;
      pb.x += (Math.random() - 0.5) * 0.5; pb.z += (Math.random() - 0.5) * 0.5;
      const delay = t + i * (melee ? 0.08 : 0.06);
      if (melee || !pa) {
        effects.sparks(pb, delay, fac === "swarm" ? "#c9a3ff" : "#ffd27a");
        if (a) pieces.lunge(a.id, pb, delay);
        if (tid && i < e.result.hits) pieces.recoil(tid, pa ?? pb, delay + 0.12);
      } else {
        const arrive = effects.shot(pa, pb, kind, delay);
        const hit = i < e.result.hits;
        if (hit) { effects.impact(pb, arrive, i < e.result.slain.length, kind === "acido" ? "#c8ff9a" : "#fff3c4"); if (tid) pieces.recoil(tid, pa, arrive); }
      }
    }
    sfx.play(weaponSound(e.weapon, melee, fac), Math.max(1, Math.min(8, Math.ceil(e.result.attacks / 2))), t);
    if (e.result.slain.length) sfx.play("baja", Math.min(3, e.result.slain.length), t + 0.5);
    t += 0.35;
  }
}
