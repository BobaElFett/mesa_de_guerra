import { overwatchBlocked, overwatchWeapons } from "../rules/reactions";
import { CommandBus, PieceMove } from "../core/commands";
import { BASE_RADIUS, Faction, GameState, Piece, PLAYERS } from "../core/state";
import { DATASHEETS, hasAbility, WEAPONS } from "../rules/datasheets";
import { allowance, checkMove, isEngaged, movedSoFar } from "../rules/movement";
import { shootingOptions } from "../rules/shooting";
import { chargeOptions, fightOptions } from "../rules/melee";
import { formation, formationModels, partnerOf, underCommand } from "../rules/leaders";
import { OBJECTIVE_RADIUS, OBJECTIVE_RANGE, objectiveStatus } from "../rules/missions";
import { hasStrat, stratBlocked } from "../rules/stratagems";
import { crossesSolid, disc, gap, sight } from "../rules/geometry";
import {
  attackValue, centroid, expectedAttack, groupGap, meleeExpected, p2D6, pointsPerWound, unitCost,
} from "./evaluate";
import type { AiLevel } from "./settings";
import { playPhase as simplePhase, setReactHook } from "./bot";

// IA táctica (#37). Juega con las mismas órdenes que un jugador, una acción cada vez
// (`aiStep`), para que la interfaz pueda enseñar cada disparo con sus dados.
//  - Movimiento: para cada unidad prueba varios destinos (quedarse, cada objetivo, hacia cada
//    enemigo, alejarse) con y sin avanzar, y se queda con el de más valor: objetivos que gana o
//    asegura, disparos o cargas que tendrá a su alcance y el daño que puede recibir.
//  - Disparo: el arma y el objetivo con más puntos esperados, uno a uno (si un objetivo cae,
//    recalcula). Cargas según la probabilidad de llegar y lo que gana y pierde en el combate.
//  - Estratagemas cuando compensan. Fácil = el bot sencillo de la fase 2.
// Niveles (probados con partidas IA contra IA, ver tests/ai.test.ts): Difícil gana a Normal
// unas dos de cada tres; Normal valora peor los objetivos, se equivoca más (ruido) y no usa
// estratagemas; Fácil no mira los objetivos.

export interface Weights {
  danger: number; obj: number; minP: number; cpReserve: number; minCharge: number; assign: boolean; holdPenalty: number;
  approach: number; assignIn: number; assignProg: number; meleeClose: number; heavyMult: number; shooterCharge: number;
  /** Error de juicio (0 = ninguno): cuánto puede desviarse la valoración de cada opción. */
  noise: number;
  /** Usa estratagemas de disparo, carga y combate. */
  strats: boolean;
  /** Peso del daño que puede recibir de los disparos enemigos (con cobertura, menos). */
  rangedDanger: number;
}

/** Ruido determinista en [−1, 1] a partir de un texto (no gasta la semilla de la partida). */
function hashNoise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
const jitter = (s: GameState, W: Weights, key: string) => 1 + W.noise * hashNoise(`${s.seed}|${s.turn}|${s.active}|${s.phase}|${key}`);

export const WEIGHTS: Record<Exclude<AiLevel, "facil">, Weights> = {
  normal: { danger: 0, obj: 4, minP: 0.45, cpReserve: 1, minCharge: 10, assign: false, holdPenalty: 0, approach: 0.1, assignIn: 0.6, assignProg: 0.08, meleeClose: 14, heavyMult: 1.2, shooterCharge: 0.6, noise: 1, strats: false, rangedDanger: 0 },
  dificil: { danger: 0.3, obj: 10, minP: 0.45, cpReserve: 1, minCharge: 10, assign: false, holdPenalty: 0.5, approach: 0.1, assignIn: 0.6, assignProg: 0.08, meleeClose: 0, heavyMult: 1.2, shooterCharge: 0.6, noise: 0, strats: true, rangedDanger: 0.3 },
};

export type Role = "melee" | "shooter" | "heavy";

