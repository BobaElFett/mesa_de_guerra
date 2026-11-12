import type { Faction, ModelKind } from "../core/state";

// Hojas de datos del reglamento v0.1 (pestaña «Reglamento» del documento del proyecto).
// Mecánica al estilo del género: atributos por miniatura y perfiles de arma.
// Nombres y números son propios de Mesa de Guerra.

/** Cantidad de dados: un número fijo o una tirada. */
export type Dice = number | "D3" | "D6";

export type WeaponAbility =
  | { kind: "asalto" } | { kind: "pesada" } | { kind: "pistola" }
  | { kind: "rafaga"; x: number } | { kind: "sostenida"; x: number }
  | { kind: "letal" } | { kind: "devastadora" } | { kind: "explosiva" } | { kind: "torrente" }
  /** Precisión (#103): ignora la cobertura, +1 para herir a personajes y puede apuntar a uno protegido por su escuadra. */
  | { kind: "precision" }
  /** Indirecto (#113): puede disparar sin línea de visión, con −1 para impactar y el objetivo en cobertura. */
  | { kind: "indirecto" }
  /** Veneno (#121): hiere como mucho a 4+, sea cual sea la Resistencia. */
  | { kind: "veneno" };

export interface Weapon {
  id: string;
  name: string;
  /** Pulgadas, o "CC" para cuerpo a cuerpo. */
  range: number | "CC";
  attacks: Dice;
  /** Tirada para impactar (2–6); null con Torrente (impacta solo). */
  skill: number | null;
  strength: number;
  /** Penetración: 0, −1, −2… */
  ap: number;
  damage: Dice;
  abilities: WeaponAbility[];
}

export interface Profile {
  M: number;    // movimiento (")
  T: number;    // resistencia
  Sv: number;   // salvación (3 = 3+)
  Inv?: number; // invulnerable
  W: number;    // heridas
  Ld: number;   // liderazgo (6 = 6+ con 2D6)
  OC: number;   // control de objetivo
}

export type UnitAbility = "alMando" | "sargento" | "blindado" | "sinaptico" | "rapidez" | "despliegueProfundo" | "tuneles" | "turbo" | "aterrador" | "psiquico" | "infiltrador" | "vuelo" | "impacto" | "sanador" | "estallido" | "estandarte" | "escudoVivo" | "devorar"
  | "contraataque" | "reparar" | "sigilo" | "voluntad";

/**
 * Equipo opcional (#63): cambia un arma por otra en el líder, en una miniatura normal o en todas.
 * Dos opciones de líder o de todas que cambian la misma arma se excluyen; las de «uno» se suman
 * (cada una, una miniatura distinta).
 */
export interface WargearOption {
  id: string;
  name: string;
  who: "lider" | "uno" | "todos";
  replace: string;
  with: string;
  /** Coste: por la unidad o, con `perModel`, por cada miniatura. */
  points: number;
  perModel?: boolean;
}

export interface Datasheet {
  id: DatasheetId;
  name: string;
  faction: Faction;
  profile: Profile;
  /** Tamaños permitidos y su coste. */
  sizes: { models: number; points: number }[];
  /** Armas de cada miniatura normal. */
  weapons: string[];
  /** Armas del líder de la unidad (sargento), si cambian. */
  leaderWeapons?: string[];
  abilities: UnitAbility[];
  /** Modelo 3D con el que se dibuja (provisional hasta la fase 3 para algunas). */
  model: ModelKind;
  character?: boolean;
  /** Escuadras que este personaje puede liderar. */
  leads?: DatasheetId[];
  /** Equipo opcional (#63). */
  options?: WargearOption[];
  /** Vehículo o monstruo: como mucho 1 por ejército. */
  big?: boolean;
}

export type DatasheetId =
  | "capitan" | "asalto" | "fuegoPesado" | "andador" | "exterminadores"
  | "tirano" | "garras" | "escupidores" | "nodo" | "acechadores"
  | "motoristas" | "carnifice" | "psiquico" | "mente" | "francotiradores" | "gargolas"
  | "saltadores" | "medico" | "biomorteros" | "reventadores"
  | "tanque" | "portaestandarte" | "guardiana" | "devorador"
  | "guardiaHonor" | "ingeniero" | "aguijones" | "lictor";

