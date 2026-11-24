import { nextRandom } from "../core/rng";
import { Dice, Profile, Weapon, hasAbility, abilityX, parseDice, UnitType } from "./datasheets";

// Secuencia de ataque del reglamento v0.1: impactar → herir → salvar → daño.
// Pura: los dados salen de un DiceSource (el RNG con semilla del estado, o dados fijos en
// las pruebas), así que la misma partida da siempre el mismo resultado.

export interface DiceSource {
  d6(): number;
}

/** Dados a partir del estado del RNG; `state` avanza con cada tirada. */
export class SeededDice implements DiceSource {
  constructor(public state: number) {}
  d6(): number {
    const [v, n] = nextRandom(this.state);
    this.state = n;
    return Math.floor(v * 6) + 1;
  }
}

/** Dados fijos para pruebas: devuelve la lista en orden y falla si se acaba. */
export class ScriptedDice implements DiceSource {
  private i = 0;
  constructor(private values: number[]) {}
  d6(): number {
    if (this.i >= this.values.length) throw new Error("ScriptedDice: no quedan dados");
    return this.values[this.i++];
  }
  get used() { return this.i; }
}

export function rollDiceExpr(d: Dice, dice: DiceSource): number {
  if (typeof d === "number") return d;
  const { n, sides, plus } = parseDice(d);
  let t = plus;
  for (let i = 0; i < n; i++) { const v = dice.d6(); t += sides === 3 ? Math.ceil(v / 2) : v; }
  return t;
}

/** Tirada necesaria para herir según la tabla Fuerza contra Resistencia. */
export function woundTarget(S: number, T: number): number {
  if (S >= 2 * T) return 2;
  if (S > T) return 3;
  if (S === T) return 4;
  if (S * 2 <= T) return 6;
  return 5;
}

/**
 * Tirada de salvación a superar (2–6), o null si no hay salvación posible.
 * La penetración empeora la armadura; la invulnerable no cambia. Se usa la mejor.
 * (En la 11.ª la cobertura ya no mejora la salvación: empeora la HP del atacante, ver `hitSkill`.)
 */
export function saveTarget(p: Profile, ap: number): number | null {
  let armor = p.Sv - ap;                 // ap es 0 o negativa: −1 convierte 3+ en 4+
  armor = Math.max(2, armor);
  const options = [armor <= 6 ? armor : null, p.Inv ?? null].filter((x): x is number => x !== null);
  return options.length ? Math.min(...options) : null;
}

export interface TargetModel { id: string; woundsLeft: number }

export interface AttackInput {
  weapon: Weapon;
  /** Miniaturas que disparan o golpean con esta arma. */
  attackers: number;
  target: { profile: Profile; models: TargetModel[]; armored?: boolean; type?: UnitType };
  /** Distancia al objetivo, para Ráfaga. */
  distance?: number;
  /** La unidad atacante no se ha movido (Pesada). */
  stationary?: boolean;
  /** El objetivo tiene cobertura. */
  cover?: boolean;
  /** Modificador al impactar (se limita a ±1). */
  hitMod?: number;
  /** Modificador al herir (se limita a ±1). */
  woundMod?: number;
  /** Repetir los 1 al impactar (Al mando). */
  rerollHitOnes?: boolean;
  /** Veterana (#71): repite los 1 al herir. */
  rerollWoundOnes?: boolean;
  /** Fuego defensivo: solo impacta con 6 (sin modificadores). Torrente sigue impactando solo. */
  onlySixes?: boolean;
  /** Ataques de más por miniatura (Frenesí, #123). */
  extraAttacks?: number;
  /** Heridas mortales: cada impacto hiere solo y no hay salvación (Granadas). */
  mortal?: boolean;
  /** Mejora de la penetración (Destructor, Furia de la Primera). */
  apMod?: number;
  /** Daño de más por herida (Asalto a todo gas). */
  damageMod?: number;
}

/** Tirada para impactar del arma con la cobertura de la 11.ª: el objetivo en cobertura empeora 1 la HP. */
export function hitSkill(weapon: Weapon, cover: boolean | undefined): number | null {
  if (weapon.skill === null) return null;
  return weapon.skill + (cover && !hasAbility(weapon, "ignoraCobertura") ? 1 : 0);
}

/** Penetración efectiva: la del arma mejorada por `apMod` (nunca a mejor que 0 hacia arriba). */
export function effectiveAp(weapon: Weapon, apMod = 0): number {
  return weapon.ap - Math.max(0, apMod);
}

/** Con qué tirada sin modificar es crítica la herida (6, o menos con Anti contra su tipo). */
export function critWoundOn(weapon: Weapon, targetType: UnitType | undefined): number {
  let on = 6;
  for (const a of weapon.abilities) if (a.kind === "anti" && a.vs === targetType) on = Math.min(on, a.x);
  return on;
}

export interface AttackResult {
  attacks: number;
  hitRolls: number[];          // tiradas para impactar tras repetir (vacía con Torrente)
  hits: number;                // impactos totales (incluidos los de Sostenida)
  criticalHits: number;
  autoWounds: number;          // impactos críticos con Letal
  woundRolls: number[];
  wounds: number;              // heridas totales (incluidas las de Letal)
  criticalWounds: number;      // heridas críticas (Devastadora no permite salvar)
  saveTarget: number | null;
  saveRolls: number[];
  failedSaves: number;
  damageRolls: number[];
  /** Daño final por miniatura y si cae. */
  allocations: { id: string; damage: number; slain: boolean }[];
  slain: string[];
  /** Heridas que quedan a cada miniatura del objetivo después del ataque. */
  woundsLeft: Record<string, number>;
}

const clamp1 = (v: number | undefined) => Math.max(-1, Math.min(1, v ?? 0));