export function roleOf(s: GameState, unitId: string): Role {
  const u = s.units.find((x) => x.id === unitId)!;
  const ds = DATASHEETS[u.datasheet];
  if (ds.weapons.some((w) => hasAbility(WEAPONS[w], "pesada"))) return "heavy";
  if (ds.abilities.includes("rapidez")) return "melee";
  const power = (cc: boolean) => ds.weapons.map((id) => WEAPONS[id]).filter((w) => (w.range === "CC") === cc)
    .reduce((n, w) => n + (typeof w.attacks === "number" ? w.attacks : 3) * w.strength * (typeof w.damage === "number" ? w.damage : 3) * (w.skill ? (7 - w.skill) / 6 : 1), 0);
  return power(true) > power(false) * 1.6 ? "melee" : "shooter";
}

const mine = (s: GameState) => PLAYERS[s.active];
const nameOf = (s: GameState, id: string) => DATASHEETS[s.units.find((u) => u.id === id)!.datasheet].name;

let lastAction = "";
/** Qué hizo la IA en su último paso (para enseñarlo en pantalla). */
export const aiLastAction = () => lastAction;
const alive = (s: GameState, id: string) => s.pieces.some((p) => p.unit === id);
const enemiesOf = (s: GameState, f: Faction) => s.units.filter((u) => u.faction !== f && alive(s, u.id));

/** Cabezas de formación (la escuadra si lleva líder) del bando, vivas. */
function heads(s: GameState, f: Faction) {
  return s.units.filter((u) => u.faction === f && alive(s, u.id) && formation(s, u.id)[0] === u.id);
}

const translated = (models: Piece[], dx: number, dz: number) => models.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz }));

// --- Movimiento ------------------------------------------------------------------

interface Plan { dx: number; dz: number; kind: "normal" | "avanzar" | "retirarse"; score: number; why: string }

function rangedWeapons(s: GameState, unitId: string) {
  const out: { w: (typeof WEAPONS)[string]; n: number }[] = [];
  for (const id of formation(s, unitId)) {
    const u = s.units.find((x) => x.id === id)!;
    const ds = DATASHEETS[u.datasheet];
    for (const p of s.pieces.filter((q) => q.unit === id)) {
      const ids = p.leader && ds.leaderWeapons ? ds.leaderWeapons : ds.weapons;
      for (const wid of ids) {
        const w = WEAPONS[wid];
        if (w.range === "CC") continue;
        const e = out.find((x) => x.w.id === wid);
        if (e) e.n++; else out.push({ w, n: 1 });
      }
    }
  }
  return out;
}

