import { nearAura } from "./auras";
import { conditionHitMod, reach } from "./conditions";
import { pieceWeaponIds } from "./datasheets";
import { recordDamage } from "./stats";
import { note } from "./history";
import { hasStrat } from "./stratagems";
import { recordCasualties } from "./missions";
import { isGuarded, ledBy, underCommand } from "./leaders";
import { inSynapse } from "./morale";
import { battleShockTest, deadlyDemise, doctrine, hazardRolls, swarmingInstincts } from "./eleventh";
import { objectiveInRange } from "./missions";
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

/** Operativo solitario (11.ª): no se le puede disparar desde más lejos. */
export const LONE_RANGE = 12;

export function shootingOptions(s: GameState, unitId: string): ShootingOptions {
  const unit = s.units.find((u) => u.id === unitId);
  if (!unit) return { blocked: "Unidad desconocida.", weapons: [] };
  const models = unitModels(s, unitId);
  if (!models.length) return { blocked: "La unidad ha sido destruida.", weapons: [] };
  if (unit.faction !== PLAYERS[s.active]) return { blocked: "No es su turno.", weapons: [] };
  const ds = DATASHEETS[unit.datasheet];
  const move = s.turnLog.moves[unitId];
  const selfEngaged = engagedWithAny(s, unitId);
  const bigUnit = ds.type === "vehiculo" || ds.type === "monstruo";

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
    else if (!canShootAfter(move, hasAbility(weapon, "asalto") || hasStrat(s, "avanceTactico", unitId) || nearAura(s, unitId, "embate") || doctrine(s, unitId, "devastador"))
      && !(move?.kind === "retirarse" && (ds.abilities.includes("depredadores") || doctrine(s, unitId, "tactica"))))
      opt.blocked = move?.kind === "retirarse" ? "Se ha retirado este turno." : "Ha avanzado: solo dispara con armas de Asalto.";
    else if (selfEngaged && !pistol && !bigUnit) opt.blocked = "Trabada: solo dispara con armas de corto alcance.";
    // Corto alcance (11.ª): la infantería dispara o las de corto alcance o las demás, no las dos
    else if (!bigUnit && [...fired].some((f) => hasAbility(WEAPONS[f], "pistola") !== pistol))
      opt.blocked = pistol ? "Ya ha disparado sus otras armas: no puede usar las de corto alcance." : "Ya ha disparado armas de corto alcance: no puede usar las demás.";

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
      t.cover = t.attackers.length > 0 && (!anyClear || DATASHEETS[e.datasheet].abilities.includes("sigilo"))
        && !hasAbility(weapon, "ignoraCobertura") && !ds.abilities.includes("opticas");
      if (indirect && t.attackers.length && !anySeen) { t.indirect = true; t.cover = true; }
      if (opt.blocked) t.blocked = opt.blocked;
      else if (isGuarded(s, e.id) && !hasAbility(weapon, "precision")) t.blocked = "Protegido por su escuadra: primero hay que acabar con ella.";
      else if (DATASHEETS[e.datasheet].abilities.includes("solitario") && !isGuarded(s, e.id) && t.distance > LONE_RANGE + 1e-6)
        t.blocked = `Operativo solitario: solo se le puede disparar a ${LONE_RANGE}" o menos.`;
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
  const ds = DATASHEETS[s.units.find((u) => u.id === unitId)!.datasheet];
  const big = ds.type === "vehiculo" || ds.type === "monstruo";
  const usable = (id: string) => {
    const w = opts.weapons.find((x) => x.weapon.id === id);
    const t = w?.targets.find((x) => x.unit === targetId);
    return w && !w.fired && !w.blocked && t && !t.blocked ? { w, t } : null;
  };
  // Corto alcance: la infantería usa unas u otras; si puede, las armas normales
  const close = weaponIds.some((id) => { const u = usable(id); return u && !hasAbility(u.w.weapon, "pistola"); }) ? false : true;
  for (const id of weaponIds) {
    const ok = usable(id);
    if (!ok) continue;
    const { w, t } = ok;
    if (!big && hasAbility(w.weapon, "pistola") !== close) continue;
    out.push({ kind: "disparo", unit: unitId, attackers: unitModels(s, unitId).filter((p) => t.attackers.includes(p.id)), weapon: w.weapon, target: targetId,
      extra: { distance: t.distance, stationary, cover: t.cover, indirect: t.indirect } });
  }
  return out;
}