export function resolveAttack(input: AttackInput, dice: DiceSource): AttackResult {
  const { weapon, target } = input;
  const res: AttackResult = {
    attacks: 0, hitRolls: [], hits: 0, criticalHits: 0, autoWounds: 0, woundRolls: [], wounds: 0, criticalWounds: 0,
    saveTarget: null, saveRolls: [], failedSaves: 0, damageRolls: [], allocations: [], slain: [], woundsLeft: {},
  };
  for (const m of target.models) res.woundsLeft[m.id] = m.woundsLeft;

  // --- Ataques ---------------------------------------------------------------
  const alive = target.models.filter((m) => m.woundsLeft > 0).length;
  const range = typeof weapon.range === "number" ? weapon.range : 0;
  let perModelBonus = input.extraAttacks ?? 0;
  if (hasAbility(weapon, "rafaga") && input.distance !== undefined && range > 0 && input.distance <= range / 2) perModelBonus += abilityX(weapon, "rafaga");
  if (hasAbility(weapon, "explosiva")) perModelBonus += Math.floor(alive / 5);
  const half = input.distance !== undefined && range > 0 && input.distance <= range / 2;
  for (let i = 0; i < input.attackers; i++) res.attacks += rollDiceExpr(weapon.attacks, dice) + perModelBonus;

  // --- Impactar ------------------------------------------------------------------
  let hits = 0, crits = 0;
  const skill = hitSkill(weapon, input.cover);
  if (hasAbility(weapon, "torrente") || skill === null) {
    hits = res.attacks;
  } else {
    const mod = clamp1((input.hitMod ?? 0) + (hasAbility(weapon, "pesada") && input.stationary ? 1 : 0));
    for (let i = 0; i < res.attacks; i++) {
      let r = dice.d6();
      if (r === 1 && input.rerollHitOnes) r = dice.d6();
      res.hitRolls.push(r);
      const crit = r === 6;
      const ok = input.onlySixes ? crit : r !== 1 && (crit || r + mod >= skill);
      if (!ok) continue;
      hits++;
      if (crit) crits++;
    }
  }
  const sustained = hasAbility(weapon, "sostenida") ? crits * abilityX(weapon, "sostenida") : 0;
  res.criticalHits = crits;
  res.hits = hits + sustained;

  // --- Herir -----------------------------------------------------------------------
  const lethal = hasAbility(weapon, "letal") ? crits : 0;
  res.autoWounds = lethal;
  const toWound = Math.min(woundTarget(weapon.strength, target.profile.T), hasAbility(weapon, "veneno") ? 4 : 6);
  const wmod = clamp1(input.woundMod);
  const critOn = critWoundOn(weapon, target.type);
  const twin = hasAbility(weapon, "gemela");
  let wounds = lethal, critWounds = 0;
  if (input.mortal) wounds = res.hits;
  const woundOk = (r: number) => r !== 1 && (r >= critOn || r + wmod >= toWound);
  for (let i = 0; i < (input.mortal ? 0 : res.hits - lethal); i++) {
    let r = dice.d6();
    if (twin ? !woundOk(r) : r === 1 && input.rerollWoundOnes) r = dice.d6();   // Gemela: repite la fallada
    res.woundRolls.push(r);
    const crit = r >= critOn;
    if (r !== 1 && (crit || r + wmod >= toWound)) {
      wounds++;
      if (crit) critWounds++;
    }
  }
  res.wounds = wounds;
  res.criticalWounds = critWounds;

  // --- Salvar y dañar, herida a herida -----------------------------------------------
  const sv = input.mortal ? null : saveTarget(target.profile, effectiveAp(weapon, input.apMod));
  res.saveTarget = sv;
  const devastating = hasAbility(weapon, "devastadora") ? critWounds : 0;
  const order = allocationOrder(target.models, res.woundsLeft, target.profile.W);
  const dmgBy = new Map<string, number>();
  let cursor = 0;
  for (let i = 0; i < wounds; i++) {
    // Primero se gastan las heridas devastadoras (sin salvación)
    let saved = false;
    if (i >= devastating && sv !== null) {
      const r = dice.d6();
      res.saveRolls.push(r);
      saved = r !== 1 && r >= sv;
    }
    if (saved) continue;
    res.failedSaves++;
    while (cursor < order.length && res.woundsLeft[order[cursor]] <= 0) cursor++;
    if (cursor >= order.length) continue;     // ya no quedan miniaturas: el resto se pierde
    let dmg = rollDiceExpr(weapon.damage, dice) + (input.mortal ? 0 : (input.damageMod ?? 0))
      + (hasAbility(weapon, "fusion") && half && !input.mortal ? abilityX(weapon, "fusion") : 0);
    res.damageRolls.push(dmg);
    if (target.armored) dmg = Math.max(1, dmg - 1);
    const id = order[cursor];
    const dealt = Math.min(dmg, res.woundsLeft[id]);   // el daño que sobra se pierde
    res.woundsLeft[id] -= dealt;
    dmgBy.set(id, (dmgBy.get(id) ?? 0) + dealt);
    if (res.woundsLeft[id] <= 0) res.slain.push(id);
  }
  for (const [id, damage] of dmgBy) res.allocations.push({ id, damage, slain: res.woundsLeft[id] <= 0 });
  return res;
}

/** Orden de reparto: primero las miniaturas ya heridas, luego el resto en su orden. */
function allocationOrder(models: TargetModel[], left: Record<string, number>, full: number): string[] {
  const alive = models.filter((m) => left[m.id] > 0);
  return [...alive.filter((m) => left[m.id] < full), ...alive.filter((m) => left[m.id] >= full)].map((m) => m.id);
}