/** Valor de una posición (desplazamiento dx, dz de toda la formación). */
function scorePosition(s: GameState, unitId: string, dx: number, dz: number, kind: Plan["kind"], W: Weights, claimed: Map<string, number>, assigned: string | null = null): { score: number; why: string } {
  const f = s.units.find((x) => x.id === unitId)!.faction;
  const group = formation(s, unitId);
  const models = translated(formationModels(s, unitId), dx, dz);
  const role = roleOf(s, unitId);
  const enemies = enemiesOf(s, f);
  const rapid = DATASHEETS[s.units.find((x) => x.id === unitId)!.datasheet].abilities.includes("rapidez");
  let score = 0, why = "";

  // Objetivos: lo que gana, asegura o le acerca
  const ocUnit = group.reduce((n, id) => {
    const u = s.units.find((x) => x.id === id)!;
    return n + (u.shocked ? 0 : DATASHEETS[u.datasheet].profile.OC * s.pieces.filter((p) => p.unit === id).length);
  }, 0);
  const objs = s.objectives ?? [];
  const exclude = new Set(group);
  const me = PLAYERS.indexOf(f) as 0 | 1;
  for (const o of objs) {
    const marker = { x: o.x, z: o.z, r: OBJECTIVE_RADIUS };
    const near = models.filter((p) => gap(disc(p), marker) <= OBJECTIVE_RANGE - 0.2);
    const st = objectiveStatus({ ...s, pieces: s.pieces.filter((p) => !p.unit || !exclude.has(p.unit)) }, o);
    const ours = st.oc[me] + (claimed.get(o.id) ?? 0), theirs = st.oc[1 - me];
    if (near.length) {
      const add = ocUnit * (near.length / Math.max(1, models.length));
      if (ours <= theirs && ours + add > theirs) { score += o.vp * W.obj; why = `toma ${o.name}`; }
      else if (ours > theirs && ours - theirs < 4) score += o.vp * W.obj * 0.35;
      else if (ours + add <= theirs) score += o.vp * W.obj * 0.25 * (add / Math.max(1, theirs));
      else score += o.vp * 0.5;
    } else if (ours <= theirs) {
      const d = Math.min(...models.map((p) => gap(disc(p), marker)));
      score += o.vp * W.obj * W.approach * Math.max(0, 1 - d / 30);
    }
  }

  // El objetivo que tiene asignado: llegar y quedarse
  if (assigned) {
    const o = objs.find((x) => x.id === assigned)!;
    const marker = { x: o.x, z: o.z, r: OBJECTIVE_RADIUS };
    const dNow = Math.min(...formationModels(s, unitId).map((p) => gap(disc(p), marker)));
    const dNew = Math.min(...models.map((p) => gap(disc(p), marker)));
    const inRange = models.filter((p) => gap(disc(p), marker) <= OBJECTIVE_RANGE - 0.2).length / Math.max(1, models.length);
    score += o.vp * W.obj * (W.assignIn * inRange + W.assignProg * Math.max(0, dNow - dNew));
    if (inRange > 0) why = `va a ${o.name}`;
  }

  // Ataque que tendrá a su alcance
  if (role !== "melee") {
    const stationary = dx === 0 && dz === 0;
    let best = 0;
    for (const { w, n } of rangedWeapons(s, unitId)) {
      if (kind === "retirarse" || (kind === "avanzar" && !hasAbility(w, "asalto"))) continue;
      let wb = 0;
      for (const e of enemies) {
        if (e.attachedTo && partnerOf(s, e.id)) continue;   // protegido por su escuadra
        const g = groupGap(models, s.pieces.filter((p) => p.unit === e.id));
        if (g > (w.range as number)) continue;
        const v = attackValue(s, e.id, expectedAttack(s, w, n, e.id, { distance: g, stationary, rerollHitOnes: underCommand(s, unitId) }));
        wb = Math.max(wb, v);
      }
      best += wb;
    }
    score += best * (role === "heavy" ? W.heavyMult : 1);
    if (best > 0 && !why) why = "dispara";
  }
  if (role !== "heavy" && kind !== "retirarse" && (kind !== "avanzar" || rapid)) {
    let best = 0;
    for (const e of enemies) {
      const g = groupGap(models, s.pieces.filter((p) => p.unit === e.id));
      if (g > 12) continue;
      const p = p2D6(Math.max(2, Math.ceil(g - 1)));
      const v = attackValue(s, e.id, meleeExpected(s, unitId, e.id)) - meleeExpected(s, e.id, unitId).damage * pointsPerWound(s, unitId) * 0.5;
      best = Math.max(best, p * v);
    }
    score += best * (role === "melee" ? 1 : W.shooterCharge);
    if (best > 0 && !why) why = "amenaza con cargar";
    if (role === "melee") {
      // Acercarse aunque no llegue todavía
      const g = Math.min(...enemies.map((e) => groupGap(models, s.pieces.filter((p) => p.unit === e.id))));
      if (isFinite(g)) score += W.meleeClose * Math.max(0, 1 - g / 40);
    }
  }

  // Peligro: unidades enemigas de cuerpo a cuerpo que le pueden cargar el próximo turno
  let danger = 0;
  for (const e of enemies) {
    if (roleOf(s, e.id) !== "melee") continue;
    const em = s.pieces.filter((p) => p.unit === e.id);
    const reach = DATASHEETS[e.datasheet].profile.M + 8;
    const g = groupGap(models, em);
    if (g > reach) continue;
    const p = Math.min(1, p2D6(Math.max(2, Math.ceil(g - DATASHEETS[e.datasheet].profile.M - 1))) + 0.15);
    danger += p * meleeExpected(s, e.id, unitId).damage * pointsPerWound(s, unitId);
  }
  score -= danger * W.danger * (role === "melee" ? 0.3 : 1);

  // Disparos enemigos: los que la pueden alcanzar el próximo turno, contando la cobertura
  if (W.rangedDanger > 0) {
    let rd = 0;
    const sample = models.filter((_, i) => i % Math.ceil(models.length / 4) === 0);
    for (const e of enemies) {
      const em = s.pieces.filter((p) => p.unit === e.id);
      const ec = centroid(em);
      const eds = DATASHEETS[e.datasheet];
      const eDisc = { x: ec.x, z: ec.z, r: 0.6 };
      let seen = 0, covered = 0;
      for (const p of sample) {
        const sg = sight(eDisc, disc(p), s.terrain);
        if (sg !== "oculta") seen++;
        if (sg === "cobertura") covered++;
      }
      if (!seen) continue;
      const g = groupGap(models, em);
      let best = 0;
      for (const wid of eds.weapons) {
        const w = WEAPONS[wid];
        if (w.range === "CC" || g > w.range + eds.profile.M) continue;
        best = Math.max(best, expectedAttack(s, w, em.length, unitId, { cover: covered * 2 >= seen }).damage);
      }
      rd += best * (seen / sample.length);
    }
    score -= rd * pointsPerWound(s, unitId) * W.rangedDanger;
  }
  return { score, why: why || "se recoloca" };
}

