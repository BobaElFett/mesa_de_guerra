import { Command, CommandBus } from "../core/commands";
import { Faction, PLAYERS } from "../core/state";
import { aiLastAction, aiStep, canFight, fightStep } from "./tactics";

// Sugerir jugada (#59): lo que haría la IA Difícil ahora mismo, sin hacerlo. Se ejecuta un paso de
// la IA sobre un bus de prueba cuyo gancho `remote` se queda con las órdenes y no aplica ninguna:
// la mesa no cambia y la semilla de los dados no avanza.

export interface Suggestion {
  /** Lo que haría, en una frase. */
  text: string;
  /** La unidad que actuaría (null si lo mejor es pasar de fase). */
  unit: string | null;
  /** Las órdenes que daría (movimientos, disparo, carga…), para dibujarlas. */
  cmds: Command[];
}

const ACTS = new Set<Command["type"]>(["moveMany", "shoot", "charge", "fight", "arrive", "stratagem", "declareMove"]);

export function suggest(bus: CommandBus, side?: Faction): Suggestion {
  const s = bus.state;
  if (!s.rulesMode || s.gameOver) return { text: "No hay partida en curso.", unit: null, cmds: [] };
  if (s.pendingCharge) return { text: "Primero, decide si haces fuego defensivo contra la carga.", unit: null, cmds: [] };
  if (s.phase === "despliegue") return { text: "Coloca tus unidades en tu zona (o déjalas como están) y pulsa «Empezar partida».", unit: null, cmds: [] };
  const scratch = new CommandBus(bus.seed);
  scratch.state = s;
  const cmds: Command[] = [];
  scratch.remote = (op) => { if (op.k === "cmd") cmds.push(op.cmd); return true; };
  let acted: boolean;
  if (s.phase === "combate") {
    const act = PLAYERS[s.active];
    const f = side ?? (canFight(s, act) ? act : act === "legion" ? "swarm" : "legion");
    acted = canFight(s, f) && fightStep(scratch, f, "dificil");
  } else {
    acted = aiStep(scratch, "dificil");
  }
  const real = cmds.filter((c) => ACTS.has(c.type));
  if (!acted || !real.length) return { text: "No queda nada que merezca la pena en esta fase: pasa a la siguiente.", unit: null, cmds: [] };
  const unit = real.map((c) => ("unit" in c ? c.unit : null)).find(Boolean)
    ?? (() => { const mv = real.find((c) => c.type === "moveMany") as Extract<Command, { type: "moveMany" }> | undefined; return mv ? s.pieces.find((p) => p.id === mv.moves[0]?.id)?.unit ?? null : null; })();
  // La frase de la IA describe el resultado de la carga si se hubiera tirado: aquí no se tira
  const text = aiLastAction().replace(/: 2D6 = .*$/, "");
  return { text, unit: unit ?? null, cmds: real };
}
