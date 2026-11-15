import { nearAura } from "./auras";
import { conditionHitMod, reach } from "./conditions";
import { pieceWeaponIds } from "./datasheets";
import { recordDamage } from "./stats";
import { note } from "./history";
import { hasStrat } from "./stratagems";
import { recordCasualties } from "./missions";
import { isGuarded, underCommand } from "./leaders";
import { GameState, Piece, PLAYERS } from "../core/state";
import { DATASHEETS, Weapon, WEAPONS, hasAbility } from "./datasheets";
import { resolveAttack, SeededDice, woundTarget, AttackResult, AttackInput } from "./attack";
import { disc, engaged, gap, onHill, sight, Sight } from "./geometry";
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
  /** Solo sin línea de visión (Indirecto, #113): −1 para impactar. */
  indirect?: boolean;
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
    else if (!canShootAfter(move, hasAbility(weapon, "asalto") || hasStrat(s, "avanceTactico", unitId)))
      opt.blocked = move?.kind === "retirarse" ? "Se ha retirado este turno." : "Ha avanzado: solo dispara con armas de Asalto.";
    else if (selfEngaged && !pistol) opt.blocked = "Trabada: solo dispara con pistolas.";

    for (const e of enemies) {
      const targetModels = unitModels(s, e.id);
      const t: TargetOption = { unit: e.id, name: DATASHEETS[e.datasheet].name, distance: Infinity, attackers: [], cover: false };
      const engagedWithMe = engaged(models, targetModels);
      let anyClear = false, anySeen = false;
      const indirect = hasAbility(weapon, "indirecto");
      for (const id of ids) {
        const a = models.find((p) => p.id === id)!;
        let ok = false;
        for (const b of targetModels) {
          const sg: Sight = sight(disc(a), disc(b), s.terrain);
          if (sg === "oculta" && !indirect) continue;
          if (sg !== "oculta") anySeen = true;
          const d = gap(disc(a), disc(b));
          t.distance = Math.min(t.distance, d);
          if (d <= reach(s, weapon) + 1e-6) {
            ok = true;
            if (sg === "visible") anyClear = true;
          }
        }
        if (ok) t.attackers.push(id);
      }
      t.cover = t.attackers.length > 0 && !anyClear && !hasAbility(weapon, "precision");
      if (indirect && t.attackers.length && !anySeen) { t.indirect = true; t.cover = true; }
      if (opt.blocked) t.blocked = opt.blocked;
      else if (isGuarded(s, e.id) && !hasAbility(weapon, "precision")) t.blocked = "Protegido por su escuadra: primero hay que acabar con ella.";
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
    indirect: t.indirect,
  });
  s.turnLog.shot = s.turnLog.shot ?? {};
  s.turnLog.shot[unitId] = [...(s.turnLog.shot[unitId] ?? []), weaponId];
  return entry;
}

/**
 * Los ataques que haría la unidad disparando a `targetId` con cada arma de `weaponIds` que pueda
 * (#127, para la vista previa del panel de ataque). Las que no pueden se saltan.
 */
export function shootSteps(s: GameState, unitId: string, targetId: string, weaponIds: string[]) {
  const opts = shootingOptions(s, unitId);
  if (opts.blocked) return [];
  const stationary = !s.turnLog.moves[unitId] || movedSoFar(s, unitId) < 0.01;
  const out: { kind: "disparo"; unit: string; attackers: Piece[]; weapon: Weapon; target: string; extra: AttackExtra }[] = [];
  for (const id of weaponIds) {
    const w = opts.weapons.find((x) => x.weapon.id === id);
    const t = w?.targets.find((x) => x.unit === targetId);
    if (!w || w.fired || w.blocked || !t || t.blocked) continue;
    out.push({ kind: "disparo", unit: unitId, attackers: unitModels(s, unitId).filter((p) => t.attackers.includes(p.id)), weapon: w.weapon, target: targetId,
      extra: { distance: t.distance, stationary, cover: t.cover, indirect: t.indirect } });
  }
  return out;
}

/** Dispara varias armas de la unidad al mismo objetivo, una detrás de otra, hasta que caiga (#127). */
export function applyShootAll(s: GameState, unitId: string, targetId: string, weaponIds: string[]): AttackLogEntry[] {
  const out: AttackLogEntry[] = [];
  for (const id of weaponIds) {
    if (!unitModels(s, targetId).length) break;
    const e = applyShoot(s, unitId, id, targetId);
    if (e) out.push(e);
  }
  return out;
}