/** Dispara varias armas de la unidad al mismo objetivo, una detrás de otra, hasta que caiga (#127). */
export function applyShootAll(s: GameState, unitId: string, targetId: string, weaponIds: string[]): AttackLogEntry[] {
  const out: AttackLogEntry[] = [];
  const allowed = new Set(shootSteps(s, unitId, targetId, weaponIds).map((st) => st.weapon.id));   // Corto alcance
  for (const id of weaponIds.filter((x) => allowed.has(x))) {
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

  const ads = DATASHEETS[attacker.datasheet];
  const ranged = kind === "disparo" && !extra.mortal;
  const melee = kind === "combate" && !extra.mortal;
  const dist = attackers.length ? Math.min(...attackers.flatMap((a) => unitModels(s, targetId).map((p) => gap(disc(a), disc(p))))) : Infinity;
  const charged = !!s.turnLog.charges?.[unitId]?.success;
  // Modificadores con su motivo (#127: el panel de ataque los enseña)
  const notes: string[] = [];
  const add = (cond: boolean, v: number, label: string) => { if (cond) notes.push(label); return cond ? v : 0; };
  // Habilidades de arma que ganan las armas por reglas de la partida
  const gained: Weapon["abilities"] = [];
  const gain = (cond: boolean, a: Weapon["abilities"][number], label: string) => {
    if (cond && !weapon.abilities.some((x) => x.kind === a.kind)) { gained.push(a); notes.push(label); }
  };
  gain(ranged && hasStrat(s, "fuegoSostenido", unitId), { kind: "sostenida", x: 1 }, "Sostenida 1 (Fuego sostenido)");
  gain(!extra.mortal && ledBy(s, unitId, "alfa"), { kind: "sostenida", x: 1 }, "Sostenida 1 (Guerrero alfa)");
  gain(melee && charged && ads.abilities.includes("aceleron"), { kind: "sostenida", x: 1 }, "Sostenida 1 (Asalto a todo gas)");
  gain(ranged && nearAura(s, unitId, "embate"), { kind: "letal" }, "Letal (Embate)");
  gain(!extra.mortal && swarmingInstincts(s, unitId, targetId), { kind: "sostenida", x: 1 }, "Sostenida 1 (Instintos de enjambre)");
  const glory = melee && ads.abilities.includes("horaGloriosa") && !(attacker.spent ?? []).includes("horaGloriosa");
  gain(glory, { kind: "devastadora" }, "Devastadora (Hora gloriosa)");
  // Sinapsis (11.ª): +1 a la Fuerza en combate
  const synapse = melee && inSynapse(s, unitId);
  if (synapse) notes.push("+1 Fuerza (sinapsis)");
  const w = gained.length || synapse ? { ...weapon, strength: weapon.strength + (synapse ? 1 : 0), abilities: [...weapon.abilities, ...gained] } : weapon;

  const hill = ranged && attackers.filter((a) => onHill(s.terrain, a.x, a.z)).length * 2 > attackers.length
    && !unitModels(s, targetId).some((m) => onHill(s.terrain, m.x, m.z));
  const storm = kind === "disparo" && !extra.overwatch && !extra.mortal ? conditionHitMod(s, extra.distance) : 0;
  const nearObj = (id: string) => objectiveInRange(s, id);
  const hammer = w.id === "martilloTrueno";
  // Dañado X: la miniatura con X heridas o menos resta 1 para impactar
  const damaged = !extra.mortal && ads.damaged !== undefined && attackers.length > 0
    && attackers.every((a) => ads.profile.W - (a.damage ?? 0) <= ads.damaged!);
  // Guardia de la hoja: una vez por turno, +1 al golpear o −1 a quien la ataca primero
  const guarded = s.turnLog.guarded ?? {};
  const bladeAtk = melee && ads.abilities.includes("guardiaHoja") && guarded[unitId] === undefined;
  const bladeDef = melee && tds.abilities.includes("guardiaHoja") && !(s.turnLog.fought ?? []).includes(targetId)
    && (guarded[targetId] === undefined || guarded[targetId] === unitId);
  const hitMod = add(kind === "combate" && hasStrat(s, "furia", unitId), 1, "+1 impactar (Furia)")
    + add(storm !== 0, storm, `${storm > 0 ? "+" : "−"}1 impactar (${s.conditions === "tormenta" ? "tormenta" : "noche"})`)
    + add(!!extra.indirect, -1, "−1 impactar (sin visión: Indirecto)")
    + add(hill, 1, "+1 impactar (desde la colina)")
    + add(ranged && ads.abilities.includes("disciplina") && (nearObj(unitId) || nearObj(targetId)), 1, "+1 impactar (Disciplina bólter)")
    + add(melee && charged && hammer && ads.abilities.includes("aceleron"), 1, "+1 impactar (Asalto a todo gas)")
    + add(bladeAtk, 1, "+1 impactar (Guardia de la hoja)")
    + add(bladeDef, -1, "−1 impactar (Guardia de la hoja del objetivo)")
    + add(damaged, -1, "−1 impactar (dañado)");
  if (hasAbility(weapon, "pesada") && extra.stationary) notes.push("+1 impactar (Pesada, sin moverse)");
  const woundMod = add(kind === "disparo" && !extra.overwatch && hasStrat(s, "punteria", unitId), 1, "+1 herir (Puntería)")
    + add(hasAbility(weapon, "precision") && !!tds.character && !extra.mortal, 1, "+1 herir (Precisión contra personaje)");
  const apMod = add(ranged && ads.abilities.includes("destructor") && tds.type === "infanteria", 1, "+1 penetración (Destructor)")
    + add(!extra.mortal && ads.abilities.includes("furiaPrimera") && dist <= FURY_RANGE + 1e-6, 1, "+1 penetración (Furia de la Primera, a 9\")");
  const damageMod = add(melee && charged && !hammer && ads.abilities.includes("aceleron"), 1, "+1 daño (Asalto a todo gas)");
  const extraAttacks = add(kind === "combate" && !extra.mortal && hasStrat(s, "frenesi", unitId), 1, "+1 ataque por miniatura (Frenesí)")
    + add(glory && !hasAbility(weapon, "ataquesExtra"), 3, "+3 ataques (Hora gloriosa)");
  if (extra.cover) notes.push("objetivo en cobertura (−1 a la HP)");
  const dome = (target.domeUntil ?? 0) > s.turn * 2 + s.active && (tds.profile.Inv ?? 7) > 4;
  if (dome) notes.push("invulnerable 4+ (Cúpula de fuerza)");
  if (underCommand(s, unitId) && !extra.overwatch) notes.push("repite los 1 al impactar (Sabiduría de los antiguos)");
  if (attacker.veteran && !extra.mortal) notes.push("repite los 1 al herir (veterana)");
  return {
    weapon: w, attackers: attackers.length,
    target: {
      profile: dome ? { ...tds.profile, Inv: 4 } : tds.profile,
      models: targetModels, type: tds.type,
    },
    distance: extra.distance, stationary: extra.stationary, cover: extra.cover,
    rerollHitOnes: underCommand(s, unitId) && !extra.overwatch,
    rerollWoundOnes: !!attacker.veteran && !extra.mortal,
    onlySixes: extra.overwatch,
    mortal: extra.mortal,
    woundMod, extraAttacks, hitMod, apMod, damageMod,
    notes,
  };
}

/** Furia de la Primera (11.ª): alcance en el que mejora la penetración. */
export const FURY_RANGE = 9;

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
  const fallen = s.pieces.filter((p) => slain.has(p.id));
  s.pieces = s.pieces.filter((p) => !slain.has(p.id));
  if (slain.size) recordCasualties(s, PLAYERS.indexOf(attacker.faction) as 0 | 1, targetId, slain.size);
  // Guardia de la hoja: el objetivo la usa para defenderse de la primera unidad que lo ataca
  if (kind === "combate" && !extra.mortal && tds.abilities.includes("guardiaHoja") && !(s.turnLog.fought ?? []).includes(targetId)
    && s.turnLog.guarded?.[targetId] === undefined) s.turnLog.guarded = { ...(s.turnLog.guarded ?? {}), [targetId]: unitId };

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
  afterAttack(s, kind, unitId, attackers, weapon, targetId, extra, res, fallen);
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

/** Lo que pasa después de un ataque (11.ª): explosiones, peligro, moral forzada, PM por personajes. */
function afterAttack(s: GameState, kind: AttackLogEntry["kind"], unitId: string, attackers: Piece[], weapon: Weapon,
  targetId: string, extra: AttackExtra, res: AttackResult, fallen: Piece[]) {
  const ads = DATASHEETS[s.units.find((u) => u.id === unitId)!.datasheet];
  const tds = DATASHEETS[s.units.find((u) => u.id === targetId)!.datasheet];
  for (const p of fallen) deadlyDemise(s, targetId, p);
  if (!extra.mortal) hazardRolls(s, unitId, weapon, attackers.length);
  if (extra.mortal) return;
  if (fallen.length && tds.character && ads.abilities.includes("tentaculos")) {
    const i = PLAYERS.indexOf(s.units.find((u) => u.id === unitId)!.faction);
    s.cp = [...s.cp] as [number, number];
    s.cp[i] += 1;
    note(s, "estratagema", `${ads.name} devora a ${tds.name}: +1 PM (Tentáculos devoradores)`, i as 0 | 1);
  }
  if (kind === "disparo" && !extra.overwatch && res.hits > 0 && ads.abilities.includes("gritoMortal") && unitModels(s, targetId).length)
    battleShockTest(s, targetId, -1, "Grito de muerte");
}

const fmt = (v: number) => `${v.toFixed(1).replace(".", ",")}"`;
