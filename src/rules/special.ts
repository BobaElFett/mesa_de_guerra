import { BASE_RADIUS, GameState, Piece, PLAYERS } from "../core/state";
import { rollDice } from "../core/rng";
import { resolveOverlaps } from "../core/placement";
import { DATASHEETS, WEAPONS } from "./datasheets";
import { ENGAGEMENT, onForbiddenTerrain } from "./geometry";
import { note, unitName } from "./history";
import { enemyModels, unitModels } from "./movement";
import { performAttack } from "./shooting";

// Reglas especiales de las tropas de la fase 24 (#111–#114): Impacto, Sanador y Estallido.
// (Indirecto vive en shooting.ts, junto a la línea de visión.)

const has = (s: GameState, unitId: string, a: string) => {
  const u = s.units.find((x) => x.id === unitId);
  return !!u && (DATASHEETS[u.datasheet].abilities as string[]).includes(a);
};

/**
 * Devuelve hasta `n` miniaturas a la unidad, copiando `proto`, pegadas a ella y lejos del
 * enemigo (Oleada sin fin, Sanador). Devuelve cuántas han vuelto.
 */
export function respawn(s: GameState, unitId: string, n: number, proto?: Piece): number {
  const models = unitModels(s, unitId);
  if (!models.length || n <= 0) return 0;
  const base = proto ?? models.find((p) => !p.leader && !p.weapons) ?? models[0];
  const cx = models.reduce((a, p) => a + p.x, 0) / models.length, cz = models.reduce((a, p) => a + p.z, 0) / models.length;
  const enemies = enemyModels(s, unitId).map((e) => ({ x: e.x, z: e.z, r: BASE_RADIUS[e.model] + ENGAGEMENT }));
  // Ids nuevos: por encima de todos, también de los que esperan en reserva (si no, se repetirían)
  let next = [...s.pieces, ...(s.reserves ?? [])].reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, "")) || 0), 0);
  const fresh: Piece[] = [];
  for (let i = 0; i < n; i++) {
    const p: Piece = { ...base, id: `E${++next}`, x: cx, z: cz, damage: 0, leader: false, pose: (i + next) % 3 };
    delete p.weapons;
    fresh.push(p);
  }
  const placed = resolveOverlaps([...s.pieces, ...fresh], fresh.map((p) => ({ id: p.id, x: p.x, z: p.z })), {
    avoid: () => enemies,
    blocked: (x, z, rr) => onForbiddenTerrain(s.terrain, x, z, rr + 0.05) !== null,
    limit: () => ({ x: cx, z: cz, max: 6 }),
  });
  let k = 0;
  for (const m of placed) {
    const p = fresh.find((q) => q.id === m.id)!;
    if (Math.hypot(m.x - cx, m.z - cz) > 6 + 1e-6) continue;
    s.pieces.push({ ...p, x: m.x, z: m.z });
    k++;
  }
  return k;
}

/** Impacto (#111): tras una carga con éxito, un dado por miniatura; cada 5+, una herida mortal. */
export function applyImpact(s: GameState, unitId: string, targetId: string) {
  if (!has(s, unitId, "impacto")) return;
  const mine = unitModels(s, unitId);
  if (!mine.length || !unitModels(s, targetId).length) return;
  note(s, "carga", `${unitName(s, unitId)} aterriza con los retrorreactores: ${mine.length} dados de Impacto`);
  performAttack(s, "combate", unitId, mine, WEAPONS.aterrizaje, targetId, { mortal: true });
}

/** Estallido (#114): las miniaturas de `burstUnit` que han caído revientan contra `killer`. */
export function applyBurst(s: GameState, burstUnit: string, killer: string, fallen: Piece[]) {
  if (!fallen.length || !has(s, burstUnit, "estallido") || !unitModels(s, killer).length) return;
  note(s, "baja", `${unitName(s, burstUnit)}: ${fallen.length} revientan`);
  performAttack(s, "combate", burstUnit, fallen, WEAPONS.estallidoBio, killer, { mortal: true });
}

/** Sanador (#112): al empezar el mando del jugador activo, cada médico devuelve una miniatura a su escuadra. */
export function healLedSquads(s: GameState) {
  for (const u of s.units) {
    if (u.faction !== PLAYERS[s.active] || !u.attachedTo || !has(s, u.id, "sanador")) continue;
    if (!unitModels(s, u.id).length) continue;
    const squad = s.units.find((x) => x.id === u.attachedTo);
    if (!squad) continue;
    const alive = unitModels(s, squad.id).length;
    if (!alive || alive >= squad.startingModels) continue;
    if (respawn(s, squad.id, 1)) note(s, "turno", `${unitName(s, u.id)} devuelve una miniatura a ${unitName(s, squad.id)}`);
  }
}

/** Devorar (#118): cada miniatura enemiga que mata en combate le cura 1 herida. */
export function devour(s: GameState, unitId: string, kills: number) {
  if (kills <= 0 || !has(s, unitId, "devorar")) return;
  let left = kills, healed = 0;
  for (const p of s.pieces) {
    if (p.unit !== unitId || !p.damage) continue;
    const h = Math.min(p.damage, left);
    p.damage -= h; left -= h; healed += h;
    if (!left) break;
  }
  if (healed) note(s, "combate", `${unitName(s, unitId)} devora a sus víctimas y recupera ${healed} herida${healed === 1 ? "" : "s"}`);
}

/** Reparar (#120): al empezar tu mando, cada ingeniero cura D3 heridas a un vehículo propio a 3" o menos. */
export function repairVehicles(s: GameState) {
  for (const u of s.units) {
    if (u.faction !== PLAYERS[s.active] || !has(s, u.id, "reparar")) continue;
    const eng = unitModels(s, u.id)[0];
    if (!eng) continue;
    const near = s.pieces
      .filter((p) => p.faction === u.faction && p.damage && p.unit && has(s, p.unit, "blindado")
        && Math.hypot(p.x - eng.x, p.z - eng.z) - BASE_RADIUS[p.model] - BASE_RADIUS[eng.model] <= 3)
      .sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0))[0];
    if (!near) continue;
    const [d, rng] = rollDice(s.rng, 1, 3);
    s.rng = rng;
    const h = Math.min(near.damage!, d[0]);
    near.damage! -= h;
    note(s, "turno", `${unitName(s, u.id)} repara ${h} herida${h === 1 ? "" : "s"} a ${unitName(s, near.unit!)}`);
  }
}
