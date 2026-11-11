import type { CommandBus } from "../core/commands";
import { BOARD, DEPLOY_DEPTH, exampleMap, GameState } from "../core/state";
import type { ArmyList } from "../rules/armies";
import { formation } from "../rules/leaders";
import { movedSoFar } from "../rules/movement";
import { saveSettings, settings } from "../ai/settings";

// Tutorial guiado (#48): una partida corta contra la IA Fácil, paso a paso. Cada paso explica
// una cosa y espera a que el jugador la haga (o a que pulse Siguiente si solo es para leer).

const $ = (id: string) => document.getElementById(id)!;

export const TUTORIAL_LEGION: ArmyList = { name: "Tutorial", units: [
  { datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 5 }, { datasheet: "fuegoPesado", models: 5 },
] };
export const TUTORIAL_SWARM: ArmyList = { name: "Tutorial", units: [
  { datasheet: "nodo", models: 3 }, { datasheet: "garras", models: 10 }, { datasheet: "garras", models: 10 }, { datasheet: "escupidores", models: 10 },
] };

export interface TutorialContext { s: GameState; selected: Set<string>; /** Cosas que ha hecho el jugador fuera del estado (Sugerir, línea de visión). */ flags?: Set<string> }

interface Step {
  title: string;
  text: string;
  /** Hecho (pasa solo al siguiente). Sin `done`, hay botón «Siguiente». */
  done?: (c: TutorialContext) => boolean;
}

const asaltoOf = (s: GameState) => s.units.find((u) => u.datasheet === "asalto" && u.faction === "legion")?.id;
const legionAttacksThisTurn = (s: GameState) => s.combatLog.some((e) => e.player === 0 && e.turn === s.turn && e.kind === "disparo");

const STEPS: Step[] = [
  { title: "Bienvenido a la mesa",
    text: "Llevas la <b>Legión Astral</b> (azul, en el borde de cerca); la IA, en Fácil, lleva <b>El Enjambre</b>. Mueve la cámara con <kbd>WASD</kbd> o el botón central, gira con <kbd>Q</kbd> <kbd>E</kbd> o el derecho, y acerca con la rueda." },
  { title: "Despliegue",
    text: "Antes de empezar puedes recolocar tus unidades dentro de tu franja azul (arrástralas). Cuando estés listo, pulsa <b>Empezar partida</b> en el panel de abajo.",
    done: ({ s }) => s.phase !== "despliegue" },
  { title: "Fase de mando",
    text: "Cada turno empieza en el <b>mando</b>: ganas 1 punto de mando (PM) para estratagemas y se chequea la moral de las unidades diezmadas. Pulsa <b>Siguiente fase</b>.",
    done: ({ s }) => s.phase !== "mando" || s.turn > 1 },
  { title: "Elige una unidad",
    text: "Haz clic en una miniatura de tu <b>Escuadra de Asalto Táctico</b>: se elige la unidad entera (con su Capitán, que la lidera) y los anillos azules marcan hasta dónde llega cada miniatura. Las unidades con anillo verde aún pueden actuar.",
    done: ({ s, selected }) => { const a = asaltoOf(s); return !!a && s.pieces.some((p) => selected.has(p.id) && formation(s, a).includes(p.unit!)); } },
  { title: "Muévela",
    text: "Arrástrala hacia el objetivo del centro (el faro sobre el búnker). No puede pasar de su movimiento (6\"), ni atravesar el búnker o los contenedores, ni acabar a 1\" de un enemigo.",
    done: ({ s }) => { const a = asaltoOf(s); return !!a && movedSoFar(s, a) > 1; } },
  { title: "El resto del ejército",
    text: "Mueve las demás si quieres (<kbd>Tab</kbd> salta a la siguiente que aún puede mover). La Escuadra de Fuego Pesado dispara mejor si no se mueve. Luego pulsa <b>Siguiente fase</b>.",
    done: ({ s }) => s.phase === "disparo" || s.turn > 1 },
  { title: "Disparar",
    text: "Elige una unidad tuya y pasa el ratón por encima de un enemigo: verás las heridas y bajas esperadas. <b>Haz clic en el enemigo</b> y elige el arma en el menú.",
    done: ({ s }) => legionAttacksThisTurn(s) || s.turn > 1 },
  { title: "Los dados",
    text: "Los dados ruedan en la bandeja: <b>impactar</b>, <b>herir</b> (fuerza contra resistencia) y <b>salvar</b> (la armadura del objetivo). Dispara con el resto y pulsa <b>Siguiente fase</b>. Si tienes PM, prueba la estratagema <b>Granadas</b> contra un enemigo a 8\".",
    done: ({ s }) => s.phase === "carga" || s.turn > 1 },
  { title: "Cargar y combatir",
    text: "Si hay un enemigo a 12\" o menos, puedes <b>cargarle</b> (2D6: hay que sacar la distancia). Quien carga golpea primero en el <b>combate</b>. Si no hay nadie cerca, pulsa <b>Siguiente fase</b> hasta <b>Terminar turno</b>.",
    done: ({ s }) => s.active === 1 || s.turn > 1 },
  { title: "Turno de la IA",
    text: "Ahora juega el Enjambre: la cámara le sigue y cada disparo se ve con sus dados. Si te cargan, te preguntará si quieres hacer <b>fuego defensivo</b>. El <b>Registro</b> (<kbd>L</kbd>) apunta todo lo que pasa.",
    done: ({ s }) => s.turn >= 2 && s.active === 0 },
  { title: "Puntos de victoria",
    text: "Desde la ronda 2, al empezar tu turno ganas PV por cada objetivo que controles (más CO a 3\" que el rival). Los ves arriba a la derecha. Gana quien tenga más PV tras la ronda 5. <b>Ya sabes lo básico: ¡a por ellos!</b>" },
];