/** Qué hace cada habilidad de arma (#110), para el Códice y las fichas. */
export const WEAPON_ABILITY_TEXT: Record<WeaponAbility["kind"], { name: string; text: string }> = {
  asalto: { name: "Asalto", text: "Puede disparar aunque la unidad haya avanzado." },
  pesada: { name: "Pesada", text: "+1 para impactar si la unidad no se ha movido este turno." },
  pistola: { name: "Pistola", text: "Puede disparar estando trabada en combate, contra la unidad con la que combate." },
  rafaga: { name: "Ráfaga X", text: "+X ataques si el objetivo está a la mitad del alcance o menos." },
  sostenida: { name: "Sostenida X", text: "Cada 6 para impactar genera X impactos más." },
  letal: { name: "Letal", text: "Cada 6 para impactar hiere sin tirar para herir." },
  devastadora: { name: "Devastadora", text: "Cada 6 para herir no permite salvación." },
  explosiva: { name: "Explosiva", text: "+1 ataque por cada 5 miniaturas de la unidad objetivo." },
  torrente: { name: "Torrente", text: "Impacta siempre, sin tirar para impactar." },
  veneno: { name: "Veneno", text: "Hiere a 4+ como mucho, aunque la Resistencia del objetivo sea mayor." },
  indirecto: { name: "Indirecto", text: "Puede disparar a un enemigo que no ve, con −1 para impactar; el objetivo cuenta como en cobertura." },
  precision: { name: "Precisión", text: "Ignora la cobertura, +1 para herir a personajes y puede apuntar a un personaje protegido por su escuadra." },
};

const w = (id: string, name: string, range: number | "CC", attacks: Dice, skill: number | null,
  strength: number, ap: number, damage: Dice, abilities: WeaponAbility[] = []): Weapon =>
  ({ id, name, range, attacks, skill, strength, ap, damage, abilities });