/** Lo que tira un ataque: la entrada de `resolveAttack` con todos los modificadores de la partida. */
export function attackInput(s: GameState, kind: AttackLogEntry["kind"], unitId: string, attackers: Piece[],
  weapon: Weapon, targetId: string, extra: AttackExtra = {}): AttackInput & { notes: string[] } {
  const attacker = s.units.find((u) => u.id === unitId)!;
  const target = s.units.find((u) => u.id === targetId)!;
  const tds = DATASHEETS[target.datasheet];

  // Reparto: primero las heridas y luego las más cercanas a los atacantes
  const near = (p: Piece) => Math.min(...attackers.map((a) => gap(disc(a), disc(p))));
  const targetModels = unitModels(s, targetId)
    .map((p) => ({ p, d: near(p), left: tds.profile.W - (p.damage ?? 0) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => ({ id: x.p.id, woundsLeft: x.left }));

  // Fuego sostenido (#123): las armas a distancia ganan Sostenida 1 esta fase
  const w = kind === "disparo" && !extra.mortal && hasStrat(s, "fuegoSostenido", unitId) && !hasAbility(weapon, "sostenida")
    ? { ...weapon, abilities: [...weapon.abilities, { kind: "sostenida" as const, x: 1 }] } : weapon;
  // Modificadores con su motivo (#127: el panel de ataque los enseña)
  const notes: string[] = [];
  const add = (cond: boolean, v: number, label: string) => { if (cond) notes.push(label); return cond ? v : 0; };
  const hill = kind === "disparo" && !extra.mortal && attackers.filter((a) => onHill(s.terrain, a.x, a.z)).length * 2 > attackers.length
    && !unitModels(s, targetId).some((m) => onHill(s.terrain, m.x, m.z));
  const storm = kind === "disparo" && !extra.overwatch && !extra.mortal ? conditionHitMod(s, extra.distance) : 0;
  const shield = kind === "disparo" && !extra.mortal && nearAura(s, targetId, "escudoVivo") && (tds.profile.Inv ?? 7) > 5;
  const hitMod = add(kind === "combate" && hasStrat(s, "furia", unitId), 1, "+1 impactar (Furia)")
    + add(kind === "combate" && !extra.mortal && nearAura(s, unitId, "voluntad"), 1, "+1 impactar (Voluntad de la colmena)")
    + add(storm !== 0, storm, `${storm > 0 ? "+" : "−"}1 impactar (${s.conditions === "tormenta" ? "tormenta" : "noche"})`)
    + add(!!extra.indirect, -1, "−1 impactar (sin visión: Indirecto)")
    + add(hill, 1, "+1 impactar (desde la colina)")
    + add(kind === "disparo" && !extra.mortal && tds.abilities.includes("sigilo"), -1, "−1 impactar (Sigilo)");
  if (hasAbility(weapon, "pesada") && extra.stationary) notes.push("+1 impactar (Pesada, sin moverse)");
  const woundMod = add(kind === "disparo" && !extra.overwatch && hasStrat(s, "punteria", unitId), 1, "+1 herir (Puntería)")
    + add(hasAbility(weapon, "precision") && !!tds.character && !extra.mortal, 1, "+1 herir (Precisión contra personaje)");
  const extraAttacks = add(kind === "combate" && !extra.mortal && hasStrat(s, "frenesi", unitId), 1, "+1 ataque por miniatura (Frenesí)");
  if (w !== weapon) notes.push("Sostenida 1 (Fuego sostenido)");
  if (extra.cover) notes.push("objetivo en cobertura (+1 a la salvación)");
  if (shield) notes.push("invulnerable 5+ (Escudo vivo)");
  if (underCommand(s, unitId) && !extra.overwatch) notes.push("repite los 1 al impactar (al mando)");
  if (attacker.veteran && !extra.mortal) notes.push("repite los 1 al herir (veterana)");
  if (tds.abilities.includes("blindado")) notes.push("−1 al daño (Blindado)");
  return {
    weapon: w, attackers: attackers.length,
    target: {
      // Escudo vivo (#117): invulnerable 5+ contra disparos cerca de una Bestia Guardiana
      profile: shield ? { ...tds.profile, Inv: 5 } : tds.profile,
      models: targetModels, armored: tds.abilities.includes("blindado"),
    },
    distance: extra.distance, stationary: extra.stationary, cover: extra.cover,
    rerollHitOnes: underCommand(s, unitId) && !extra.overwatch,
    rerollWoundOnes: !!attacker.veteran && !extra.mortal,
    onlySixes: extra.overwatch,
    mortal: extra.mortal,
    woundMod, extraAttacks, hitMod,
    notes,
  };
}

export interface AttackExtra { distance?: number; stationary?: boolean; cover?: boolean; overwatch?: boolean; mortal?: boolean; indirect?: boolean }

/**
 * Resuelve un ataque de `attackers` con `weapon` contra la unidad `targetId` y lo aplica a `s`
 * (daño, bajas, RNG y registro). Lo usan el disparo y el combate.
 */
export function performAttack(s: GameState, kind: AttackLogEntry["kind"], unitId: string, attackers: Piece[],
  weapon: Weapon, targetId: string, extra: AttackExtra = {}): AttackLogEntry {
  const attacker = s.units.find((u) => u.id === unitId)!;
  const target = s.units.find((u) => u.id === targetId)!;
  const tds = DATASHEETS[target.datasheet];
  const input = attackInput(s, kind, unitId, attackers, weapon, targetId, extra);
  const targetModels = input.target.models;
  const dice = new SeededDice(s.rng);
  const res = resolveAttack(input, dice);
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
    const what = extra.mortal ? (weapon.id === "granadas" ? `lanza granadas a ${tn}` : `${weapon.name}: heridas mortales a ${tn}`) : kind === "combate" ? `golpea a ${tn} con ${weapon.name}` : `${extra.overwatch ? "hace fuego defensivo contra" : "dispara a"} ${tn} con ${weapon.name}`;
    const gone = !s.pieces.some((p) => p.unit === targetId);
    note(s, kind === "combate" ? "combate" : "disparo",
      `${an} ${what}: ${res.hits} impacto${res.hits === 1 ? "" : "s"}, ${res.failedSaves} sin salvar, ${res.slain.length} baja${res.slain.length === 1 ? "" : "s"}${gone && res.slain.length ? " — unidad destruida" : ""}`,
      PLAYERS.indexOf(attacker.faction) as 0 | 1);
  }
  return entry;
}

const fmt = (v: number) => `${v.toFixed(1).replace(".", ",")}"`;