// --- Lección 2 (#73): reservas, Sugerir, línea de visión y estratagemas -------------------
export const LESSON2_LEGION: ArmyList = { name: "Lección 2", units: [
  { datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 },
  { datasheet: "exterminadores", models: 5, reserve: true },
] };
export const LESSON2_SWARM: ArmyList = { name: "Lección 2", units: [
  { datasheet: "tirano", models: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "escupidores", models: 10 },
] };
const extOf = (s: GameState) => s.units.find((u) => u.datasheet === "exterminadores")?.id;

const STEPS2: Step[] = [
  { title: "Lección 2: herramientas del general",
    text: "Empezamos en la <b>ronda 2</b>. Tus <b>Exterminadores</b> esperan en órbita (reserva) y el Enjambre avanza. Verás cómo traerlos, cómo pedir consejo, la línea de visión y las estratagemas. Pulsa <b>Siguiente fase</b> para pasar al movimiento." ,
    done: ({ s }) => s.phase === "movimiento" },
  { title: "Reservas",
    text: "En el panel de turno aparece <b>Llegar: Exterminadores</b>. Púlsalo y haz clic en la mesa: lo rojo es la zona prohibida (a 9\" o menos de un enemigo) y lo verde, dónde caerían. Llegar cuenta como su movimiento.",
    done: ({ s }) => { const e = extOf(s); return !!e && s.pieces.some((p) => p.unit === e); } },
  { title: "Pide consejo",
    text: "¿No sabes qué hacer? Pulsa <b>Sugerir</b> (o <kbd>H</kbd>): en dorado verás lo que haría la IA Difícil (quién, adónde y contra quién). No hace nada; tú decides.",
    done: ({ flags }) => !!flags?.has("suggest") },
  { title: "Al disparo",
    text: "Mueve lo que quieras y pulsa <b>Siguiente fase</b> hasta el <b>disparo</b>.",
    done: ({ s }) => s.phase === "disparo" },
  { title: "Línea de visión",
    text: "Elige tu Escuadra de Asalto y pasa el ratón por un enemigo: cada miniatura traza su línea. <span style=\"color:#6dff8a\">Verde</span> lo ve, <span style=\"color:#ffb34a\">naranja</span> con cobertura (salva mejor), <span style=\"color:#ff4a3a\">roja</span> no lo ve y gris discontinua, fuera de alcance.",
    done: ({ flags }) => !!flags?.has("los") },
  { title: "Estratagemas",
    text: "Con tu unidad elegida, en su ficha (abajo a la izquierda) están las <b>estratagemas</b>. Usa <b>Puntería</b> (1 PM: +1 para herir esta fase) y luego dispara.",
    done: ({ s }) => (s.turnLog.strats ?? []).some((x) => x.id === "punteria") || s.phase !== "disparo" },
  { title: "Ya eres un general",
    text: "Eso es todo. Más ayudas: <kbd>?</kbd> enseña los atajos, el <b>Registro</b> (<kbd>L</kbd>) apunta cada tirada y, al acabar, <b>Ver repetición</b> vuelve a jugar la batalla. Prueba la <b>Campaña</b> desde el menú." },
];