export const WEAPONS: Record<string, Weapon> = Object.fromEntries([
  w("pistolaPlasma", "Pistola de plasma", 12, 1, 2, 8, -3, 2, [{ kind: "pistola" }]),
  // Estratagema Granadas (#52): 6 dados a 4+, cada éxito es una herida mortal (sin salvación)
  w("granadas", "Granadas", 8, 6, 4, 4, 0, 1),
  w("espadaEnergia", "Espada de energía", "CC", 5, 2, 5, -2, 2),
  w("rifleBolter", "Rifle bólter", 24, 2, 3, 4, -1, 1, [{ kind: "asalto" }]),
  w("pistolaBolter", "Pistola bólter", 12, 1, 3, 4, -1, 1, [{ kind: "pistola" }]),
  w("espadaSierra", "Espada sierra", "CC", 4, 3, 4, -1, 1),
  w("cuchillo", "Cuchillo de combate", "CC", 3, 3, 4, 0, 1),
  w("canonPesado", "Cañón pesado", 36, 3, 3, 5, -1, 2, [{ kind: "pesada" }, { kind: "sostenida", x: 1 }]),
  w("canonAsalto", "Cañón de asalto", 24, 6, 3, 6, 0, 1, [{ kind: "rafaga", x: 2 }]),
  w("punoCombate", "Puño de combate", "CC", 4, 3, 12, -2, 3),
  w("garrasMonstruosas", "Garras monstruosas", "CC", 6, 2, 9, -2, 3),
  w("escupeBilis", "Escupe-bilis", 12, "D6", null, 5, -1, 1, [{ kind: "torrente" }]),
  w("garras", "Garras", "CC", 2, 4, 3, -1, 1),
  // Equipo opcional (#63)
  w("lanzallamas", "Lanzallamas", 12, "D6", null, 4, 0, 1, [{ kind: "torrente" }]),
  w("lanzamisiles", "Lanzamisiles", 48, "D6", 3, 4, -1, 1, [{ kind: "pesada" }, { kind: "explosiva" }]),
  w("canonLaser", "Cañón láser", 48, 1, 3, 12, -3, "D6", [{ kind: "pesada" }]),
  w("acidoCorrosivo", "Ácido corrosivo", 12, 2, 4, 5, -1, 1, [{ kind: "asalto" }]),
  w("garrasVenenosas", "Púas venenosas", "CC", 2, 4, 3, -1, 1, [{ kind: "letal" }]),
  w("escupidor", "Escupidor", 18, 1, 4, 5, 0, 1, [{ kind: "asalto" }]),
  w("mordiscos", "Mordiscos", "CC", 1, 4, 3, 0, 1),
  w("canonBio", "Cañón bio", 24, 3, 4, 5, -1, 1),
  w("garrasAfiladas", "Garras afiladas", "CC", 4, 3, 5, -2, 1),
  // Unidades nuevas (#57)
  w("rifleFrancotirador", "Rifle de precisión", 36, 1, 3, 6, -2, 3, [{ kind: "pesada" }, { kind: "precision" }]),
  w("escupePuas", "Escupe-púas", 18, 2, 4, 4, 0, 1, [{ kind: "asalto" }]),
  w("garrasAladas", "Garras aladas", "CC", 2, 4, 4, 0, 1),
  w("bolterAsalto", "Bólter de asalto", 24, 2, 3, 4, 0, 1, [{ kind: "rafaga", x: 2 }]),
  w("punoEnergia", "Puño de energía", "CC", 3, 4, 8, -2, 2),
  w("cuchillasDobles", "Cuchillas dobles", "CC", 5, 3, 6, -2, 1, [{ kind: "sostenida", x: 1 }]),
  // Unidades nuevas (#62)
  w("bolterGemelo", "Bólter gemelo", 18, 3, 3, 4, -1, 1),
  w("guadanas", "Guadañas monstruosas", "CC", 5, 3, 9, -2, 3),
  // Poderes psíquicos (#78): se resuelven como heridas mortales (D3, sin tirada para impactar)
  w("rayoMental", "Rayo mental", 18, "D3", null, 1, 0, 1),
  // Impacto (#111) y Estallido (#114): un dado por miniatura; cada éxito, una herida mortal
  w("canonBatalla", "Cañón de batalla", 48, "D6", 3, 9, -2, 3, [{ kind: "explosiva" }]),
  w("hachaEnergia", "Hacha de energía", "CC", 3, 3, 6, -2, 2),
  w("servobrazo", "Servobrazo", "CC", 2, 4, 8, -2, 3),
  w("aguijonVeneno", "Aguijón venenoso", "CC", 2, 4, 3, -1, 1, [{ kind: "veneno" }]),
  w("garrasLictor", "Garras de acechador", "CC", 6, 2, 7, -2, 2),
  w("ganchos", "Ganchos de carne", 12, 2, 3, 6, -1, 2, [{ kind: "pistola" }]),
  w("orugas", "Orugas", "CC", 3, 4, 6, 0, 1),
  w("fauces", "Fauces devoradoras", "CC", 5, 3, 7, -2, 2),
  w("aterrizaje", "Aterrizaje", "CC", 1, 5, 1, 0, 1),
  w("estallidoBio", "Estallido", "CC", 1, 4, 1, 0, 1),
  w("morteroBio", "Biomortero", 48, 3, 4, 6, -1, 2, [{ kind: "indirecto" }, { kind: "explosiva" }]),
  w("gritoPsiquico", "Grito psíquico", 18, "D3", null, 1, 0, 1),
  w("bastonPsi", "Báculo psíquico", "CC", 3, 3, 6, -1, "D3"),
  w("pinchos", "Lanzapinchos", 24, "D6", 4, 6, -1, 1, [{ kind: "explosiva" }]),
].map((x) => [x.id, x]));