/**
 * Reparto de objetivos al empezar la fase de movimiento (con las posiciones del principio de la
 * fase, para que no cambie mientras las unidades se mueven): cada objetivo que interesa, a la
 * unidad que llega antes y lo sujeta mejor; las de cuerpo a cuerpo prefieren quedar libres.
 */
export function assignObjectives(s: GameState, f: Faction): Map<string, string> {
  const out = new Map<string, string>();
  const objs = s.objectives ?? [];
  if (!objs.length || !s.mission) return out;
  const start = (p: Piece) => s.turnLog.origins[p.id] ?? [p.x, p.z];
  const units = heads(s, f).filter((u) => !u.shocked);
  const me = PLAYERS.indexOf(f) as 0 | 1;
  const capCount = Math.ceil(Math.max(...objs.map((o) => o.vp)) > 0 ? (MISSION_CAP(s) / Math.max(...objs.map((o) => o.vp))) : objs.length);
  const want = Math.min(objs.length, capCount + 1, Math.max(1, units.length - 1));
  const pairs: { u: string; o: string; cost: number }[] = [];
  for (const u of units) {
    const models = formationModels(s, u.id);
    const M = allowance(s, u.id, undefined);
    const role = roleOf(s, u.id);
    for (const o of objs) {
      const d = Math.min(...models.map((p) => { const [x, z] = start(p); return Math.hypot(x - o.x, z - o.z); })) - OBJECTIVE_RANGE;
      const eta = Math.max(0, d) / (M + 2);
      const enemyOc = objectiveStatus(s, o).oc[1 - me];
      const myOc = DATASHEETS[u.datasheet].profile.OC * models.length;
      let cost = eta - o.vp / 10 + (myOc <= enemyOc ? 1 : 0);
      if (role === "melee") cost += 1.2;
      if (role === "heavy") cost += eta > 0.5 ? 1.5 : -0.5;
      pairs.push({ u: u.id, o: o.id, cost });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost || (a.u < b.u ? -1 : 1));
  const usedO = new Set<string>();
  for (const pr of pairs) {
    if (out.size >= want) break;
    if (out.has(pr.u) || usedO.has(pr.o) || pr.cost > 4) continue;
    out.set(pr.u, pr.o);
    usedO.add(pr.o);
  }
  return out;
}

const MISSION_CAP = (s: GameState) => {
  const m = s.mission;
  return m === "tomar" ? 15 : m === "corazon" ? 16 : 6;
};

function planMove(s: GameState, unitId: string, W: Weights, claimed: Map<string, number>, assigned: string | null = null): Plan {
  const f = s.units.find((x) => x.id === unitId)!.faction;
  const models = formationModels(s, unitId);
  const c = centroid(models);
  const role = roleOf(s, unitId);
  const max = allowance(s, unitId, undefined);
  const enemies = enemiesOf(s, f);

  // Trabada: retirarse si sale perdiendo; si no, se queda
  if (formation(s, unitId).some((id) => isEngaged(s, id))) {
    const foes = enemies.filter((e) => groupGap(models, s.pieces.filter((p) => p.unit === e.id)) <= 1.05);
    const theirs = foes.reduce((n, e) => n + meleeExpected(s, e.id, unitId).damage * pointsPerWound(s, unitId), 0);
    const ours = foes.reduce((n, e) => n + attackValue(s, e.id, meleeExpected(s, unitId, e.id)), 0);
    if (role !== "melee" && theirs > ours * 1.2 && foes.length) {
      const fc = centroid(foes.flatMap((e) => s.pieces.filter((p) => p.unit === e.id)));
      const vx = c.x - fc.x, vz = c.z - fc.z, len = Math.hypot(vx, vz) || 1;
      return { dx: (vx / len) * (max - 0.1), dz: (vz / len) * (max - 0.1), kind: "retirarse", score: 0, why: "se retira" };
    }
    return { dx: 0, dz: 0, kind: "normal", score: 0, why: "sigue en combate" };
  }

  const targets: { x: number; z: number; keep: number }[] = [];
  for (const o of s.objectives ?? []) targets.push({ x: o.x, z: o.z, keep: 0 });
  for (const e of enemies) {
    const ec = centroid(s.pieces.filter((p) => p.unit === e.id));
    targets.push({ x: ec.x, z: ec.z, keep: role === "melee" ? 1.3 : 16 });
  }
  const cands: Plan[] = [{ dx: 0, dz: 0, kind: "normal", score: 0, why: "" }];
  const canAdvance = (role === "melee") || role === "shooter";
  for (const t of targets) {
    const vx = t.x - c.x, vz = t.z - c.z, len = Math.hypot(vx, vz);
    if (len < 0.3) continue;
    for (const kind of canAdvance ? ["normal", "avanzar"] as const : ["normal"] as const) {
      const lim = kind === "avanzar" ? max + 3 : max - 0.05;
      // Hasta el destino (menos la distancia que quiere guardar), sin pasarse de lo que mueve
      const want = t.keep > 0 ? Math.max(0, len - t.keep - 1.5) : len;
      for (const frac of [1, 0.5]) {
        const d = Math.min(want * frac, lim);
        if (d < 0.3) continue;
        const ux = vx / len, uz = vz / len;
        cands.push({ dx: ux * d, dz: uz * d, kind, score: 0, why: "" });
        // Si el camino recto choca con contenedores o el búnker, prueba a rodear (#49)
        if (models.some((p) => crossesSolid(s.terrain, p.x, p.z, p.x + ux * d, p.z + uz * d, BASE_RADIUS[p.model]))) {
          for (const ang of [0.6, -0.6, 1.1, -1.1]) {
            const c = Math.cos(ang), sn = Math.sin(ang);
            cands.push({ dx: (ux * c - uz * sn) * d, dz: (ux * sn + uz * c) * d, kind, score: 0, why: "" });
          }
        }
      }
    }
  }
  // Alejarse del enemigo de cuerpo a cuerpo más cercano
  const threat = enemies.filter((e) => roleOf(s, e.id) === "melee")
    .map((e) => ({ e, g: groupGap(models, s.pieces.filter((p) => p.unit === e.id)) })).sort((a, b) => a.g - b.g)[0];
  if (threat && role !== "melee") {
    const ec = centroid(s.pieces.filter((p) => p.unit === threat.e.id));
    const vx = c.x - ec.x, vz = c.z - ec.z, len = Math.hypot(vx, vz) || 1;
    cands.push({ dx: (vx / len) * (max - 0.05), dz: (vz / len) * (max - 0.05), kind: "normal", score: 0, why: "" });
  }
  let best: Plan | null = null;
  for (const cnd of cands) {
    // Que la formación no se salga de la mesa
    if (models.some((p) => Math.abs(p.x + cnd.dx) > 29.5 || Math.abs(p.z + cnd.dz) > 21.5)) continue;
    // Ni atravesar contenedores ni búnker (#49)
    if (models.some((p) => crossesSolid(s.terrain, p.x, p.z, p.x + cnd.dx, p.z + cnd.dz, BASE_RADIUS[p.model]))) continue;
    const r = scorePosition(s, unitId, cnd.dx, cnd.dz, cnd.kind, W, claimed, assigned);
    let sc = r.score * jitter(s, W, `${unitId}|${cnd.dx.toFixed(1)}|${cnd.dz.toFixed(1)}|${cnd.kind}`);
    if (cnd.dx === 0 && cnd.dz === 0) sc += 0.5;                  // a igualdad, no moverse
    if (cnd.kind === "avanzar") sc -= 2;
    if (!best || sc > best.score) best = { ...cnd, score: sc, why: r.why };
  }
  return best!;
}

function moveStep(bus: CommandBus, W: Weights): boolean {
  const s = bus.state;
  const f = mine(s);
  const todo = heads(s, f).filter((u) => !s.turnLog.moves[u.id]);
  if (!todo.length) return false;
  // Objetivos que ya cubren las unidades que han movido este turno
  const claimed = new Map<string, number>();
  const u = todo[0];
  const plan = planMove(s, u.id, W, claimed, W.assign ? assignObjectives(s, f).get(u.id) ?? null : null);
  bus.dispatch({ type: "declareMove", unit: u.id, kind: plan.kind });
  const verb = plan.kind === "avanzar" ? "avanza" : plan.kind === "retirarse" ? "se retira" : "mueve";
  lastAction = plan.dx === 0 && plan.dz === 0 ? `${nameOf(s, u.id)} se queda (${plan.why})` : `${nameOf(s, u.id)} ${verb} (${plan.why})`;
  if (plan.dx === 0 && plan.dz === 0) return true;
  const s2 = bus.state;
  const move = s2.turnLog.moves[u.id];
  const max = allowance(s2, u.id, move);
  const len = Math.hypot(plan.dx, plan.dz);
  const k = Math.min(1, (max - 0.05) / len);
  const moves: PieceMove[] = formationModels(s2, u.id).map((p) => ({ id: p.id, x: p.x + plan.dx * k, z: p.z + plan.dz * k }));
  const r = checkMove(s2, u.id, moves, move);
  if (r.moves.length) bus.dispatch({ type: "moveMany", moves: r.moves });
  return true;
}

// --- Disparo ------------------------------------------------------------------

interface ShotPick { unit: string; weapon: string; target: string; value: number }

function bestShots(s: GameState, f: Faction, W?: Weights): ShotPick[] {
  const out: ShotPick[] = [];
  for (const u of s.units.filter((x) => x.faction === f && alive(s, x.id))) {
    const o = shootingOptions(s, u.id);
    if (o.blocked) continue;
    const stationary = !s.turnLog.moves[u.id] || movedSoFar(s, u.id) < 0.01;
    for (const w of o.weapons) {
      if (w.blocked || w.fired) continue;
      for (const t of w.targets) {
        if (t.blocked) continue;
        const e = expectedAttack(s, w.weapon, t.attackers.length, t.unit, {
          distance: t.distance, stationary, cover: t.cover, rerollHitOnes: underCommand(s, u.id),
          woundMod: hasStrat(s, "punteria", u.id) ? 1 : 0,
        });
        out.push({ unit: u.id, weapon: w.weapon.id, target: t.unit, value: (attackValue(s, t.unit, e) + 0.01) * (W ? jitter(s, W, `${u.id}|${w.weapon.id}|${t.unit}`) : 1) });
      }
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

function shootStep(bus: CommandBus, W: Weights): boolean {
  const s = bus.state;
  const f = mine(s);
  const picks = bestShots(s, f, W);
  if (!picks.length) return false;
  const pick = picks[0];
  // Puntería en la unidad que más va a hacer, si sobran PM
  if (W.strats && !(s.turnLog.strats ?? []).some((x) => x.id === "punteria") && s.cp[s.active] > W.cpReserve && !stratBlocked(s, "punteria", pick.unit)) {
    const total = picks.filter((p) => p.unit === pick.unit).reduce((n, p) => Math.max(n, p.value), 0);
    if (total >= 25) { bus.dispatch({ type: "stratagem", id: "punteria", unit: pick.unit }); lastAction = `Estratagema Puntería en ${nameOf(s, pick.unit)}`; return true; }
  }
  bus.dispatch({ type: "shoot", unit: pick.unit, weapon: pick.weapon, target: pick.target });
  lastAction = `${nameOf(s, pick.unit)} dispara ${WEAPONS[pick.weapon].name} a ${nameOf(s, pick.target)}`;
  return true;
}

// --- Carga ---------------------------------------------------------------------

/** Lo que se pierde si la unidad deja un objetivo que sin ella ya no se controla (y el enemigo no está en él). */
function leavingPenalty(s: GameState, unitId: string, targetId: string): number {
  const f = s.units.find((x) => x.id === unitId)!.faction;
  const me = PLAYERS.indexOf(f) as 0 | 1;
  const ex = new Set(formation(s, unitId));
  const tModels = s.pieces.filter((p) => p.unit === targetId);
  let pen = 0;
  for (const o of s.objectives ?? []) {
    const st = objectiveStatus(s, o);
    if (st.holder !== me) continue;
    const without = objectiveStatus({ ...s, pieces: s.pieces.filter((p) => !p.unit || !ex.has(p.unit)) }, o);
    if (without.holder === me) continue;
    const marker = { x: o.x, z: o.z, r: OBJECTIVE_RADIUS };
    if (tModels.some((p) => gap(disc(p), marker) <= OBJECTIVE_RANGE + 2)) continue;   // el objetivo está en el mismo sitio
    pen += o.vp * 10;
  }
  return pen;
}

function chargeStep(bus: CommandBus, W: Weights): boolean {
  const s = bus.state;
  const f = mine(s);
  let best: { unit: string; target: string; net: number; p: number } | null = null;
  for (const u of heads(s, f)) {
    if (roleOf(s, u.id) === "heavy" || formation(s, u.id).some((id) => roleOf(s, id) === "heavy")) continue;
    const o = chargeOptions(s, u.id);
    if (o.blocked || o.done) continue;
    for (const t of o.targets) {
      if (t.blocked) continue;
      let p = p2D6(t.need);
      const impetu = W.strats && !stratBlocked(s, "impetu", u.id) && s.cp[s.active] > W.cpReserve;
      const pi = impetu ? 1 - (1 - p) * (1 - p) : p;
      const gain = formation(s, u.id).reduce((n, id) => n + attackValue(s, t.unit, meleeExpected(s, id, t.unit)), 0);
      const loss = meleeExpected(s, t.unit, u.id).damage * pointsPerWound(s, u.id) * 0.6;
      const shooterPenalty = (roleOf(s, u.id) === "shooter" ? unitCost(s, u.id) * 0.08 : 0) + leavingPenalty(s, u.id, t.unit) * W.holdPenalty;
      p = pi;
      const net = (p * (gain - loss) - shooterPenalty) * jitter(s, W, `${u.id}|${t.unit}`);
      if (p < W.minP || net < W.minCharge) continue;
      if (!best || net > best.net) best = { unit: u.id, target: t.unit, net, p };
    }
  }
  if (!best) return false;
  if (W.strats && p2D6(chargeOptions(s, best.unit).targets.find((x) => x.unit === best!.target)!.need) < 0.75
    && !stratBlocked(s, "impetu", best.unit) && s.cp[s.active] > W.cpReserve && best.net > 20) {
    bus.dispatch({ type: "stratagem", id: "impetu", unit: best.unit });
  }
  bus.dispatch({ type: "charge", unit: best.unit, target: best.target });
  const rec = bus.state.turnLog.charges?.[best.unit];
  lastAction = `${nameOf(s, best.unit)} carga a ${nameOf(s, best.target)}${rec ? `: 2D6 = ${rec.roll} (necesita ${rec.need}) — ${rec.success ? "¡llega!" : "no llega"}` : ""}`;
  return true;
}

// --- Combate -------------------------------------------------------------------

/** Combate con una unidad del bando `f` (la mejor que pueda). Devuelve false si no queda ninguna. */
export function fightStep(bus: CommandBus, f: Faction, level: AiLevel = "normal"): boolean {
  const s = bus.state;
  let best: { unit: string; target: string; value: number } | null = null;
  for (const u of s.units.filter((x) => x.faction === f && alive(s, x.id))) {
    const o = fightOptions(s, u.id);
    if (o.blocked) continue;
    for (const t of o.targets) {
      const v = attackValue(s, t.unit, meleeExpected(s, u.id, t.unit, 0.9)) + 0.01;
      if (!best || v > best.value) best = { unit: u.id, target: t.unit, value: v };
    }
  }
  if (!best) return false;
  const W = level === "facil" ? null : WEIGHTS[level];
  if (W && W.strats && PLAYERS[s.active] === f && !stratBlocked(s, "furia", best.unit) && s.cp[s.active] > W.cpReserve && best.value >= 20) {
    bus.dispatch({ type: "stratagem", id: "furia", unit: best.unit });
  }
  bus.dispatch({ type: "fight", unit: best.unit, target: best.target });
  lastAction = `${nameOf(s, best.unit)} combate contra ${nameOf(s, best.target)}`;
  return true;
}

/** ¿Le quedan unidades por combatir a este bando? */
export function canFight(s: GameState, f: Faction): boolean {
  return s.units.some((u) => u.faction === f && alive(s, u.id) && !fightOptions(s, u.id).blocked);
}

// --- Mando ---------------------------------------------------------------------

function commandStep(bus: CommandBus, W: Weights): boolean {
  const s = bus.state;
  if ((s.turnLog.strats ?? []).some((x) => x.id === "reagrupar")) return false;
  const shocked = s.units.filter((u) => u.faction === mine(s) && u.shocked && alive(s, u.id))
    .sort((a, b) => unitCost(s, b.id) - unitCost(s, a.id));
  if (!shocked.length || s.cp[s.active] <= W.cpReserve) return false;
  bus.dispatch({ type: "stratagem", id: "reagrupar", unit: shocked[0].id });
  lastAction = `Estratagema Reagrupar en ${nameOf(s, shocked[0].id)}`;
  return true;
}

// --- Fuego defensivo (#50) ------------------------------------------------------

/** ¿Hace fuego defensivo la IA del defensor? Fácil y Normal nunca; Difícil si compensa. */
export function aiWantsOverwatch(s: GameState, level: AiLevel): boolean {
  const pc = s.pendingCharge;
  if (!pc || level === "facil" || !WEIGHTS[level].strats) return false;
  if (overwatchBlocked(s, pc.unit, pc.target)) return false;
  let v = 0;
  for (const { weapon, shooters } of overwatchWeapons(s, pc.target, pc.unit)) {
    v += attackValue(s, pc.unit, expectedAttack(s, weapon, shooters.length, pc.unit, { onlySixes: true }));
  }
  return v >= 6;
}

/** Si hay una carga en espera, decide el defensor (la IA de nivel `level`). */
export function aiReact(bus: CommandBus, level: AiLevel) {
  if (bus.state.pendingCharge) bus.dispatch({ type: "reactCharge", fire: aiWantsOverwatch(bus.state, level) });
}

// --- Entrada -------------------------------------------------------------------

/**
 * Una acción de la IA para el jugador activo en la fase en curso. Devuelve false cuando ya no
 * le queda nada que hacer en la fase (entonces toca pasar a la siguiente). En combate solo
 * juega las unidades del bando activo: para las del otro, `fightStep`.
 */
export function aiStep(bus: CommandBus, level: AiLevel): boolean {
  const s = bus.state;
  if (!s.rulesMode || s.gameOver || level === "facil" || s.pendingCharge) return false;
  const W = WEIGHTS[level];
  switch (s.phase) {
    case "mando": return commandStep(bus, W);
    case "movimiento": return moveStep(bus, W);
    case "disparo": return shootStep(bus, W);
    case "carga": return chargeStep(bus, W);
    case "combate": return fightStep(bus, mine(s), level);
    default: return false;
  }
}

/**
 * Juega la fase entera por el jugador activo (y los combates de los dos bandos, alternando)
 * y pasa a la siguiente. Para partidas IA contra IA y para el botón IA.
 */
export function aiPlayPhase(bus: CommandBus, level: AiLevel, other: AiLevel = level, opts: { humanDefends?: boolean } = {}) {
  const s = bus.state;
  if (!s.rulesMode || s.gameOver) return;
  setReactHook(opts.humanDefends ? () => {} : (b) => aiReact(b, other));
  if (level === "facil" && s.phase !== "combate") { simplePhase(bus); return; }
  if (s.phase === "combate") {
    const act = mine(s), opp: Faction = act === "legion" ? "swarm" : "legion";
    let side: Faction = opp;
    for (let guard = 0; guard < 60; guard++) {
      if (!canFight(bus.state, act) && !canFight(bus.state, opp)) break;
      const lvl = side === act ? level : other;
      if (!fightStep(bus, side, lvl)) fightStep(bus, side === act ? opp : act, side === act ? other : level);
      side = side === act ? opp : act;
    }
  } else {
    for (let guard = 0; guard < 200; guard++) {
      if (bus.state.pendingCharge) { if (opts.humanDefends) return; aiReact(bus, other); continue; }
      if (!aiStep(bus, level)) break;
    }
  }
  if (!bus.state.pendingCharge) bus.dispatch({ type: "nextPhase" });
}
