import type { Command } from "../core/commands";
import { Faction, GameState, PLAYERS } from "../core/state";
import { DATASHEETS } from "./datasheets";
import { shootingOptions } from "./shooting";
import { chargeOptions, fightOptions } from "./melee";
import { formation } from "./leaders";
import { hasStrat, stratBlocked } from "./stratagems";
import { attackValue, expectedAttack, meleeExpected, p2D6 } from "../ai/evaluate";
import { underCommand } from "./leaders";
import { movedSoFar } from "./movement";

// Acciones sobre el tablero (#46) y guía de la fase (#47): qué puede hacer una unidad contra
// un enemigo concreto, con sus probabilidades, y qué unidades aún tienen algo que hacer.

export interface BoardAction {
  /** Texto principal (arma, «Cargar», «Combatir»). */
  label: string;
  /** Detalle: probabilidades y daño esperado, o por qué no se puede. */
  detail: string;
  cmd: Command | null;
  blocked?: string;
  /** Para ordenar: valor esperado en puntos. */
  value: number;
}

const name = (s: GameState, id: string) => DATASHEETS[s.units.find((u) => u.id === id)!.datasheet].name;
const fmt = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: n < 10 ? 1 : 0 });
const pct = (p: number) => `${Math.round(p * 100)} %`;

/** Unidades de la formación de la selección (si es una sola formación de unidades). */
export function selectedFormation(s: GameState, selected: Iterable<string>): string[] | null {
  const units = new Set<string>();
  for (const id of selected) { const p = s.pieces.find((x) => x.id === id); if (p?.unit) units.add(p.unit); }
  if (!units.size) return null;
  const f = formation(s, [...units][0]);
  return [...units].every((u) => f.includes(u)) ? f : null;
}

/** Lo que pueden hacer las unidades `actor` contra la unidad `target` en la fase en curso. */
export function actionsAgainst(s: GameState, actor: string[], target: string): BoardAction[] {
  const out: BoardAction[] = [];
  if (!s.rulesMode || s.gameOver || !actor.length) return out;
  const tName = name(s, target);
  if (s.phase === "disparo") {
    for (const u of actor) {
      const o = shootingOptions(s, u);
      if (o.blocked) { out.push({ label: name(s, u), detail: o.blocked, cmd: null, blocked: o.blocked, value: 0 }); continue; }
      const stationary = !s.turnLog.moves[u] || movedSoFar(s, u) < 0.01;
      for (const w of o.weapons) {
        const t = w.targets.find((x) => x.unit === target);
        const label = `${w.weapon.name}${actor.length > 1 ? ` (${name(s, u)})` : ""}`;
        const why = w.fired ? "Ya ha disparado." : w.blocked ?? (t ? t.blocked : "Fuera de alcance o sin visión.");
        if (why || !t) { out.push({ label, detail: why ?? "", cmd: null, blocked: why ?? "", value: 0 }); continue; }
        const e = expectedAttack(s, w.weapon, t.attackers.length, target, {
          distance: t.distance, stationary, cover: t.cover, rerollHitOnes: underCommand(s, u), woundMod: hasStrat(s, "punteria", u) ? 1 : 0,
        });
        out.push({
          label, cmd: { type: "shoot", unit: u, weapon: w.weapon.id, target },
          detail: `${t.attackers.length} disparan · ~${fmt(e.damage)} heridas · ~${fmt(e.kills)} bajas${t.cover ? " · en cobertura" : ""}`,
          value: attackValue(s, target, e),
        });
      }
    }
  } else if (s.phase === "carga") {
    const head = actor[0];
    const o = chargeOptions(s, head);
    const t = o.targets.find((x) => x.unit === target);
    const why = o.done ? "Ya ha cargado este turno." : o.blocked ?? (t ? t.blocked : "Demasiado lejos (más de 12\").");
    if (why || !t) out.push({ label: `Cargar a ${tName}`, detail: why ?? "", cmd: null, blocked: why ?? "", value: 0 });
    else {
      const p = p2D6(t.need);
      const imp = !stratBlocked(s, "impetu", head) ? ` · con Ímpetu (1 PM) ${pct(1 - (1 - p) * (1 - p))}` : hasStrat(s, "impetu", head) ? " · Ímpetu activa" : "";
      const p2 = hasStrat(s, "impetu", head) ? 1 - (1 - p) * (1 - p) : p;
      out.push({ label: `Cargar a ${tName}`, cmd: { type: "charge", unit: head, target }, detail: `a ${fmt(t.distance)}": 2D6 ≥ ${t.need} → ${pct(p2)}${imp}`, value: p2 * 100 });
    }
  } else if (s.phase === "combate") {
    for (const u of actor) {
      const o = fightOptions(s, u);
      const t = o.targets.find((x) => x.unit === target);
      const label = `Combatir${actor.length > 1 ? ` (${name(s, u)})` : ""}`;
      const why = o.blocked ?? (t ? undefined : "No está trabada con esa unidad.");
      if (why) { out.push({ label, detail: why, cmd: null, blocked: why, value: 0 }); continue; }
      const e = meleeExpected(s, u, target, 0.9, hasStrat(s, "furia", u) ? 1 : 0);
      out.push({ label, cmd: { type: "fight", unit: u, target }, detail: `~${fmt(e.damage)} heridas · ~${fmt(e.kills)} bajas`, value: attackValue(s, target, e) });
    }
  }
  return out;
}