export const DATASHEETS: Record<DatasheetId, Datasheet> = {
  capitan: {
    id: "capitan", name: "Capitán", faction: "legion", character: true,
    profile: { M: 6, T: 4, Sv: 3, Inv: 4, W: 5, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 80 }], weapons: ["pistolaPlasma", "espadaEnergia"],
    abilities: ["alMando"], model: "capitan", leads: ["asalto", "fuegoPesado"],
  },
  tanque: {
    id: "tanque", name: "Tanque Martillo", faction: "legion", big: true,
    profile: { M: 10, T: 10, Sv: 2, W: 12, Ld: 6, OC: 3 },
    sizes: [{ models: 1, points: 175 }], weapons: ["canonBatalla", "bolterGemelo", "orugas"],
    abilities: ["blindado"], model: "tanque",
  },
  guardiaHonor: {
    id: "guardiaHonor", name: "Guardia de Honor", faction: "legion",
    profile: { M: 6, T: 4, Sv: 2, W: 3, Ld: 6, OC: 1, Inv: 4 },
    sizes: [{ models: 3, points: 110 }, { models: 6, points: 220 }], weapons: ["pistolaBolter", "hachaEnergia"],
    abilities: ["contraataque"], model: "guardia",
  },
  ingeniero: {
    id: "ingeniero", name: "Ingeniero de Combate", faction: "legion", character: true,
    profile: { M: 6, T: 4, Sv: 2, W: 4, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 65 }], weapons: ["pistolaBolter", "servobrazo"],
    abilities: ["reparar"], model: "ingeniero",
  },
  portaestandarte: {
    id: "portaestandarte", name: "Portaestandarte", faction: "legion",
    profile: { M: 6, T: 4, Sv: 3, W: 4, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 45 }], weapons: ["pistolaBolter", "espadaSierra"],
    abilities: ["estandarte"], model: "estandarte", character: true,
    leads: ["asalto", "fuegoPesado", "exterminadores", "francotiradores", "saltadores"],
  },
  saltadores: {
    id: "saltadores", name: "Saltadores de Asalto", faction: "legion",
    profile: { M: 12, T: 4, Sv: 3, W: 2, Ld: 6, OC: 1 },
    sizes: [{ models: 5, points: 100 }, { models: 10, points: 200 }], weapons: ["pistolaBolter", "espadaSierra"],
    abilities: ["vuelo", "impacto"], model: "saltador",
  },
  medico: {
    id: "medico", name: "Médico de Campaña", faction: "legion",
    profile: { M: 6, T: 4, Sv: 3, W: 4, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 55 }], weapons: ["pistolaBolter", "cuchillo"],
    abilities: ["sanador"], model: "medico", character: true,
    leads: ["asalto", "fuegoPesado", "exterminadores", "francotiradores", "saltadores"],
  },
  francotiradores: {
    id: "francotiradores", name: "Francotiradores", faction: "legion",
    profile: { M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 1 },
    sizes: [{ models: 5, points: 110 }], weapons: ["rifleFrancotirador", "cuchillo"],
    abilities: ["infiltrador"], model: "francotirador",
  },
  asalto: {
    id: "asalto", name: "Escuadra de Asalto Táctico", faction: "legion",
    profile: { M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 },
    sizes: [{ models: 5, points: 90 }, { models: 10, points: 170 }],
    weapons: ["rifleBolter", "cuchillo"], leaderWeapons: ["pistolaBolter", "espadaSierra"],
    abilities: ["sargento"], model: "legionario",
    options: [
      { id: "sgtEspada", name: "Sargento: espada de energía (en vez de espada sierra)", who: "lider", replace: "espadaSierra", with: "espadaEnergia", points: 10 },
      { id: "sgtPlasma", name: "Sargento: pistola de plasma (en vez de pistola bólter)", who: "lider", replace: "pistolaBolter", with: "pistolaPlasma", points: 5 },
      { id: "llamas", name: "Un legionario: lanzallamas (en vez de rifle)", who: "uno", replace: "rifleBolter", with: "lanzallamas", points: 5 },
      { id: "misiles", name: "Un legionario: lanzamisiles (en vez de rifle)", who: "uno", replace: "rifleBolter", with: "lanzamisiles", points: 10 },
    ],
  },
  fuegoPesado: {
    id: "fuegoPesado", name: "Escuadra de Fuego Pesado", faction: "legion",
    profile: { M: 5, T: 4, Sv: 3, W: 2, Ld: 6, OC: 1 },
    sizes: [{ models: 5, points: 150 }], weapons: ["canonPesado", "cuchillo"],
    abilities: [], model: "pesado",
    options: [
      { id: "misiles", name: "Todos: lanzamisiles (en vez de cañón pesado)", who: "todos", replace: "canonPesado", with: "lanzamisiles", points: 0 },
      { id: "laser", name: "Todos: cañón láser (en vez de cañón pesado)", who: "todos", replace: "canonPesado", with: "canonLaser", points: 10 },
    ],
  },
  andador: {
    id: "andador", name: "Andador de Combate", faction: "legion", big: true,
    profile: { M: 8, T: 9, Sv: 2, W: 12, Ld: 6, OC: 4 },
    sizes: [{ models: 1, points: 190 }], weapons: ["canonAsalto", "punoCombate"],
    abilities: ["blindado"], model: "andador",
  },
  exterminadores: {
    id: "exterminadores", name: "Exterminadores", faction: "legion",
    profile: { M: 5, T: 5, Sv: 2, Inv: 4, W: 3, Ld: 6, OC: 1 },
    sizes: [{ models: 5, points: 175 }], weapons: ["bolterAsalto", "punoEnergia"],
    abilities: ["despliegueProfundo"], model: "exterminador",
  },
  acechadores: {
    id: "acechadores", name: "Acechadores", faction: "swarm",
    profile: { M: 8, T: 5, Sv: 4, W: 3, Ld: 8, OC: 1 },
    sizes: [{ models: 3, points: 75 }, { models: 6, points: 150 }], weapons: ["cuchillasDobles"],
    abilities: ["tuneles", "rapidez"], model: "acechador",
  },
  psiquico: {
    id: "psiquico", name: "Psíquico de la Legión", faction: "legion",
    profile: { M: 6, T: 4, Sv: 3, Inv: 5, W: 4, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 70 }], weapons: ["pistolaBolter", "bastonPsi"],
    abilities: ["psiquico"], model: "psiquico", character: true, leads: ["asalto", "exterminadores"],
  },
  mente: {
    id: "mente", name: "Mente del Enjambre", faction: "swarm",
    profile: { M: 6, T: 5, Sv: 4, Inv: 5, W: 5, Ld: 7, OC: 1 },
    sizes: [{ models: 1, points: 55 }], weapons: ["garrasAfiladas"],
    abilities: ["psiquico", "sinaptico", "voluntad"], model: "mente", character: true, leads: ["garras", "escupidores", "nodo"],
  },
  motoristas: {
    id: "motoristas", name: "Motoristas de Asalto", faction: "legion",
    profile: { M: 12, T: 5, Sv: 3, W: 2, Ld: 6, OC: 1 },
    sizes: [{ models: 3, points: 90 }, { models: 6, points: 180 }], weapons: ["bolterGemelo", "cuchillo"],
    abilities: ["turbo"], model: "moto",
  },
  carnifice: {
    id: "carnifice", name: "Carnífice", faction: "swarm",
    profile: { M: 8, T: 9, Sv: 2, W: 10, Ld: 8, OC: 3 },
    sizes: [{ models: 1, points: 190 }], weapons: ["pinchos", "guadanas"],
    abilities: ["aterrador"], model: "carnifice",
  },
  tirano: {
    id: "tirano", name: "Tirano Sináptico", faction: "swarm", character: true, big: true,
    profile: { M: 8, T: 9, Sv: 2, Inv: 5, W: 11, Ld: 7, OC: 3 },
    sizes: [{ models: 1, points: 195 }], weapons: ["garrasMonstruosas", "escupeBilis"],
    abilities: ["sinaptico"], model: "tirano",
  },
  garras: {
    id: "garras", name: "Garras Menores", faction: "swarm",
    profile: { M: 8, T: 4, Sv: 5, W: 1, Ld: 8, OC: 1 },
    sizes: [{ models: 10, points: 55 }, { models: 20, points: 110 }], weapons: ["garras"],
    abilities: ["rapidez"], model: "garra",
    options: [
      { id: "veneno", name: "Todas: púas venenosas (Letal, +1 pt por miniatura)", who: "todos", replace: "garras", with: "garrasVenenosas", points: 1, perModel: true },
    ],
  },
  escupidores: {
    id: "escupidores", name: "Escupidores", faction: "swarm",
    profile: { M: 6, T: 3, Sv: 4, W: 1, Ld: 8, OC: 1 },
    sizes: [{ models: 10, points: 55 }, { models: 20, points: 110 }], weapons: ["escupidor", "mordiscos"],
    abilities: [], model: "escupidor",
    options: [
      { id: "acido", name: "Todos: ácido corrosivo (12\", 2 ataques, FP−1, en vez de escupidor)", who: "todos", replace: "escupidor", with: "acidoCorrosivo", points: 0 },
    ],
  },
  aguijones: {
    id: "aguijones", name: "Aguijones", faction: "swarm",
    profile: { M: 7, T: 3, Sv: 5, W: 1, Ld: 8, OC: 1 },
    sizes: [{ models: 10, points: 60 }, { models: 20, points: 120 }], weapons: ["aguijonVeneno"],
    abilities: [], model: "aguijon",
  },
  lictor: {
    id: "lictor", name: "Acechador Oculto", faction: "swarm",
    profile: { M: 8, T: 6, Sv: 4, W: 6, Ld: 8, OC: 1 },
    sizes: [{ models: 1, points: 90 }], weapons: ["ganchos", "garrasLictor"],
    abilities: ["infiltrador", "sigilo"], model: "lictor",
  },
  guardiana: {
    id: "guardiana", name: "Bestia Guardiana", faction: "swarm", big: true,
    profile: { M: 7, T: 8, Sv: 3, W: 8, Ld: 8, OC: 3 },
    sizes: [{ models: 1, points: 135 }], weapons: ["garrasMonstruosas"],
    abilities: ["escudoVivo"], model: "guardiana",
  },
  devorador: {
    id: "devorador", name: "Devorador", faction: "swarm", big: true,
    profile: { M: 8, T: 8, Sv: 3, W: 9, Ld: 8, OC: 3 },
    sizes: [{ models: 1, points: 120 }], weapons: ["fauces", "escupidor"],
    abilities: ["devorar"], model: "devorador",
  },
  biomorteros: {
    id: "biomorteros", name: "Biomorteros", faction: "swarm",
    profile: { M: 5, T: 5, Sv: 4, W: 3, Ld: 8, OC: 1 },
    sizes: [{ models: 2, points: 75 }, { models: 4, points: 150 }], weapons: ["morteroBio", "garras"],
    abilities: [], model: "biomortero",
  },
  reventadores: {
    id: "reventadores", name: "Reventadores", faction: "swarm",
    profile: { M: 8, T: 3, Sv: 6, W: 1, Ld: 8, OC: 1 },
    sizes: [{ models: 10, points: 45 }, { models: 20, points: 90 }], weapons: ["mordiscos"],
    abilities: ["estallido"], model: "reventador",
  },
  gargolas: {
    id: "gargolas", name: "Gárgolas", faction: "swarm",
    profile: { M: 12, T: 3, Sv: 6, W: 1, Ld: 8, OC: 1 },
    sizes: [{ models: 10, points: 70 }, { models: 20, points: 140 }], weapons: ["escupePuas", "garrasAladas"],
    abilities: ["vuelo"], model: "gargola",
  },
  nodo: {
    id: "nodo", name: "Guerreros Nodo", faction: "swarm",
    profile: { M: 6, T: 5, Sv: 4, W: 3, Ld: 7, OC: 1 },
    sizes: [{ models: 3, points: 80 }, { models: 6, points: 160 }], weapons: ["canonBio", "garrasAfiladas"],
    abilities: ["sinaptico"], model: "nodo",
  },
};

