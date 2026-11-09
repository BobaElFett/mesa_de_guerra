import { arriveStep } from "./arrival";
import { formation, formationModels, partnerOf } from "../rules/leaders";
import { CommandBus, PieceMove } from "../core/commands";
import { GameState, Piece, PLAYERS } from "../core/state";
import { DATASHEETS, hasAbility, WEAPONS } from "../rules/datasheets";
import { disc, gap } from "../rules/geometry";
import { allowance, checkMove, isEngaged, unitModels, enemyModels } from "../rules/movement";
import { shootingOptions } from "../rules/shooting";
import { chargeOptions, fightOptions } from "../rules/melee";

// Bot sencillo: juega la fase en curso con las mismas órdenes que un jugador.
// No es la IA de la fase 4; sirve para partidas de prueba y para encontrar fallos de reglas.

const ownUnits = (s: GameState) => s.units.filter((u) => u.faction === PLAYERS[s.active] && unitModels(s, u.id).length);

/** ¿Lleva la unidad armas pesadas? (prefiere no moverse y no cargar) */
function heavy(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId)!;
  return DATASHEETS[u.datasheet].weapons.some((w) => hasAbility(WEAPONS[w], "pesada"));
}

/** ¿Prefiere el cuerpo a cuerpo? (sin armas a distancia, o del Enjambre con Rapidez) */
function melee(s: GameState, unitId: string): boolean {
  const ds = DATASHEETS[s.units.find((x) => x.id === unitId)!.datasheet];
  return ds.abilities.includes("rapidez") || ds.weapons.every((w) => WEAPONS[w].range === "CC");
}

function nearestEnemy(s: GameState, p: Piece): Piece | null {
  let best: Piece | null = null, d = Infinity;
  for (const q of s.pieces) if (q.faction !== p.faction) {
    const g = gap(disc(p), disc(q));
    if (g < d) { d = g; best = q; }
  }
  return best;
}

function movePhase(bus: CommandBus) {
  while (arriveStep(bus, false)) { /* las reservas llegan primero (#56) */ }
  for (const u of ownUnits(bus.state)) {
    const s = bus.state;
    if (u.attachedTo && partnerOf(s, u.id)) continue;    // el líder se mueve con su escuadra
    if (formation(s, u.id).some((id) => isEngaged(s, id))) continue;   // se queda a pelear
    const models = formationModels(s, u.id);
    if (!enemyModels(s, u.id).length) continue;
    // Las pesadas que ya tienen a quién disparar se quedan quietas (+1 al impactar)
    if (heavy(s, u.id) && shootingOptions(s, u.id).weapons.some((w) => w.targets.some((t) => !t.blocked))) continue;
    const far = Math.min(...models.map((p) => { const e = nearestEnemy(s, p); return e ? gap(disc(p), disc(e)) : Infinity; }));
    const kind = melee(s, u.id) && far > 14 ? "avanzar" : "normal";
    bus.dispatch({ type: "declareMove", unit: u.id, kind });
    const s2 = bus.state;
    const max = allowance(s2, u.id, s2.turnLog.moves[u.id]);
    const moves: PieceMove[] = [];
    for (const p of formationModels(s2, u.id)) {
      const e = nearestEnemy(s2, p);
      if (!e) continue;
      const g = gap(disc(p), disc(e));
      // Las de cuerpo a cuerpo se acercan hasta 1,5"; las de disparo se quedan a media distancia
      const keep = melee(s2, u.id) ? 1.5 : 10;
      const travel = Math.max(0, Math.min(max - 0.05, g - keep));
      if (travel < 0.1) continue;
      const dx = e.x - p.x, dz = e.z - p.z, len = Math.hypot(dx, dz) || 1;
      moves.push({ id: p.id, x: p.x + (dx / len) * travel, z: p.z + (dz / len) * travel });
    }
    if (!moves.length) continue;
    const r = checkMove(s2, u.id, moves, s2.turnLog.moves[u.id]);
    if (r.moves.length) bus.dispatch({ type: "moveMany", moves: r.moves });
  }
}

function shootPhase(bus: CommandBus) {
  for (const u of ownUnits(bus.state)) {
    for (;;) {
      const o = shootingOptions(bus.state, u.id);
      if (o.blocked) break;
      const pick = o.weapons.flatMap((w) => w.targets.filter((t) => !t.blocked).map((t) => ({ w, t })))
        .sort((a, b) => b.t.attackers.length - a.t.attackers.length || a.t.distance - b.t.distance)[0];
      if (!pick) break;
      bus.dispatch({ type: "shoot", unit: u.id, weapon: pick.w.weapon.id, target: pick.t.unit });
    }
  }
}

/** Quién decide el fuego defensivo cuando el bot carga (por defecto: no se hace). */
let reactHook: (bus: CommandBus) => void = (bus) => { if (bus.state.pendingCharge) bus.dispatch({ type: "reactCharge", fire: false }); };
export function setReactHook(fn: (bus: CommandBus) => void) { reactHook = fn; }

function chargePhase(bus: CommandBus) {
  for (const u of ownUnits(bus.state)) {
    if (formation(bus.state, u.id).some((id) => heavy(bus.state, id))) continue;
    const o = chargeOptions(bus.state, u.id);
    if (o.blocked || o.done) continue;
    const t = o.targets.find((x) => !x.blocked && x.need <= 9);
    if (t) { bus.dispatch({ type: "charge", unit: u.id, target: t.unit }); reactHook(bus); }
  }
}

function fightPhase(bus: CommandBus) {
  // Alterna empezando por el jugador no activo (después de las que cargaron, que van primero)
  let side = bus.state.active === 0 ? 1 : 0;
  for (let guard = 0; guard < 50; guard++) {
    const s = bus.state;
    const ready = s.units.filter((u) => unitModels(s, u.id).length && !fightOptions(s, u.id).blocked);
    if (!ready.length) return;
    const mine = ready.filter((u) => u.faction === PLAYERS[side]);
    const u = (mine.length ? mine : ready)[0];
    bus.dispatch({ type: "fight", unit: u.id, target: fightOptions(s, u.id).targets[0].unit });
    side = side === 0 ? 1 : 0;
  }
}

/** Juega la fase actual del jugador activo y pasa a la siguiente. */
export function playPhase(bus: CommandBus) {
  const s = bus.state;
  if (!s.rulesMode || s.gameOver) return;
  if (s.phase === "movimiento") movePhase(bus);
  else if (s.phase === "disparo") shootPhase(bus);
  else if (s.phase === "carga") chargePhase(bus);
  else if (s.phase === "combate") fightPhase(bus);
  bus.dispatch({ type: "nextPhase" });
}

/** Puntos que le quedan a un bando (proporcional a las miniaturas vivas de cada unidad). */
export function survivingPoints(s: GameState, faction: "legion" | "swarm"): number {
  let n = 0;
  for (const u of s.units) if (u.faction === faction) {
    const ds = DATASHEETS[u.datasheet];
    const pts = ds.sizes.find((x) => x.models === u.startingModels)?.points ?? 0;
    const alive = unitModels(s, u.id);
    const W = ds.profile.W;
    const health = alive.reduce((a, p) => a + (W - (p.damage ?? 0)) / W, 0);
    n += pts * health / u.startingModels;
  }
  return Math.round(n);
}

