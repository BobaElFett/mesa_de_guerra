import { conditionHitMod, reach } from "./conditions";
import { pieceWeaponIds } from "./datasheets";
import { recordDamage } from "./stats";
import { note } from "./history";
import { hasStrat } from "./stratagems";
import { recordCasualties } from "./missions";
import { isGuarded, underCommand } from "./leaders";
import { GameState, Piece, PLAYERS } from "../core/state";
import { DATASHEETS, Weapon, WEAPONS, hasAbility } from "./datasheets";
import { resolveAttack, SeededDice, woundTarget, AttackResult } from "./attack";
import { disc, engaged, gap, sight, Sight } from "./geometry";
import { canShootAfter, movedSoFar, unitModels } from "./movement";

// Fase de disparo del reglamento: cada unidad dispara con sus armas a unidades enemigas
// visibles y al alcance. El ataque se resuelve con el RNG del estado (rules/attack.ts).

export interface TargetOption {
  unit: string;
  name: string;
  /** Distancia más corta (borde a borde) entre tiradoras con visión y el objetivo. */
  distance: number;
  /** Miniaturas que pueden disparar a este objetivo con esta arma. */
  attackers: string[];
  cover: boolean;
  /** Por qué no se puede, si no se puede. */
  blocked?: string;
}

export interface WeaponOption {
  weapon: Weapon;
  /** Miniaturas de la unidad que llevan esta arma. */
  carriers: string[];
  fired: boolean;
  blocked?: string;
  targets: TargetOption[];
}

export interface ShootingOptions {
  blocked?: string;
  weapons: WeaponOption[];
}

/** Registro de un ataque resuelto (disparo o, más adelante, combate). */
export interface AttackLogEntry {
  kind: "disparo" | "combate";
  turn: number;
  player: number;
  attacker: string;
  target: string;
  weapon: string;
  attackers: number;
  cover: boolean;
  hitOn: number | null;
  woundOn: number;
  /** Fuego defensivo contra una carga (#50). */
  overwatch?: boolean;
  /** Heridas mortales (Granadas, #52). */
  mortal?: boolean;
  result: Pick<AttackResult, "attacks" | "hitRolls" | "hits" | "criticalHits" | "woundRolls" | "wounds" | "saveTarget" | "saveRolls" | "failedSaves" | "damageRolls" | "slain">;
}

const rangedWeaponsOf = (p: Piece, ds: (typeof DATASHEETS)[keyof typeof DATASHEETS]): Weapon[] =>
  pieceWeaponIds(ds, p).map((id) => WEAPONS[id]).filter((w) => w.range !== "CC");

function enemyUnitsOf(s: GameState, unitId: string) {
  const u = s.units.find((x) => x.id === unitId)!;
  return s.units.filter((x) => x.faction !== u.faction && unitModels(s, x.id).length > 0);
}

/** ¿Está la unidad enemiga trabada con alguna unidad del bando contrario a ella? */
function engagedWithAny(s: GameState, unitId: string): boolean {
  const u = s.units.find((x) => x.id === unitId)!;
  const foes = s.pieces.filter((p) => p.faction !== u.faction);
  return engaged(unitModels(s, unitId), foes);
}