export function hasAbility(w: Weapon, kind: WeaponAbility["kind"]): boolean {
  return w.abilities.some((a) => a.kind === kind);
}

export function abilityX(w: Weapon, kind: "rafaga" | "sostenida"): number {
  const a = w.abilities.find((x) => x.kind === kind) as { x: number } | undefined;
  return a?.x ?? 0;
}

/** Coste de una unidad con `models` miniaturas, o null si ese tamaño no existe. */
export function unitPoints(ds: Datasheet, models: number): number | null {
  return ds.sizes.find((s) => s.models === models)?.points ?? null;
}

/** Armas (ids) de una miniatura: las suyas propias si lleva equipo opcional, o las de su perfil. */
export function pieceWeaponIds(ds: Datasheet, p: { leader?: boolean; weapons?: string[] }): string[] {
  return p.weapons ?? (p.leader && ds.leaderWeapons ? ds.leaderWeapons : ds.weapons);
}

/** Lo que vale una unidad en la mesa: su tamaño inicial más el equipo opcional (#66). */
export function unitCost(u: { datasheet: string; startingModels: number; points?: number }): number {
  return u.points ?? unitPoints(DATASHEETS[u.datasheet as DatasheetId], u.startingModels) ?? 0;
}

/** Coste del equipo opcional elegido para una unidad de `models` miniaturas. */
export function optionPoints(ds: Datasheet, models: number, ids: string[] = []): number {
  return ids.reduce((n, id) => {
    const o = ds.options?.find((x) => x.id === id);
    return n + (o ? (o.perModel ? o.points * models : o.points) : 0);
  }, 0);
}