/** Unidades enemigas contra las que la selección tiene alguna acción posible ahora. */
export function validTargets(s: GameState, actor: string[]): Set<string> {
  const out = new Set<string>();
  if (!s.rulesMode || s.gameOver || !["disparo", "carga", "combate"].includes(s.phase)) return out;
  const mine = s.units.find((u) => u.id === actor[0])?.faction;
  for (const u of s.units) {
    if (u.faction === mine || !s.pieces.some((p) => p.unit === u.id)) continue;
    if (actionsAgainst(s, actor, u.id).some((a) => a.cmd)) out.add(u.id);
  }
  return out;
}

/** Unidades de `f` que aún tienen algo que hacer en la fase en curso (para resaltarlas). */
export function pendingUnits(s: GameState, f: Faction): string[] {
  if (!s.rulesMode || s.gameOver) return [];
  const own = s.units.filter((u) => u.faction === f && s.pieces.some((p) => p.unit === u.id));
  const heads = own.filter((u) => formation(s, u.id)[0] === u.id);
  const enemyIds = s.units.filter((u) => u.faction !== f).map((u) => u.id);
  switch (s.phase) {
    case "movimiento":
      return PLAYERS[s.active] === f ? heads.filter((u) => !s.turnLog.moves[u.id]).map((u) => u.id) : [];
    case "disparo":
      if (PLAYERS[s.active] !== f) return [];
      return own.filter((u) => {
        const o = shootingOptions(s, u.id);
        return !o.blocked && o.weapons.some((w) => !w.fired && !w.blocked && w.targets.some((t) => !t.blocked));
      }).map((u) => u.id);
    case "carga":
      if (PLAYERS[s.active] !== f) return [];
      return heads.filter((u) => { const o = chargeOptions(s, u.id); return !o.blocked && !o.done && o.targets.some((t) => !t.blocked); }).map((u) => u.id);
    case "combate":
      return own.filter((u) => { const o = fightOptions(s, u.id); return !o.blocked && o.targets.some((t) => enemyIds.includes(t.unit)); }).map((u) => u.id);
    default: return [];
  }
}

const VERB: Partial<Record<GameState["phase"], string>> = {
  movimiento: "Quedan por mover", disparo: "Pueden disparar", carga: "Pueden cargar", combate: "Pueden combatir",
};

/** Frase de la guía: lo que queda por hacer (o null). */
export function pendingText(s: GameState, f: Faction): string | null {
  const ids = pendingUnits(s, f);
  const verb = VERB[s.phase];
  if (!verb) return null;
  if (!ids.length) return s.phase === "combate" ? null : "Nada más que hacer en esta fase.";
  // Con el número de miniaturas si hay dos unidades con el mismo nombre
  const names = ids.map((id) => {
    const n = name(s, id);
    const twin = ids.some((o) => o !== id && name(s, o) === n);
    return twin ? `${n} (${s.pieces.filter((p) => p.unit === id).length})` : n;
  });
  const shown = names.length > 3 ? `${names.slice(0, 3).join(", ")} y ${names.length - 3} más` : names.join(", ");
  return `${verb}: ${shown}.`;
}