export function shootingOptions(s: GameState, unitId: string): ShootingOptions {
  const unit = s.units.find((u) => u.id === unitId);
  if (!unit) return { blocked: "Unidad desconocida.", weapons: [] };
  const models = unitModels(s, unitId);
  if (!models.length) return { blocked: "La unidad ha sido destruida.", weapons: [] };
  if (unit.faction !== PLAYERS[s.active]) return { blocked: "No es su turno.", weapons: [] };
  const ds = DATASHEETS[unit.datasheet];
  const move = s.turnLog.moves[unitId];
  const selfEngaged = engagedWithAny(s, unitId);

  // Armas a distancia de la unidad y quién las lleva
  const carriers = new Map<string, string[]>();
  for (const p of models) for (const w of rangedWeaponsOf(p, ds)) {
    if (!carriers.has(w.id)) carriers.set(w.id, []);
    carriers.get(w.id)!.push(p.id);
  }
  const fired = new Set(s.turnLog.shot?.[unitId] ?? []);
  const enemies = enemyUnitsOf(s, unitId);

  const weapons: WeaponOption[] = [...carriers].map(([wid, ids]) => {
    const weapon = WEAPONS[wid];
    const opt: WeaponOption = { weapon, carriers: ids, fired: fired.has(wid), targets: [] };
    const pistol = hasAbility(weapon, "pistola");
    if (opt.fired) opt.blocked = "Ya ha disparado esta fase.";
    else if (!canShootAfter(move, hasAbility(weapon, "asalto")))
      opt.blocked = move?.kind === "retirarse" ? "Se ha retirado este turno." : "Ha avanzado: solo dispara con armas de Asalto.";
    else if (selfEngaged && !pistol) opt.blocked = "Trabada: solo dispara con pistolas.";

    for (const e of enemies) {
      const targetModels = unitModels(s, e.id);
      const t: TargetOption = { unit: e.id, name: DATASHEETS[e.datasheet].name, distance: Infinity, attackers: [], cover: false };
      const engagedWithMe = engaged(models, targetModels);
      let anyClear = false;
      for (const id of ids) {
        const a = models.find((p) => p.id === id)!;
        let ok = false;
        for (const b of targetModels) {
          const sg: Sight = sight(disc(a), disc(b), s.terrain);
          if (sg === "oculta") continue;
          const d = gap(disc(a), disc(b));
          t.distance = Math.min(t.distance, d);
          if (d <= reach(s, weapon) + 1e-6) {
            ok = true;
            if (sg === "visible") anyClear = true;
          }
        }
        if (ok) t.attackers.push(id);
      }
      t.cover = t.attackers.length > 0 && !anyClear;
      if (opt.blocked) t.blocked = opt.blocked;
      else if (isGuarded(s, e.id)) t.blocked = "Protegido por su escuadra: primero hay que acabar con ella.";
      else if (selfEngaged && !engagedWithMe) t.blocked = "Trabada: solo puede disparar a quien la traba.";
      else if (!selfEngaged && engagedWithAny(s, e.id)) t.blocked = "Está trabada con tus tropas.";
      else if (t.distance === Infinity) t.blocked = "Sin visión.";
      else if (!t.attackers.length) t.blocked = `Fuera de alcance (${fmt(t.distance)}; alcance ${reach(s, weapon)}"${reach(s, weapon) < (weapon.range as number) ? ", de noche" : ""}).`;
      opt.targets.push(t);
    }
    return opt;
  });
  return { weapons };
}

/**
 * Resuelve un disparo sobre el estado `s` (ya clonado: se modifica).
 * Devuelve la entrada del registro, o null si la orden no es válida.
 */
export function applyShoot(s: GameState, unitId: string, weaponId: string, targetId: string): AttackLogEntry | null {
  const opts = shootingOptions(s, unitId);
  const w = opts.weapons.find((x) => x.weapon.id === weaponId);
  const t = w?.targets.find((x) => x.unit === targetId);
  if (opts.blocked || !w || !t || t.blocked) return null;
  const shooters = unitModels(s, unitId).filter((p) => t.attackers.includes(p.id));
  const entry = performAttack(s, "disparo", unitId, shooters, w.weapon, targetId, {
    distance: t.distance,
    stationary: !s.turnLog.moves[unitId] || movedSoFar(s, unitId) < 0.01,
    cover: t.cover,
  });
  s.turnLog.shot = s.turnLog.shot ?? {};
  s.turnLog.shot[unitId] = [...(s.turnLog.shot[unitId] ?? []), weaponId];
  return entry;
}

/**
 * Resuelve un ataque de `attackers` con `weapon` contra la unidad `targetId` y lo aplica a `s`
 * (daño, bajas, RNG y registro). Lo usan el disparo y el combate.
 */