// --- Lección 3 (#109): órdenes secundarias, infiltración, precisión y vuelo -------------------
export const LESSON3_LEGION: ArmyList = { name: "Lección 3", units: [
  { datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 },
  { datasheet: "francotiradores", models: 5 },
] };
export const LESSON3_SWARM: ArmyList = { name: "Lección 3", units: [
  { datasheet: "mente", models: 1, leads: 1 }, { datasheet: "garras", models: 20 }, { datasheet: "gargolas", models: 10 },
] };
const sniperOf = (s: GameState) => s.units.find((u) => u.datasheet === "francotiradores")?.id;

const STEPS3: Step[] = [
  { title: "Lección 3: tropas especiales y órdenes",
    text: "Llevas <b>Francotiradores</b>, que se <b>infiltran</b>: pueden desplegar en toda tu mitad a más de 6\" del centro (la franja azul más tenue). Arrastra a los Francotiradores hacia delante por tu <b>flanco izquierdo</b>: desde ahí verán a la Mente por el lado del búnker.",
    done: ({ s }) => { const u = sniperOf(s); return !!u && s.pieces.some((p) => p.unit === u && p.z < BOARD.d / 2 - DEPLOY_DEPTH - 1); } },
  { title: "Empieza",
    text: "Coloca el resto como quieras y pulsa <b>Empezar partida</b>.",
    done: ({ s }) => s.phase !== "despliegue" },
  { title: "Órdenes secundarias",
    text: "En el panel de la misión (arriba a la derecha) tienes 2 <b>órdenes</b>: objetivos extra que dan PV si los cumples al acabar tu turno. Una <span style=\"color:#7be08a\">✓</span> dice que se cumpliría ya. Si una no te conviene, el botón <b>+1 PM</b> la descarta y te da un punto de mando (una vez por turno). Al empezar cada mando robas hasta tener 2." },
  { title: "La Mente y su escolta",
    text: "La <b>Mente del Enjambre</b> va unida a sus Garras: sus escoltas la protegen y el resto de tu ejército no puede dispararle. Pero el <b>Rifle de precisión</b> sí: ignora la cobertura y hiere mejor a los personajes. Pasa a la fase de <b>disparo</b>.",
    done: ({ s }) => s.phase === "disparo" || s.turn > 1 },
  { title: "Dispara a la cabeza",
    text: "Elige a los Francotiradores y haz clic en la <b>Mente</b> (la figura de cabeza enorme entre las Garras). Al pasar el ratón verás las bajas esperadas. Si no la ven, dispara a otra cosa y sigue.",
    done: ({ s }) => s.combatLog.some((e) => e.player === 0 && e.turn === s.turn && e.attacker === sniperOf(s)) || s.phase !== "disparo" },
  { title: "Gárgolas",
    text: "Termina tu turno. Las <b>Gárgolas</b> del Enjambre <b>vuelan</b>: pasan por encima de contenedores, búnker y barricadas. Ojo con tus flancos.",
    done: ({ s }) => s.turn >= 2 && s.active === 0 },
  { title: "Qué ha pasado",
    text: "La tarjeta de abajo resume el turno del rival: tus bajas, sus PV, sus cargas y órdenes. Los <b>iconos</b> sobre cada unidad dicen qué ha hecho este turno (mover, disparar, cargar…). Los dos se pueden apagar en Ajustes." },
  { title: "¡Listo!",
    text: "Ya conoces todo lo nuevo. Las órdenes secundarias vienen marcadas en la <b>partida rápida</b>; el <b>Códice</b> del menú explica cada unidad." },
];

export class Tutorial {
  private i = -1;
  private steps: Step[] = STEPS;
  onStart: () => void = () => {};

