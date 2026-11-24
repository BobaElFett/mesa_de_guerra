import { GameState, Piece } from "../core/state";
import { AttackInput, effectiveAp, hitSkill, resolveAttack, saveTarget, SeededDice, woundTarget } from "./attack";
import { hasAbility, Weapon } from "./datasheets";
import { AttackExtra, AttackLogEntry, attackInput } from "./shooting";

// Vista previa de un ataque (#127): las tiradas que hacen falta y lo que cabe esperar, sacado de
// simular el ataque de verdad (con los mismos modificadores que tendrá al tirarlo), no de una
// estimación aparte. Pura: no toca el estado.

export interface AttackStep {
  kind: AttackLogEntry["kind"];
  unit: string;
  attackers: Piece[];
  weapon: Weapon;
  target: string;
  extra?: AttackExtra;
}

export interface StepPreview {
  /** Ataques por término medio. */
  attacks: number;
  /** Tirada para impactar ("auto" si impacta solo, 6 en fuego defensivo). */
  hitOn: number | "auto";
  /** Tirada para herir (null en heridas mortales). */
  woundOn: number | null;
  /** Salvación del objetivo (null si no tiene). */
  saveOn: number | null;
  /** Bajas y heridas que quita, por término medio. */
  kills: number;
  damage: number;
  notes: string[];
}

export interface Preview {
  steps: StepPreview[];
  kills: number;
  damage: number;
  /** Probabilidad de destruir la unidad entera. */
  wipe: number;
  /** Miniaturas que tiene ahora el objetivo. */
  models: number;
}

const clamp1 = (v: number | undefined) => Math.max(-1, Math.min(1, v ?? 0));

/** Tiradas que hacen falta, a partir de la entrada del ataque. */
export function rollsNeeded(input: AttackInput): Pick<StepPreview, "hitOn" | "woundOn" | "saveOn"> {
  const w = input.weapon;
  const skill = hitSkill(w, input.cover);
  const hitOn: number | "auto" = hasAbility(w, "torrente") || skill === null ? "auto" : input.onlySixes ? 6
    : Math.max(2, input.failBelow ?? 2, Math.min(6, skill - clamp1((input.hitMod ?? 0) + (hasAbility(w, "pesada") && input.stationary ? 1 : 0))));
  const woundOn = input.mortal ? null
    : Math.max(2, Math.min(6, Math.min(woundTarget(w.strength, input.target.profile.T), hasAbility(w, "veneno") ? 4 : 6) - clamp1(input.woundMod)));
  const saveOn = input.mortal ? null : saveTarget(input.target.profile, effectiveAp(w, input.apMod));
  return { hitOn, woundOn, saveOn };
}

/**
 * Simula `runs` veces los ataques, uno detrás de otro y contra el mismo objetivo (las bajas del
 * primero cuentan para el segundo), y devuelve las medias. Mismo resultado para el mismo estado.
 */
export function previewAttacks(s: GameState, steps: AttackStep[], runs = 300): Preview {
  const target = steps[0]?.target;
  const models = target ? s.pieces.filter((p) => p.unit === target).length : 0;
  const inputs = steps.map((st) => attackInput(s, st.kind, st.unit, st.attackers, st.weapon, st.target, st.extra ?? {}));
  const out: StepPreview[] = inputs.map((inp) => ({ attacks: 0, kills: 0, damage: 0, notes: inp.notes, ...rollsNeeded(inp) }));
  if (!steps.length || !models) return { steps: out, kills: 0, damage: 0, wipe: 0, models };
  let wipes = 0;
  const dice = new SeededDice((s.rng ^ 0x5bd1e995) >>> 0 || 1);
  for (let r = 0; r < runs; r++) {
    const left: Record<string, number> = {};
    for (const m of inputs[0].target.models) left[m.id] = m.woundsLeft;
    inputs.forEach((inp, i) => {
      const alive = inp.target.models.filter((m) => left[m.id] > 0).map((m) => ({ id: m.id, woundsLeft: left[m.id] }));
      if (!alive.length) return;
      const before = alive.reduce((n, m) => n + m.woundsLeft, 0);
      const res = resolveAttack({ ...inp, target: { ...inp.target, models: alive } }, dice);
      for (const m of alive) left[m.id] = res.slain.includes(m.id) ? 0 : res.woundsLeft[m.id];
      const after = alive.reduce((n, m) => n + left[m.id], 0);
      out[i].attacks += res.attacks / runs;
      out[i].kills += res.slain.length / runs;
      out[i].damage += (before - after) / runs;
    });
    if (Object.values(left).every((v) => v <= 0)) wipes++;
  }
  return {
    steps: out,
    kills: out.reduce((n, x) => n + x.kills, 0),
    damage: out.reduce((n, x) => n + x.damage, 0),
    wipe: wipes / runs,
    models,
  };
}

/** Probabilidad de sacar `need` o más con 2D6 (con una repetición de la tirada entera si `reroll`). */
export function chance2d6(need: number, reroll = false): number {
  let ok = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= need) ok++;
  const p = ok / 36;
  return reroll ? 1 - (1 - p) * (1 - p) : p;
}

/** Texto corto de lo esperado: bajas, o heridas si el objetivo tiene varias y no caería ninguna. */
export function expectText(kills: number, damage: number, W: number): string {
  const n1 = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
  if (W > 1 && kills < 0.95) return `≈ ${n1(damage)} herida${Math.round(damage * 10) === 10 ? "" : "s"}`;
  return `≈ ${n1(kills)} baja${Math.round(kills * 10) === 10 ? "" : "s"}`;
}