export function performAttack(s: GameState, kind: AttackLogEntry["kind"], unitId: string, attackers: Piece[],
  weapon: Weapon, targetId: string, extra: { distance?: number; stationary?: boolean; cover?: boolean; overwatch?: boolean; mortal?: boolean } = {}): AttackLogEntry {
  const attacker = s.units.find((u) => u.id === unitId)!;
  const target = s.units.find((u) => u.id === targetId)!;
  const tds = DATASHEETS[target.datasheet];

  // Reparto: primero las heridas y luego las más cercanas a los atacantes
  const near = (p: Piece) => Math.min(...attackers.map((a) => gap(disc(a), disc(p))));
  const targetModels = unitModels(s, targetId)
    .map((p) => ({ p, d: near(p), left: tds.profile.W - (p.damage ?? 0) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => ({ id: x.p.id, woundsLeft: x.left }));

  const dice = new SeededDice(s.rng);
  const res = resolveAttack({
    weapon, attackers: attackers.length,
    target: { profile: tds.profile, models: targetModels, armored: tds.abilities.includes("blindado") },
    distance: extra.distance, stationary: extra.stationary, cover: extra.cover,
    rerollHitOnes: underCommand(s, unitId) && !extra.overwatch,
    rerollWoundOnes: !!attacker.veteran && !extra.mortal,
    onlySixes: extra.overwatch,
    mortal: extra.mortal,
    woundMod: kind === "disparo" && !extra.overwatch && hasStrat(s, "punteria", unitId) ? 1 : 0,
    hitMod: (kind === "combate" && hasStrat(s, "furia", unitId) ? 1 : 0)
      + (kind === "disparo" && !extra.overwatch && !extra.mortal ? conditionHitMod(s, extra.distance) : 0),
  }, dice);
  s.rng = dice.state;

  const before = targetModels.reduce((a, m) => a + m.woundsLeft, 0);
  for (const p of s.pieces) if (p.unit === targetId && res.woundsLeft[p.id] !== undefined) p.damage = tds.profile.W - res.woundsLeft[p.id];
  const slain = new Set(res.slain);
  const after = targetModels.reduce((a, m) => a + (slain.has(m.id) ? 0 : (res.woundsLeft[m.id] ?? m.woundsLeft)), 0);
  recordDamage(s, unitId, targetId, before - after, slain.size);
  s.pieces = s.pieces.filter((p) => !slain.has(p.id));
  if (slain.size) recordCasualties(s, PLAYERS.indexOf(attacker.faction) as 0 | 1, targetId, slain.size);

  const entry: AttackLogEntry = {
    kind, turn: s.turn, player: PLAYERS.indexOf(attacker.faction), attacker: unitId, target: targetId,
    weapon: weapon.id, attackers: attackers.length, cover: !!extra.cover,
    hitOn: hasAbility(weapon, "torrente") ? null : extra.overwatch ? 6 : weapon.skill, woundOn: woundTarget(weapon.strength, tds.profile.T),
    ...(extra.overwatch ? { overwatch: true } : {}),
    ...(extra.mortal ? { mortal: true } : {}),
    result: {
      attacks: res.attacks, hitRolls: res.hitRolls, hits: res.hits, criticalHits: res.criticalHits, woundRolls: res.woundRolls,
      wounds: res.wounds, saveTarget: res.saveTarget, saveRolls: res.saveRolls, failedSaves: res.failedSaves,
      damageRolls: res.damageRolls, slain: res.slain,
    },
  };
  s.combatLog = [...(s.combatLog ?? []), entry];
  {
    const tn = DATASHEETS[target.datasheet].name, an = DATASHEETS[attacker.datasheet].name;
    const what = extra.mortal ? `lanza granadas a ${tn}` : kind === "combate" ? `golpea a ${tn} con ${weapon.name}` : `${extra.overwatch ? "hace fuego defensivo contra" : "dispara a"} ${tn} con ${weapon.name}`;
    const gone = !s.pieces.some((p) => p.unit === targetId);
    note(s, kind === "combate" ? "combate" : "disparo",
      `${an} ${what}: ${res.hits} impacto${res.hits === 1 ? "" : "s"}, ${res.failedSaves} sin salvar, ${res.slain.length} baja${res.slain.length === 1 ? "" : "s"}${gone && res.slain.length ? " — unidad destruida" : ""}`,
      PLAYERS.indexOf(attacker.faction) as 0 | 1);
  }
  return entry;
}

const fmt = (v: number) => `${v.toFixed(1).replace(".", ",")}"`;