/** Errores en el equipo elegido: opciones que no existen o que se excluyen. */
export function optionErrors(ds: Datasheet, ids: string[] = []): string[] {
  const out: string[] = [];
  const chosen = ids.map((id) => ds.options?.find((x) => x.id === id));
  if (chosen.some((o) => !o)) out.push(`${ds.name}: equipo desconocido`);
  const seen = new Set<string>();
  for (const o of chosen) if (o && o.who !== "uno") {     // «uno» se lleva cada vez una miniatura distinta
    const k = `${o.who}|${o.replace}`;
    if (seen.has(k)) out.push(`${ds.name}: dos opciones cambian la misma arma`);
    seen.add(k);
  }
  return out;
}

/** Armas de una miniatura según sea líder o no. */
export function weaponsOf(ds: Datasheet, leader: boolean): Weapon[] {
  return (leader && ds.leaderWeapons ? ds.leaderWeapons : ds.weapons).map((id) => WEAPONS[id]);
}

/** Texto de una tirada de dados: 2, D3, D6. */
export function diceText(d: Dice): string { return String(d); }

/** Texto de las habilidades de unidad, para la hoja de datos en pantalla. */
export const UNIT_ABILITY_TEXT: Record<UnitAbility, { name: string; text: string }> = {
  alMando: { name: "Al mando", text: "Puede liderar una escuadra de Asalto Táctico o de Fuego Pesado: se mueven y cargan juntos, la escuadra lo protege de los disparos y los dos repiten los 1 al impactar." },
  sargento: { name: "Sargento", text: "Una miniatura lleva pistola bólter y espada sierra en lugar de rifle y cuchillo." },
  blindado: { name: "Blindado", text: "Cada ataque que lo daña quita 1 herida menos (mínimo 1)." },
  sinaptico: { name: "Sináptico", text: "Las unidades del Enjambre a 12\" superan solas los chequeos de moral." },
  rapidez: { name: "Rapidez", text: "Puede declarar una carga después de avanzar." },
  despliegueProfundo: { name: "Despliegue profundo", text: "Puede empezar en reserva y teletransportarse en la fase de movimiento (desde la ronda 2) a cualquier punto a más de 9\" de los enemigos. Si al acabar la ronda 3 no ha llegado, se pierde." },
  psiquico: { name: "Psíquico", text: "Una vez por turno, en su disparo, usa su poder contra un enemigo visible a 18\": 2D6; con 7 o más, D3 heridas mortales. Con doble 1 o doble 6 sufre 1 herida mortal (peligros de la disformidad)." },
  turbo: { name: "Turbo", text: "Al avanzar suma 6\" sin tirar el dado." },
  aterrador: { name: "Aterrador", text: "Las unidades enemigas a 6\" o menos restan 1 a su Liderazgo en los chequeos de moral." },
  infiltrador: { name: "Infiltrador", text: "Despliega en cualquier punto de su mitad de la mesa a más de 6\" de la línea central, no solo en su zona de despliegue." },
  voluntad: { name: "Voluntad de la colmena", text: "Tus unidades con alguna miniatura a 6\" o menos de ella suman +1 para impactar en combate." },
  contraataque: { name: "Contraataque", text: "Combate primero, como si hubiera cargado, aunque sea ella la cargada." },
  reparar: { name: "Reparar", text: "Al empezar tu fase de mando, cura D3 heridas a un Andador o Tanque propio a 3\" o menos." },
  sigilo: { name: "Sigilo", text: "Los disparos contra ella restan 1 para impactar." },
  estandarte: { name: "Estandarte", text: "Tus unidades con alguna miniatura a 6\" o menos de él suman +1 al control de objetivos de cada miniatura y repiten los chequeos de moral fallados." },
  escudoVivo: { name: "Escudo vivo", text: "Tus unidades con alguna miniatura a 6\" o menos de ella tienen salvación invulnerable 5+ contra los disparos." },
  devorar: { name: "Devorar", text: "Cada miniatura enemiga que mata en combate le cura 1 herida." },
  impacto: { name: "Impacto", text: "Al llegar con una carga, tira un dado por miniatura: cada 5+ es una herida mortal a la unidad cargada." },
  sanador: { name: "Sanador", text: "Al empezar tu fase de mando, si la escuadra que lidera ha perdido miniaturas, vuelve una (sin heridas) junto a ella." },
  estallido: { name: "Estallido", text: "Cada miniatura que cae en combate revienta: tira un dado; con 4+, la unidad que la ha matado sufre una herida mortal." },
  vuelo: { name: "Vuelo", text: "Al mover, avanzar, retirarse o cargar pasa por encima de la escenografía sólida (contenedores, búnker, barricadas); no puede acabar encima." },
  tuneles: { name: "Túneles", text: "Puede empezar en reserva y salir de un túnel en la fase de movimiento (desde la ronda 2) a más de 9\" de los enemigos. Si al acabar la ronda 3 no ha llegado, se pierde." },
};
