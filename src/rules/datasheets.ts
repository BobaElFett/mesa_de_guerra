import type { Faction, ModelKind } from "../core/state";

// Hojas de datos del reglamento v0.1 (pestaña «Reglamento» del documento del proyecto).
// Mecánica al estilo del género: atributos por miniatura y perfiles de arma.
// Nombres y números son propios de Mesa de Guerra.

/** Cantidad de dados: un número fijo o una tirada. */
export type Dice = number | "D3" | "D6";

export type WeaponAbility =
  | { kind: "asalto" } | { kind: "pesada" } | { kind: "pistola" }
  | { kind: "rafaga"; x: number } | { kind: "sostenida"; x: number }
  | { kind: "letal" } | { kind: "devastadora" } | { kind: "explosiva" } | { kind: "torrente" };

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

export type UnitAbility = "alMando" | "sargento" | "blindado" | "sinaptico" | "rapidez";

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
  /** Vehículo o monstruo: como mucho 1 por ejército. */
  big?: boolean;
}

export type DatasheetId =
  | "capitan" | "asalto" | "fuegoPesado" | "andador"
  | "tirano" | "garras" | "escupidores" | "nodo";

const w = (id: string, name: string, range: number | "CC", attacks: Dice, skill: number | null,
  strength: number, ap: number, damage: Dice, abilities: WeaponAbility[] = []): Weapon =>
  ({ id, name, range, attacks, skill, strength, ap, damage, abilities });

export const WEAPONS: Record<string, Weapon> = Object.fromEntries([
  w("pistolaPlasma", "Pistola de plasma", 12, 1, 2, 8, -3, 2, [{ kind: "pistola" }]),
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
  w("escupidor", "Escupidor", 18, 1, 4, 5, 0, 1, [{ kind: "asalto" }]),
  w("mordiscos", "Mordiscos", "CC", 1, 4, 3, 0, 1),
  w("canonBio", "Cañón bio", 24, 3, 4, 5, -1, 1),
  w("garrasAfiladas", "Garras afiladas", "CC", 4, 3, 5, -2, 1),
].map((x) => [x.id, x]));

export const DATASHEETS: Record<DatasheetId, Datasheet> = {
  capitan: {
    id: "capitan", name: "Capitán", faction: "legion", character: true,
    profile: { M: 6, T: 4, Sv: 3, Inv: 4, W: 5, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 80 }], weapons: ["pistolaPlasma", "espadaEnergia"],
    abilities: ["alMando"], model: "legionario",
  },
  asalto: {
    id: "asalto", name: "Escuadra de Asalto Táctico", faction: "legion",
    profile: { M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 },
    sizes: [{ models: 5, points: 90 }, { models: 10, points: 170 }],
    weapons: ["rifleBolter", "cuchillo"], leaderWeapons: ["pistolaBolter", "espadaSierra"],
    abilities: ["sargento"], model: "legionario",
  },
  fuegoPesado: {
    id: "fuegoPesado", name: "Escuadra de Fuego Pesado", faction: "legion",
    profile: { M: 5, T: 4, Sv: 3, W: 2, Ld: 6, OC: 1 },
    sizes: [{ models: 5, points: 120 }], weapons: ["canonPesado", "cuchillo"],
    abilities: [], model: "legionario",
  },
  andador: {
    id: "andador", name: "Andador de Combate", faction: "legion", big: true,
    profile: { M: 8, T: 9, Sv: 2, W: 12, Ld: 6, OC: 4 },
    sizes: [{ models: 1, points: 150 }], weapons: ["canonAsalto", "punoCombate"],
    abilities: ["blindado"], model: "legionario",
  },
  tirano: {
    id: "tirano", name: "Tirano Sináptico", faction: "swarm", character: true, big: true,
    profile: { M: 8, T: 9, Sv: 2, Inv: 5, W: 11, Ld: 7, OC: 3 },
    sizes: [{ models: 1, points: 180 }], weapons: ["garrasMonstruosas", "escupeBilis"],
    abilities: ["sinaptico"], model: "garra",
  },
  garras: {
    id: "garras", name: "Garras Menores", faction: "swarm",
    profile: { M: 8, T: 3, Sv: 5, W: 1, Ld: 8, OC: 1 },
    sizes: [{ models: 10, points: 65 }, { models: 20, points: 130 }], weapons: ["garras"],
    abilities: ["rapidez"], model: "garra",
  },
  escupidores: {
    id: "escupidores", name: "Escupidores", faction: "swarm",
    profile: { M: 6, T: 3, Sv: 5, W: 1, Ld: 8, OC: 1 },
    sizes: [{ models: 10, points: 60 }, { models: 20, points: 120 }], weapons: ["escupidor", "mordiscos"],
    abilities: [], model: "garra",
  },
  nodo: {
    id: "nodo", name: "Guerreros Nodo", faction: "swarm",
    profile: { M: 6, T: 5, Sv: 4, W: 3, Ld: 7, OC: 1 },
    sizes: [{ models: 3, points: 80 }, { models: 6, points: 160 }], weapons: ["canonBio", "garrasAfiladas"],
    abilities: ["sinaptico"], model: "garra",
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

/** Armas de una miniatura según sea líder o no. */
export function weaponsOf(ds: Datasheet, leader: boolean): Weapon[] {
  return (leader && ds.leaderWeapons ? ds.leaderWeapons : ds.weapons).map((id) => WEAPONS[id]);
}

/** Texto de una tirada de dados: 2, D3, D6. */
export function diceText(d: Dice): string { return String(d); }

/** Texto de las habilidades de unidad, para la hoja de datos en pantalla. */
export const UNIT_ABILITY_TEXT: Record<UnitAbility, { name: string; text: string }> = {
  alMando: { name: "Al mando", text: "Líder de una escuadra de Asalto Táctico o de Fuego Pesado; esa unidad repite los 1 al impactar." },
  sargento: { name: "Sargento", text: "Una miniatura lleva pistola bólter y espada sierra en lugar de rifle y cuchillo." },
  blindado: { name: "Blindado", text: "Cada ataque que lo daña quita 1 herida menos (mínimo 1)." },
  sinaptico: { name: "Sináptico", text: "Las unidades del Enjambre a 12\" superan solas los chequeos de moral." },
  rapidez: { name: "Rapidez", text: "Puede declarar una carga después de avanzar." },
};
