import type { CommandBus } from "../core/commands";
import { exampleMap, GameState } from "../core/state";
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

export interface TutorialContext { s: GameState; selected: Set<string> }

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

export class Tutorial {
  private i = -1;
  onStart: () => void = () => {};

  constructor(private bus: CommandBus) {
    $("tutorial").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      if (b.dataset.act === "next") this.go(this.i + 1);
      if (b.dataset.act === "close") this.stop();
    });
    $("tutorial-start").addEventListener("click", () => this.start());
  }

  get active() { return this.i >= 0; }

  start() {
    settings.aiSide = "swarm";
    settings.aiLevel = "facil";
    settings.mission = "tomar";
    saveSettings();
    this.bus.dispatch({ type: "setTerrain", pieces: exampleMap() });
    this.bus.dispatch({ type: "setArmies", legion: TUTORIAL_LEGION, swarm: TUTORIAL_SWARM, mission: "tomar" });
    if (!this.bus.state.rulesMode) this.bus.dispatch({ type: "setRulesMode", on: true });
    this.onStart();
    this.go(0);
  }

  stop() {
    this.i = -1;
    $("tutorial").hidden = true;
  }

  private go(i: number) {
    if (i >= STEPS.length) { this.stop(); return; }
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
    let moved = false;
    while (this.i >= 0 && this.i < STEPS.length && STEPS[this.i].done?.(c)) { this.i++; moved = true; }
    if (moved) this.go(this.i);
  }
}