  constructor(private bus: CommandBus) {
    $("tutorial").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      if (b.dataset.act === "next") this.go(this.i + 1);
      if (b.dataset.act === "l1") this.start(1);
      if (b.dataset.act === "l2") this.start(2);
      if (b.dataset.act === "l3") this.start(3);
      if (b.dataset.act === "close") this.stop();
    });
    $("tutorial-start").addEventListener("click", () => this.start());
  }

  get active() { return this.i >= 0; }
  /** Algo que no se ve en el estado (Sugerir, línea de visión): puede completar un paso. */
  flag(f: string) { this.flags.add(f); }
  private flags = new Set<string>();

  /** Sin lección: deja elegir. */
  start(lesson?: 1 | 2 | 3) {
    if (!lesson) {
      this.i = -2;
      $("tutorial").hidden = false;
      $("tutorial").innerHTML = `<div class="row"><span class="dim">Tutorial</span><button data-act="close" style="margin-left:auto">Cerrar</button></div>
        <h3>Elige una lección</h3>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px"><button data-act="l1" class="primary">1 · Lo básico (5 min)</button><button data-act="l2">2 · Reservas, consejos y estratagemas</button><button data-act="l3">3 · Órdenes y tropas especiales</button></div>`;
      return;
    }
    settings.aiSide = "swarm";
    settings.aiLevel = "facil";
    settings.mission = "tomar";
    saveSettings();
    this.steps = lesson === 1 ? STEPS : lesson === 2 ? STEPS2 : STEPS3;
    this.bus.dispatch({ type: "setTerrain", pieces: exampleMap() });
    const [L, S] = lesson === 1 ? [TUTORIAL_LEGION, TUTORIAL_SWARM] : lesson === 2 ? [LESSON2_LEGION, LESSON2_SWARM] : [LESSON3_LEGION, LESSON3_SWARM];
    this.bus.dispatch({ type: "setArmies", legion: L, swarm: S, mission: "tomar", secondaries: lesson === 3 });
    if (!this.bus.state.rulesMode) this.bus.dispatch({ type: "setRulesMode", on: true });
    if (lesson === 2) {
      // A la ronda 2: el Enjambre avanza un poco hacia el centro y vuelve a ser el turno de la Legión
      for (let g = 0; g < 12 && this.bus.state.phase !== "movimiento"; g++) this.bus.dispatch({ type: "nextPhase" });
      while (this.bus.state.active === 0 && this.bus.state.turn === 1) this.bus.dispatch({ type: "nextPhase" });
      for (let g = 0; g < 12 && this.bus.state.phase !== "movimiento"; g++) this.bus.dispatch({ type: "nextPhase" });
      const s = this.bus.state, dir = s.pieces.find((p) => p.faction === "swarm")!.z > 0 ? -1 : 1;
      this.bus.dispatch({ type: "setRulesMode", on: false });
      this.bus.dispatch({ type: "moveMany", moves: s.pieces.filter((p) => p.faction === "swarm").map((p) => ({ id: p.id, x: p.x, z: p.z + dir * 6 })) });
      this.bus.dispatch({ type: "setRulesMode", on: true });
      for (let g = 0; g < 12 && !(this.bus.state.turn === 2 && this.bus.state.active === 0); g++) this.bus.dispatch({ type: "nextPhase" });
    }
    this.onStart();
    this.go(0);
  }

  stop() {
    this.i = -1;
    $("tutorial").hidden = true;
  }

  private go(i: number) {
    const STEPS = this.steps;
    if (i >= STEPS.length) { this.stop(); return; }
    if (i === 0) this.flags.clear();
    this.i = i;
    const st = STEPS[i];
    $("tutorial").hidden = false;
    $("tutorial").innerHTML = `<div class="row"><span class="dim">Tutorial · ${i + 1}/${STEPS.length}</span><button data-act="close" style="margin-left:auto">Salir del tutorial</button></div>
      <h3>${st.title}</h3><div>${st.text}</div>
      <div class="row" style="justify-content:flex-end;margin-top:8px">${st.done ? `<span class="dim">Hazlo y sigue solo…</span>` : `<button data-act="next" class="primary">${i === STEPS.length - 1 ? "Terminar" : "Siguiente"}</button>`}</div>`;
  }

  /** Llamar cuando cambie el estado o la selección: avanza si el paso está hecho. */
  check(c: TutorialContext) {
    if (this.i < 0) return;
    const STEPS = this.steps;
    c = { ...c, flags: this.flags };
    let moved = false;
    while (this.i >= 0 && this.i < STEPS.length && STEPS[this.i].done?.(c)) { this.i++; moved = true; }
    if (moved) this.go(this.i);
  }
}
