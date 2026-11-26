import type { Faction, ModelKind } from "../core/state";

// Hojas de datos del reglamento v0.1 (pestaña «Reglamento» del documento del proyecto).
// Mecánica al estilo del género: atributos por miniatura y perfiles de arma.
// Nombres y números son propios de Mesa de Guerra.

/** Cantidad de dados: un número fijo o una tirada (D3, D6, 2D6, D3+3, D6+1…). */
export type Dice = number | `${"" | "2"}D${3 | 6}` | `${"" | "2"}D${3 | 6}+${number}`;

/** Una tirada desmontada: `n` dados de `sides` caras más `plus`. */
export function parseDice(d: Dice): { n: number; sides: number; plus: number } {
  if (typeof d === "number") return { n: 0, sides: 6, plus: d };
  const m = /^(\d*)D(\d)(?:\+(\d+))?$/.exec(d);
  if (!m) return { n: 0, sides: 6, plus: 0 };
  return { n: m[1] ? Number(m[1]) : 1, sides: Number(m[2]), plus: m[3] ? Number(m[3]) : 0 };
}
/** Valor medio de una tirada. */
export function avgDice(d: Dice): number {
  const { n, sides, plus } = parseDice(d);
  return n * (sides + 1) / 2 + plus;
}

/** Tipo de unidad (palabras clave de 11.ª que usan las reglas). */
export type UnitType = "infanteria" | "montada" | "vehiculo" | "monstruo" | "bestia" | "enjambre";

export type WeaponAbility =
  | { kind: "asalto" } | { kind: "pesada" } | { kind: "pistola" }
  | { kind: "rafaga"; x: number } | { kind: "sostenida"; x: number }
  | { kind: "letal" } | { kind: "devastadora" } | { kind: "explosiva" } | { kind: "torrente" }
  /** Precisión (#103): ignora la cobertura, +1 para herir a personajes y puede apuntar a uno protegido por su escuadra. */
  | { kind: "precision" }
  /** Indirecto (#113): puede disparar sin línea de visión, con −1 para impactar y el objetivo en cobertura. */
  | { kind: "indirecto" }
  /** Veneno (#121): hiere como mucho a 4+, sea cual sea la Resistencia. */
  | { kind: "veneno" }
  // Habilidades de arma de la 11.ª edición (fase 30)
  /** Gemela: se puede repetir la tirada para herir. */
  | { kind: "gemela" }
  /** Fusión X: +X al daño si el objetivo está a la mitad del alcance o menos. */
  | { kind: "fusion"; x: number }
  /** Peligrosa: tras atacar, una tirada de peligro (1–2 en 1D6: herida mortal a la propia unidad). */
  | { kind: "peligrosa" }
  /** Ataques extra: en combate golpea además del arma elegida. */
  | { kind: "ataquesExtra" }
  /** Anti-X Y+: contra ese tipo de unidad, un Y+ sin modificar al herir es crítico. */
  | { kind: "anti"; vs: UnitType; x: number }
  /** Ignora cobertura. */
  | { kind: "ignoraCobertura" }
  /** Ataque psíquico. */
  | { kind: "psiquica" };

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

export type UnitAbility =
  // Habilidades que ya tenía el motor
  | "sinaptico" | "rapidez" | "despliegueProfundo" | "tuneles" | "infiltrador" | "vuelo" | "impacto" | "sanador"
  | "estandarte" | "contraataque" | "reparar" | "sigilo"
  // Habilidades de ficha de la 11.ª edición (fase 30)
  | "horaGloriosa" | "destructor" | "guardiaHoja" | "alzarEstandarte" | "opticas" | "disciplina" | "sabiduria"
  | "furiaPrimera" | "cupula" | "aceleron" | "embate" | "voluntadColmena" | "neurocitos" | "solitario" | "tentaculos"
  | "gritoMortal" | "espectaculo" | "minaFlotante" | "depredadores" | "alfa" | "camaleon";

/**
 * Equipo opcional (#63): cambia un arma por otra en el líder, en una miniatura normal o en todas.
 * Dos opciones de líder o de todas que cambian la misma arma se excluyen; las de «uno» se suman
 * (cada una, una miniatura distinta).
 */
export interface WargearOption {
  id: string;
  name: string;
  who: "lider" | "uno" | "todos";
  /** Arma que se cambia; con una lista se cambian todas por `with`; vacía, se añade `with`. */
  replace: string | string[];
  with: string;
  /** Coste: por la unidad o, con `perModel`, por cada miniatura. */
  points: number;
  perModel?: boolean;
  /** Solo con la unidad a este tamaño o más. */
  minModels?: number;
}

export interface Datasheet {
  id: DatasheetId;
  name: string;
  faction: Faction;
  profile: Profile;
  /** Tamaños permitidos y su coste (`points3`: lo que cuesta la 3.ª unidad igual y siguientes). */
  sizes: { models: number; points: number; points3?: number }[];
  /** Tipo de unidad (11.ª): infantería, vehículo, monstruo… */
  type: UnitType;
  /** Línea de batalla: se pueden llevar el doble de unidades iguales. */
  battleline?: boolean;
  /** Personaje de apoyo: va con una escuadra aunque ya lleve líder. */
  support?: boolean;
  /** Palabras clave que usan las estratagemas (11.ª). */
  keywords?: ("explosivos" | "humo" | "andador")[];
  /** Dañado X: con X heridas o menos, −1 para impactar. */
  damaged?: number;
  /** Muerte explosiva X: al caer, con un 6, X heridas mortales a cada unidad a 6". */
  deadlyDemise?: Dice;
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
  /** Vehículo o monstruo (misiones como Coloso). */
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
  pesada: { name: "Pesada", text: "+1 para impactar si la unidad no ha movido más de 3\" este turno." },
  pistola: { name: "Corto alcance", text: "Puede disparar estando trabada en combate, contra la unidad con la que combate. La infantería que dispara armas de corto alcance no dispara las demás, y al revés." },
  rafaga: { name: "Ráfaga X", text: "+X ataques si el objetivo está a la mitad del alcance o menos." },
  sostenida: { name: "Sostenida X", text: "Cada 6 para impactar genera X impactos más." },
  letal: { name: "Letal", text: "Cada 6 para impactar hiere sin tirar para herir." },
  devastadora: { name: "Devastadora", text: "Cada 6 para herir no permite salvación." },
  explosiva: { name: "Explosiva", text: "+1 ataque por cada 5 miniaturas de la unidad objetivo." },
  torrente: { name: "Torrente", text: "Impacta siempre, sin tirar para impactar." },
  veneno: { name: "Veneno", text: "Hiere a 4+ como mucho, aunque la Resistencia del objetivo sea mayor." },
  indirecto: { name: "Indirecto", text: "Puede disparar a un enemigo que no ve (si no se ha avanzado): el objetivo cuenta en cobertura, no se repiten las tiradas y fallan los 1–5 sin modificar (1–3 si la unidad no se ha movido y otra unidad tuya ve al objetivo)." },
  precision: { name: "Precisión", text: "Puede apuntar a un personaje protegido por su escuadra." },
  gemela: { name: "Gemela", text: "Se puede repetir la tirada para herir." },
  fusion: { name: "Fusión X", text: "+X al daño si el objetivo está a la mitad del alcance o menos." },
  peligrosa: { name: "Peligrosa", text: "Después de atacar con ella, tira 1D6: con 1–2 la propia unidad sufre 1 herida mortal (3 si es un vehículo o monstruo)." },
  ataquesExtra: { name: "Ataques extra", text: "En combate golpea con ella además de con el arma que elija." },
  anti: { name: "Anti-X Y+", text: "Contra ese tipo de unidad, cada Y+ sin modificar al herir es una herida crítica." },
  ignoraCobertura: { name: "Ignora cobertura", text: "El objetivo no se beneficia de la cobertura." },
  psiquica: { name: "Psíquica", text: "Es un ataque psíquico." },
};

const w = (id: string, name: string, range: number | "CC", attacks: Dice, skill: number | null,
  strength: number, ap: number, damage: Dice, abilities: WeaponAbility[] = []): Weapon =>
  ({ id, name, range, attacks, skill, strength, ap, damage, abilities });

// Perfiles de la 11.ª edición (fase 30): los números vienen de las hojas de datos equivalentes
// (Wahapedia, datos del 23-11-2026); los nombres y los textos son de Mesa de Guerra.
const AS = { kind: "asalto" } as const, PE = { kind: "pesada" } as const, PI = { kind: "pistola" } as const;
const LE = { kind: "letal" } as const, DV = { kind: "devastadora" } as const, EX = { kind: "explosiva" } as const;
const TO = { kind: "torrente" } as const, PR = { kind: "precision" } as const, IN = { kind: "indirecto" } as const;
const GE = { kind: "gemela" } as const, PG = { kind: "peligrosa" } as const, XA = { kind: "ataquesExtra" } as const;
const PS = { kind: "psiquica" } as const;
const RF = (x: number) => ({ kind: "rafaga" as const, x });
const SH = (x: number) => ({ kind: "sostenida" as const, x });
const ME = (x: number) => ({ kind: "fusion" as const, x });

export const WEAPONS: Record<string, Weapon> = Object.fromEntries([
  // --- Legión Astral: a distancia ----------------------------------------------------
  w("pistolaBolter", "Pistola bólter", 12, 1, 3, 5, -1, 1, [PI]),
  w("pistolaPesada", "Pistola bólter pesada", 18, 1, 3, 5, -1, 1, [PI]),
  w("pistolaPesadaMaestra", "Pistola bólter pesada", 18, 1, 2, 5, -1, 1, [PI]),
  w("pistolaPlasma", "Pistola de plasma", 12, 1, 3, 7, -2, 1, [PI]),
  w("pistolaPlasmaMaestra", "Pistola de plasma", 12, 1, 2, 7, -2, 1, [PI]),
  w("pistolaVolkite", "Pistola volkite", 12, 1, 3, 5, 0, 2, [PI, DV]),
  w("pistolaLlamas", "Pistola lanzallamas", 9, 3, null, 4, 0, 1, [PI, TO]),
  w("pistolaAbsolvedora", "Pistola absolvedora", 18, 1, 3, 5, -2, 2, [PI]),
  w("pistolaGrav", "Pistola gravitatoria", 12, 2, 2, 2, -1, 3, [PI, { kind: "anti", vs: "vehiculo", x: 2 }]),
  w("rifleBolter", "Rifle bólter", 24, 2, 3, 5, -1, 1, [RF(1), AS]),
  w("bolterMaestro", "Bólter de maestro", 24, 2, 2, 5, -1, 2, [RF(1), AS]),
  w("bolterForja", "Bólter de forja", 24, 3, 2, 5, -1, 2, [SH(1)]),
  w("bolterTormenta", "Bólter de asalto", 24, 2, 3, 5, -1, 1, [RF(2)]),
  w("rifleGemelo", "Rifle bólter gemelo", 24, 2, 2, 5, -1, 1, [GE, AS, RF(2)]),
  w("lanzagranadas", "Lanzagranadas", 24, 4, 3, 4, -1, 1, [EX]),
  w("rifleFrancotirador", "Rifle de precisión", 36, 1, 3, 6, -2, 3, [PE, PR]),
  w("fusilLaser", "Fusil láser", 36, 1, 3, 10, -3, "D3+3", [PE]),
  w("lanzaderaCastellana", "Lanzadera de minas", 24, 2, 3, 5, -1, 1, [PE]),
  w("cohetesFrag", "Lanzacohetes de fragmentación", 48, 4, 3, 5, -1, 1, [EX, PE]),
  w("cohetesPerf", "Lanzacohetes perforante", 48, 1, 3, 10, -2, "D3+3", [PE]),
  w("lanzaderaVengadora", "Lanzadera vengadora", 48, 4, 3, 7, -1, 2, [EX, IN, PE]),
  w("canonAsalto", "Cañón de asalto", 24, 6, 3, 6, -2, 1, [SH(1)]),
  w("canonLaserGemelo", "Cañón láser gemelo", 48, 1, 3, 12, -3, "D3+3", [GE]),
  w("multiFusion", "Multifusión", 18, 2, 3, 10, -3, "D3+2", [ME(3)]),
  w("canonPlasmaPesado", "Cañón de plasma pesado", 36, 3, 3, 9, -2, 2, [EX, PE]),
  w("lanzallamasPesado", "Lanzallamas pesado", 12, 3, null, 5, -1, 1, [EX, TO]),
  w("canonesLaserTanque", "Cañones láser (×2)", 48, 2, 3, 12, -3, "D3+3"),
  w("bolteresPesadosTanque", "Bólteres pesados (×2)", 36, 6, 3, 5, -1, 2, [SH(1), RF(4)]),
  w("autocanonTanque", "Autocañón de tanque", 48, 4, 3, 9, -1, 3, [RF(2)]),
  w("golpeMental", "Golpe mental", 24, "D6", 3, 6, -1, 2, [PS]),
  // --- Legión Astral: cuerpo a cuerpo ------------------------------------------------
  w("punos", "Puños y cuchillo", "CC", 3, 3, 5, 0, 1),
  w("punosCeramita", "Puños de ceramita", "CC", 3, 3, 5, 0, 1),
  w("punosCeramita4", "Puños de ceramita", "CC", 4, 3, 5, 0, 1),
  w("espadaSierra", "Espada sierra", "CC", 4, 3, 5, -1, 1),
  w("espadaSierra5", "Espada sierra", "CC", 5, 3, 5, -1, 1),
  w("armaEnergia", "Arma de energía", "CC", 4, 3, 5, -2, 1),
  w("armaEnergia5", "Arma de energía", "CC", 5, 3, 5, -2, 1),
  w("armaEnergiaMaestra", "Arma de energía de maestro", "CC", 6, 2, 6, -2, 2),
  w("espadaMaestra", "Espada de energía de maestro", "CC", 4, 3, 5, -2, 2),
  w("punoEnergia", "Puño de energía", "CC", 3, 3, 8, -2, 2),
  w("punoEnergiaMaestro", "Puño de energía", "CC", 5, 2, 8, -2, 2),
  w("martilloTrueno", "Martillo de trueno", "CC", 3, 4, 8, -2, 3, [DV]),
  w("hachaServobrazo", "Hacha y servobrazo", "CC", 5, 3, 6, -2, 2),
  w("pistolaReductora", "Pistola reductora", "CC", 1, 3, 5, -4, 2, [XA]),
  w("servoarmadura", "Servoarmadura", "CC", 4, 3, 5, 0, 1),
  w("armaPsiquica", "Arma psíquica", "CC", 4, 3, 6, -2, 2, [PS]),
  w("punoAndador", "Puño de andador", "CC", 5, 3, 12, -2, 3),
  w("orugas", "Orugas", "CC", 3, 4, 6, 0, 1),
  // --- Enjambre: a distancia -----------------------------------------------------------
  w("escupidor", "Escupidor", 18, 1, 4, 5, 0, 1, [AS]),
  w("devoradorCorto", "Devorador", 18, 2, 4, 4, 0, 1),
  w("puasGemelas", "Lanzapúas de puño", 12, 2, 4, 3, 0, 1, [AS, PI, GE]),
  w("devoradorGuerrero", "Devorador", 18, 5, 4, 4, 0, 1),
  w("escupeMuerte", "Escupemuerte", 24, 3, 4, 5, -1, 1),
  w("puasGuerrero", "Lanzapúas de puño", 12, 2, 4, 4, 0, 1, [AS, PI, GE]),
  w("estrangulador", "Estrangulador", 36, "D6+1", 4, 6, -1, 1, [EX]),
  w("canonVeneno", "Cañón de veneno", 36, "D3", 4, 9, -2, 2, [EX]),
  w("canonVenenoPesado", "Cañón de veneno pesado", 36, "D3", 4, 9, -2, 3, [EX]),
  w("canonVenenoTirano", "Cañón de veneno pesado", 36, "D3", 2, 9, -2, 3, [EX]),
  w("canonEspinas", "Cañón de espinas", 36, "D6+1", 4, 7, -1, 2, [EX]),
  w("canonEspinasTirano", "Cañón de espinas", 36, "D6+1", 2, 7, -1, 2, [EX]),
  w("bioplasma", "Bioplasma", 12, "D3", 4, 7, -2, 1, [AS, EX]),
  w("bancosPuas", "Bancos de púas", 6, 5, 4, 5, 0, 1, [AS]),
  w("gritoBioplasma", "Grito bioplásmico", 18, "D6+3", 4, 8, -2, 1, [AS, EX]),
  w("lenguaGarfio", "Lengua garfio", 12, 1, 3, 6, -2, "D6+1", [PR]),
  w("lanzaMinas", "Lanzaesporas", 48, "D3", 4, 6, -1, 2, [EX, DV, PE, IN]),
  // --- Enjambre: cuerpo a cuerpo -------------------------------------------------------
  w("garras", "Garras", "CC", 3, 4, 3, -1, 1),
  w("mordiscos", "Garras y dientes", "CC", 1, 4, 3, 0, 1),
  w("venenoCegador", "Veneno cegador", "CC", 1, 4, 3, 0, 1),
  w("garrasGuerrero", "Garras de guerrero", "CC", 5, 3, 5, -1, 1),
  w("garraDesgarradora", "Garra desgarradora", "CC", 4, 2, 8, -2, 3),
  w("latigo", "Látigo", "CC", 8, 2, 4, -2, 1, [XA]),
  w("guadanasAlfa", "Guadañas", "CC", 6, 2, 6, -2, 2),
  w("cuchillasDobles", "Garras de acechador", "CC", 3, 3, 5, -2, 2, [GE]),
  w("guadanas", "Guadañas monstruosas", "CC", 6, 4, 9, -2, 3),
  w("guadanasExtra", "Guadañas de más", "CC", 2, 4, 9, -2, 3, [XA]),
  w("pinzasAplastantes", "Pinzas aplastantes", "CC", 4, 4, 12, -3, "D6+1"),
  w("espadaOsea", "Espada ósea y látigo", "CC", 6, 2, 9, -2, 3, [GE]),
  w("guadanasTirano", "Guadañas monstruosas", "CC", 4, 2, 7, -2, 2, [XA]),
  w("garrasLictor", "Garras de acechador oculto", "CC", 6, 2, 7, -2, 2, [PR]),
  w("garrasGuardiana", "Garras de la bestia", "CC", 10, 3, 10, -2, 3),
  w("fauces", "Fauces voraces", "CC", 14, 3, 7, -1, 2),
  w("palasExcavadoras", "Garras excavadoras", "CC", 4, 3, 14, -2, "D6+1", [XA]),
  w("patasPunzantes", "Patas punzantes", "CC", 2, 4, 5, 0, 1),
  // --- Reglas especiales (no son armas de ninguna ficha) -------------------------------
  // Estratagema Granadas (#52): 6 dados a 4+, cada éxito es una herida mortal (sin salvación)
  w("granadas", "Granadas", 8, 6, 4, 4, 0, 1),
  // Poderes psíquicos (#78): se resuelven como heridas mortales (D3, sin tirada para impactar)
  w("rayoMental", "Rayo mental", 18, "D3", null, 1, 0, 1),
  w("gritoPsiquico", "Grito psíquico", 18, "D3", null, 1, 0, 1),
  // Impacto (#111) y Mina flotante: un dado por miniatura; cada éxito, una herida mortal
  w("aterrizaje", "Aterrizaje", "CC", 1, 4, 1, 0, 1),
  w("estallidoBio", "Estallido", "CC", 1, 2, 1, 0, 1),
].map((x) => [x.id, x]));

export const DATASHEETS: Record<DatasheetId, Datasheet> = {
  // ===================================== LEGIÓN ASTRAL =====================================
  capitan: {
    id: "capitan", keywords: ["explosivos"], name: "Capitán", faction: "legion", character: true, type: "infanteria",
    profile: { M: 6, T: 5, Sv: 3, Inv: 4, W: 5, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 90 }], weapons: ["pistolaPesadaMaestra", "bolterMaestro", "armaEnergiaMaestra"],
    abilities: ["horaGloriosa"], model: "capitan", leads: ["asalto", "fuegoPesado", "guardiaHonor"],
    options: [
      { id: "plasma", name: "Pistola de plasma (en vez de la pistola pesada y el bólter)", who: "lider", replace: ["pistolaPesadaMaestra", "bolterMaestro"], with: "pistolaPlasmaMaestra", points: 0 },
      { id: "puno", name: "Puño de energía (en vez del arma de energía)", who: "lider", replace: "armaEnergiaMaestra", with: "punoEnergiaMaestro", points: 0 },
    ],
  },
  tanque: {
    id: "tanque", keywords: ["humo"], name: "Tanque Martillo", faction: "legion", big: true, type: "vehiculo", damaged: 4, deadlyDemise: "D3",
    profile: { M: 10, T: 10, Sv: 3, W: 11, Ld: 6, OC: 3 },
    sizes: [{ models: 1, points: 140, points3: 150 }], weapons: ["autocanonTanque", "canonesLaserTanque", "orugas"],
    abilities: ["destructor"], model: "tanque",
    options: [
      { id: "bolter", name: "Bólter de asalto montado", who: "lider", replace: [], with: "bolterTormenta", points: 0 },
      { id: "pesados", name: "Dos bólteres pesados (en vez de los cañones láser)", who: "lider", replace: "canonesLaserTanque", with: "bolteresPesadosTanque", points: 0 },
    ],
  },
  guardiaHonor: {
    id: "guardiaHonor", keywords: ["explosivos"], name: "Guardia de Honor", faction: "legion", type: "infanteria",
    profile: { M: 6, T: 5, Sv: 3, Inv: 4, W: 3, Ld: 6, OC: 1 },
    sizes: [{ models: 3, points: 90, points3: 110 }, { models: 6, points: 180, points3: 200 }], weapons: ["pistolaPesada", "espadaMaestra"],
    abilities: ["guardiaHoja"], model: "guardia",
    options: [
      { id: "volkite", name: "Sargento: pistola volkite (en vez de la pistola pesada)", who: "lider", replace: "pistolaPesada", with: "pistolaVolkite", points: 0 },
      { id: "plasma", name: "Sargento: pistola de plasma (en vez de la pistola pesada)", who: "lider", replace: "pistolaPesada", with: "pistolaPlasma", points: 0 },
    ],
  },
  ingeniero: {
    id: "ingeniero", keywords: ["explosivos"], name: "Ingeniero de Combate", faction: "legion", character: true, type: "infanteria",
    profile: { M: 6, T: 5, Sv: 2, W: 4, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 55 }], weapons: ["bolterForja", "pistolaGrav", "hachaServobrazo"],
    abilities: ["reparar"], model: "ingeniero", leads: ["asalto", "fuegoPesado"],
  },
  portaestandarte: {
    id: "portaestandarte", keywords: ["explosivos"], name: "Portaestandarte", faction: "legion", character: true, support: true, type: "infanteria",
    profile: { M: 6, T: 5, Sv: 3, W: 4, Ld: 6, OC: 2 },
    sizes: [{ models: 1, points: 40 }], weapons: ["pistolaBolter", "rifleBolter", "punosCeramita4"],
    abilities: ["estandarte", "alzarEstandarte"], model: "estandarte", leads: ["asalto", "fuegoPesado"],
    options: [
      { id: "energia", name: "Arma de energía (en vez del rifle bólter)", who: "lider", replace: "rifleBolter", with: "armaEnergia5", points: 0 },
    ],
  },
  saltadores: {
    id: "saltadores", keywords: ["explosivos"], name: "Saltadores de Asalto", faction: "legion", type: "infanteria",
    profile: { M: 12, T: 5, Sv: 3, W: 2, Ld: 6, OC: 1 },
    sizes: [{ models: 5, points: 95, points3: 105 }, { models: 10, points: 190, points3: 200 }], weapons: ["pistolaPesada", "espadaSierra"],
    abilities: ["vuelo", "despliegueProfundo", "impacto"], model: "saltador",
    options: [
      { id: "sgtPlasma", name: "Sargento: pistola de plasma (en vez de la pistola pesada)", who: "lider", replace: "pistolaPesada", with: "pistolaPlasma", points: 0 },
      { id: "sgtLlamas", name: "Sargento: pistola lanzallamas (en vez de la pistola pesada)", who: "lider", replace: "pistolaPesada", with: "pistolaLlamas", points: 0 },
      { id: "sgtPuno", name: "Sargento: puño de energía (en vez de la espada sierra)", who: "lider", replace: "espadaSierra", with: "punoEnergia", points: 0 },
      { id: "sgtEnergia", name: "Sargento: arma de energía (en vez de la espada sierra)", who: "lider", replace: "espadaSierra", with: "armaEnergia", points: 0 },
      { id: "plasma", name: "Un saltador: pistola de plasma (en vez de la pistola pesada)", who: "uno", replace: "pistolaPesada", with: "pistolaPlasma", points: 0 },
    ],
  },
  medico: {
    id: "medico", name: "Médico de Campaña", faction: "legion", character: true, support: true, type: "infanteria",
    profile: { M: 6, T: 5, Sv: 3, W: 4, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 45 }], weapons: ["pistolaAbsolvedora", "servoarmadura", "pistolaReductora"],
    abilities: ["sanador"], model: "medico", leads: ["asalto", "fuegoPesado", "guardiaHonor"],
  },
  francotiradores: {
    id: "francotiradores", keywords: ["explosivos", "humo"], name: "Francotiradores", faction: "legion", type: "infanteria",
    profile: { M: 8, T: 4, Sv: 3, W: 2, Ld: 6, OC: 1 },
    sizes: [{ models: 3, points: 85 }], weapons: ["pistolaBolter", "rifleFrancotirador", "punosCeramita"],
    abilities: ["infiltrador", "sigilo", "camaleon", "opticas"], model: "francotirador",
    options: [
      { id: "laser", name: "Todos: fusil láser (en vez del rifle de precisión)", who: "todos", replace: "rifleFrancotirador", with: "fusilLaser", points: 0 },
    ],
  },
  asalto: {
    id: "asalto", keywords: ["explosivos"], name: "Escuadra de Asalto Táctico", faction: "legion", type: "infanteria", battleline: true,
    profile: { M: 6, T: 5, Sv: 3, W: 2, Ld: 6, OC: 2 },
    sizes: [{ models: 5, points: 85 }, { models: 10, points: 170 }],
    weapons: ["pistolaBolter", "rifleBolter", "punos"],
    abilities: ["disciplina"], model: "legionario",
    options: [
      { id: "sgtSierra", name: "Sargento: espada sierra (en vez de los puños)", who: "lider", replace: "punos", with: "espadaSierra5", points: 0 },
      { id: "sgtEnergia", name: "Sargento: arma de energía (en vez de los puños)", who: "lider", replace: "punos", with: "armaEnergia", points: 0 },
      { id: "sgtPuno", name: "Sargento: puño de energía (en vez de los puños)", who: "lider", replace: "punos", with: "punoEnergia", points: 0 },
      { id: "sgtMartillo", name: "Sargento: martillo de trueno (en vez de los puños)", who: "lider", replace: "punos", with: "martilloTrueno", points: 0 },
      { id: "sgtPlasma", name: "Sargento: pistola de plasma (en vez del rifle)", who: "lider", replace: "rifleBolter", with: "pistolaPlasma", points: 0 },
      { id: "granadas", name: "Un legionario: lanzagranadas (cada 5)", who: "uno", replace: [], with: "lanzagranadas", points: 0 },
      { id: "granadas2", name: "Otro legionario: lanzagranadas (con 10)", who: "uno", replace: [], with: "lanzagranadas", points: 0, minModels: 10 },
    ],
  },
  fuegoPesado: {
    id: "fuegoPesado", keywords: ["explosivos"], name: "Escuadra de Fuego Pesado", faction: "legion", type: "infanteria",
    profile: { M: 6, T: 5, Sv: 3, W: 2, Ld: 6, OC: 1 },
    sizes: [{ models: 5, points: 140, points3: 150 }], weapons: ["pistolaBolter", "lanzaderaCastellana", "cohetesFrag", "punosCeramita"],
    abilities: ["opticas"], model: "pesado",
    options: [
      { id: "perf", name: "Todos: lanzacohetes perforante (en vez del de fragmentación)", who: "todos", replace: "cohetesFrag", with: "cohetesPerf", points: 0 },
      { id: "vengadora", name: "Sargento: lanzadera vengadora (en vez del lanzacohetes)", who: "lider", replace: ["cohetesFrag", "cohetesPerf"], with: "lanzaderaVengadora", points: 5 },
    ],
  },
  andador: {
    id: "andador", keywords: ["humo", "andador"], name: "Andador de Combate", faction: "legion", big: true, type: "vehiculo", deadlyDemise: 1,
    profile: { M: 6, T: 9, Sv: 2, W: 8, Ld: 6, OC: 3 },
    sizes: [{ models: 1, points: 135 }], weapons: ["canonAsalto", "bolterTormenta", "punoAndador"],
    abilities: ["sabiduria"], model: "andador",
    options: [
      { id: "laser", name: "Cañón láser gemelo (en vez del cañón de asalto)", who: "lider", replace: "canonAsalto", with: "canonLaserGemelo", points: 0 },
      { id: "fusion", name: "Multifusión (en vez del cañón de asalto)", who: "lider", replace: "canonAsalto", with: "multiFusion", points: 0 },
      { id: "plasma", name: "Cañón de plasma pesado (en vez del cañón de asalto)", who: "lider", replace: "canonAsalto", with: "canonPlasmaPesado", points: 0 },
      { id: "llamas", name: "Lanzallamas pesado (en vez del bólter de asalto)", who: "lider", replace: "bolterTormenta", with: "lanzallamasPesado", points: 0 },
    ],
  },
  exterminadores: {
    id: "exterminadores", name: "Exterminadores", faction: "legion", type: "infanteria",
    profile: { M: 5, T: 6, Sv: 2, Inv: 4, W: 3, Ld: 6, OC: 1 },
    sizes: [{ models: 5, points: 190, points3: 230 }, { models: 10, points: 380, points3: 420 }], weapons: ["bolterTormenta", "punoEnergia"],
    abilities: ["despliegueProfundo", "furiaPrimera"], model: "exterminador",
    options: [
      { id: "asalto", name: "Uno: cañón de asalto (en vez del bólter)", who: "uno", replace: "bolterTormenta", with: "canonAsalto", points: 0 },
      { id: "llamas", name: "Uno: lanzallamas pesado (en vez del bólter)", who: "uno", replace: "bolterTormenta", with: "lanzallamasPesado", points: 0 },
    ],
  },
  psiquico: {
    id: "psiquico", keywords: ["explosivos"], name: "Psíquico de la Legión", faction: "legion", character: true, type: "infanteria",
    profile: { M: 6, T: 5, Sv: 3, W: 4, Ld: 6, OC: 1 },
    sizes: [{ models: 1, points: 75 }], weapons: ["pistolaBolter", "golpeMental", "armaPsiquica"],
    abilities: ["cupula"], model: "psiquico", leads: ["asalto", "fuegoPesado"],
  },
  motoristas: {
    id: "motoristas", keywords: ["explosivos"], name: "Motoristas de Asalto", faction: "legion", type: "montada",
    profile: { M: 12, T: 6, Sv: 3, W: 4, Ld: 6, OC: 2 },
    sizes: [{ models: 3, points: 80 }, { models: 6, points: 160 }], weapons: ["pistolaPesada", "rifleGemelo", "espadaSierra"],
    abilities: ["aceleron"], model: "moto",
    options: [
      { id: "sgtEnergia", name: "Sargento: arma de energía (en vez de la espada sierra)", who: "lider", replace: "espadaSierra", with: "armaEnergia", points: 0 },
      { id: "sgtMartillo", name: "Sargento: martillo de trueno (en vez de la espada sierra)", who: "lider", replace: "espadaSierra", with: "martilloTrueno", points: 0 },
      { id: "plasma", name: "Un motorista: pistola de plasma (cada 3)", who: "uno", replace: "pistolaPesada", with: "pistolaPlasma", points: 0 },
    ],
  },
  // ======================================== ENJAMBRE ========================================
  acechadores: {
    id: "acechadores", name: "Acechadores", faction: "swarm", type: "infanteria",
    profile: { M: 10, T: 5, Sv: 4, W: 3, Ld: 8, OC: 1 },
    sizes: [{ models: 5, points: 125, points3: 135 }], weapons: ["cuchillasDobles"],
    abilities: ["tuneles"], model: "acechador",
  },
  mente: {
    id: "mente", name: "Mente del Enjambre", faction: "swarm", character: true, type: "infanteria",
    profile: { M: 10, T: 5, Sv: 3, W: 6, Ld: 7, OC: 1 },
    sizes: [{ models: 1, points: 75 }], weapons: ["garraDesgarradora", "guadanasAlfa", "latigo"],
    abilities: ["sinaptico", "alfa"], model: "mente", leads: ["garras", "escupidores", "nodo"],
  },
  carnifice: {
    id: "carnifice", name: "Carnífice", faction: "swarm", big: true, type: "monstruo", deadlyDemise: 1,
    profile: { M: 8, T: 9, Sv: 2, W: 8, Ld: 8, OC: 3 },
    sizes: [{ models: 1, points: 90 }, { models: 2, points: 180 }], weapons: ["guadanas", "guadanasExtra"],
    abilities: [], model: "carnifice",
    options: [
      { id: "venenoso", name: "Todos: cañón de veneno pesado (en vez de las guadañas de más)", who: "todos", replace: "guadanasExtra", with: "canonVenenoPesado", points: 0 },
      { id: "espinas", name: "Todos: cañón de espinas (en vez de las guadañas de más)", who: "todos", replace: "guadanasExtra", with: "canonEspinas", points: 0 },
      { id: "pinzas", name: "Todos: pinzas aplastantes (en vez de las guadañas de más)", who: "todos", replace: "guadanasExtra", with: "pinzasAplastantes", points: 0 },
      { id: "bioplasma", name: "Todos: bioplasma", who: "todos", replace: [], with: "bioplasma", points: 0 },
      { id: "puas", name: "Todos: bancos de púas", who: "todos", replace: [], with: "bancosPuas", points: 0 },
    ],
  },
  tirano: {
    id: "tirano", name: "Tirano Sináptico", faction: "swarm", character: true, big: true, type: "monstruo", deadlyDemise: "D3",
    profile: { M: 8, T: 10, Sv: 2, Inv: 4, W: 10, Ld: 7, OC: 3 },
    sizes: [{ models: 1, points: 195 }], weapons: ["espadaOsea", "guadanasTirano"],
    abilities: ["sinaptico", "embate", "voluntadColmena"], model: "tirano",
    options: [
      { id: "veneno", name: "Cañón de veneno pesado (en vez de las guadañas)", who: "lider", replace: "guadanasTirano", with: "canonVenenoTirano", points: 0 },
      { id: "espinas", name: "Cañón de espinas (en vez de las guadañas)", who: "lider", replace: "guadanasTirano", with: "canonEspinasTirano", points: 0 },
    ],
  },
  garras: {
    id: "garras", name: "Garras Menores", faction: "swarm", type: "infanteria", battleline: true,
    profile: { M: 10, T: 3, Sv: 5, W: 1, Ld: 8, OC: 2 },
    sizes: [{ models: 10, points: 70 }, { models: 20, points: 120 }], weapons: ["garras"],
    abilities: ["rapidez"], model: "garra",
  },
  escupidores: {
    id: "escupidores", name: "Escupidores", faction: "swarm", type: "infanteria", battleline: true,
    profile: { M: 6, T: 3, Sv: 5, W: 1, Ld: 8, OC: 2 },
    sizes: [{ models: 10, points: 55 }, { models: 20, points: 110 }], weapons: ["escupidor", "mordiscos"],
    abilities: [], model: "escupidor",
    options: [
      { id: "devorador", name: "Todos: devorador (en vez del escupidor)", who: "todos", replace: "escupidor", with: "devoradorCorto", points: 0 },
      { id: "puas", name: "Todos: lanzapúas de puño (en vez del escupidor)", who: "todos", replace: "escupidor", with: "puasGemelas", points: 0 },
    ],
  },
  aguijones: {
    id: "aguijones", name: "Aguijones", faction: "swarm", type: "infanteria",
    profile: { M: 6, T: 3, Sv: 6, W: 1, Ld: 8, OC: 1 },
    sizes: [{ models: 11, points: 45 }, { models: 22, points: 90 }], weapons: ["mordiscos"],
    abilities: ["neurocitos"], model: "aguijon",
  },
  lictor: {
    id: "lictor", name: "Acechador Oculto", faction: "swarm", type: "infanteria",
    profile: { M: 8, T: 6, Sv: 4, W: 6, Ld: 7, OC: 1 },
    sizes: [{ models: 1, points: 60 }], weapons: ["garrasLictor"],
    abilities: ["contraataque", "infiltrador", "sigilo", "solitario", "tentaculos"], model: "lictor",
  },
  guardiana: {
    id: "guardiana", name: "Bestia Guardiana", faction: "swarm", big: true, type: "monstruo", deadlyDemise: 1,
    profile: { M: 8, T: 9, Sv: 2, W: 10, Ld: 8, OC: 3 },
    sizes: [{ models: 1, points: 125, points3: 135 }], weapons: ["gritoBioplasma", "garrasGuardiana"],
    abilities: ["gritoMortal"], model: "guardiana",
  },
  devorador: {
    id: "devorador", name: "Devorador", faction: "swarm", big: true, type: "monstruo", deadlyDemise: "D3",
    profile: { M: 8, T: 11, Sv: 3, W: 14, Ld: 8, OC: 4 },
    sizes: [{ models: 1, points: 125, points3: 135 }], weapons: ["lenguaGarfio", "fauces", "palasExcavadoras"],
    abilities: ["espectaculo"], model: "devorador",
  },
  biomorteros: {
    id: "biomorteros", name: "Biomorteros", faction: "swarm", type: "infanteria", deadlyDemise: 1,
    profile: { M: 5, T: 6, Sv: 3, W: 5, Ld: 8, OC: 1 },
    sizes: [{ models: 1, points: 60 }, { models: 2, points: 100 }, { models: 3, points: 140 }], weapons: ["lanzaMinas", "patasPunzantes"],
    abilities: [], model: "biomortero",
  },
  reventadores: {
    id: "reventadores", name: "Reventadores", faction: "swarm", type: "bestia",
    profile: { M: 4, T: 1, Sv: 7, W: 1, Ld: 8, OC: 0 },
    sizes: [{ models: 3, points: 55 }, { models: 6, points: 110 }], weapons: [],
    abilities: ["minaFlotante", "vuelo", "despliegueProfundo"], model: "reventador",
  },
  gargolas: {
    id: "gargolas", name: "Gárgolas", faction: "swarm", type: "infanteria", battleline: true,
    profile: { M: 12, T: 3, Sv: 6, W: 1, Ld: 8, OC: 2 },
    sizes: [{ models: 10, points: 75 }, { models: 20, points: 150 }], weapons: ["escupidor", "venenoCegador"],
    abilities: ["vuelo", "despliegueProfundo"], model: "gargola",
  },
  nodo: {
    id: "nodo", name: "Guerreros Nodo", faction: "swarm", type: "infanteria",
    profile: { M: 6, T: 5, Sv: 4, W: 3, Ld: 7, OC: 2 },
    sizes: [{ models: 3, points: 60 }, { models: 6, points: 120 }], weapons: ["devoradorGuerrero", "garrasGuerrero"],
    abilities: ["sinaptico", "depredadores"], model: "nodo",
    options: [
      { id: "escupemuerte", name: "Todos: escupemuerte (en vez del devorador)", who: "todos", replace: "devoradorGuerrero", with: "escupeMuerte", points: 0 },
      { id: "puas", name: "Todos: lanzapúas de puño (en vez del devorador)", who: "todos", replace: "devoradorGuerrero", with: "puasGuerrero", points: 0 },
      { id: "estrangulador", name: "Uno: estrangulador (cada 3)", who: "uno", replace: ["devoradorGuerrero", "escupeMuerte", "puasGuerrero"], with: "estrangulador", points: 0 },
      { id: "veneno", name: "Uno: cañón de veneno (cada 3)", who: "uno", replace: ["devoradorGuerrero", "escupeMuerte", "puasGuerrero"], with: "canonVeneno", points: 0 },
    ],
  },
};

export function hasAbility(w: Weapon, kind: WeaponAbility["kind"]): boolean {
  return w.abilities.some((a) => a.kind === kind);
}

export function abilityX(w: Weapon, kind: "rafaga" | "sostenida" | "fusion"): number {
  const a = w.abilities.find((x) => x.kind === kind) as { x: number } | undefined;
  return a?.x ?? 0;
}

/**
 * Coste de una unidad con `models` miniaturas, o null si ese tamaño no existe. `nth` es cuántas
 * unidades de esta hoja lleva ya la lista contando esta (11.ª: la 3.ª y siguientes pueden costar más).
 */
export function unitPoints(ds: Datasheet, models: number, nth = 1): number | null {
  const size = ds.sizes.find((s) => s.models === models);
  if (!size) return null;
  return nth >= 3 && size.points3 !== undefined ? size.points3 : size.points;
}

/** Armas (ids) de una miniatura: las suyas propias si lleva equipo opcional, o las de su perfil. */
export function pieceWeaponIds(ds: Datasheet, p: { leader?: boolean; weapons?: string[] }): string[] {
  return p.weapons ?? (p.leader && ds.leaderWeapons ? ds.leaderWeapons : ds.weapons);
}

/**
 * Armas con que golpea en combate una miniatura (11.ª): la mejor de sus armas de combate normales
 * más todas las de Ataques extra.
 */
export function meleeWeaponIds(ds: Datasheet, p: { leader?: boolean; weapons?: string[] }): string[] {
  const cc = pieceWeaponIds(ds, p).filter((id) => WEAPONS[id]?.range === "CC");
  const extra = cc.filter((id) => hasAbility(WEAPONS[id], "ataquesExtra"));
  const score = (w: Weapon) => avgDice(w.attacks) * (7 - (w.skill ?? 4)) * w.strength * avgDice(w.damage) * (1 - w.ap * 0.25);
  const best = cc.filter((id) => !extra.includes(id)).sort((a, b) => score(WEAPONS[b]) - score(WEAPONS[a]))[0];
  return [...(best ? [best] : []), ...extra];
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
export function optionErrors(ds: Datasheet, ids: string[] = [], models?: number): string[] {
  const out: string[] = [];
  const chosen = ids.map((id) => ds.options?.find((x) => x.id === id));
  if (chosen.some((o) => !o)) out.push(`${ds.name}: equipo desconocido`);
  for (const o of chosen) if (o?.minModels && models !== undefined && models < o.minModels)
    out.push(`${ds.name}: «${o.name}» necesita ${o.minModels} miniaturas`);
  const seen = new Set<string>();
  for (const o of chosen) if (o && o.who !== "uno") {     // «uno» se lleva cada vez una miniatura distinta
    const k = `${o.who}|${[o.replace].flat().join(",")}`;
    if (seen.has(k)) out.push(`${ds.name}: dos opciones cambian la misma arma`);
    seen.add(k);
  }
  return out;
}

/** Armas de una miniatura según sea líder o no. */
export function weaponsOf(ds: Datasheet, leader: boolean): Weapon[] {
  return (leader && ds.leaderWeapons ? ds.leaderWeapons : ds.weapons).map((id) => WEAPONS[id]);
}

/** Nombre de los tipos de unidad, para Anti-X. */
export const UNIT_TYPE_NAME: Record<UnitType, string> = {
  infanteria: "infantería", montada: "montada", vehiculo: "vehículo", monstruo: "monstruo", bestia: "bestia", enjambre: "enjambre",
};

/** Etiqueta corta de una habilidad de arma: «Ráfaga 1», «Anti-vehículo 2+»… */
export function abilityLabel(a: WeaponAbility): string {
  if (a.kind === "rafaga") return `Ráfaga ${a.x}`;
  if (a.kind === "sostenida") return `Sostenida ${a.x}`;
  if (a.kind === "fusion") return `Fusión ${a.x}`;
  if (a.kind === "anti") return `Anti-${UNIT_TYPE_NAME[a.vs]} ${a.x}+`;
  return WEAPON_ABILITY_TEXT[a.kind].name;
}

/** Texto de una tirada de dados: 2, D3, D6, D3+3… */
export function diceText(d: Dice): string { return String(d); }

/** Texto de las habilidades de unidad, para la hoja de datos en pantalla. */
export const UNIT_ABILITY_TEXT: Record<UnitAbility, { name: string; text: string }> = {
  sinaptico: { name: "Sináptico", text: "Las unidades del Enjambre a 6\" o menos de una miniatura sináptica están en sinapsis: chequean la moral con 3D6 y suman +1 a la Fuerza de sus ataques de combate." },
  rapidez: { name: "Salto feroz", text: "Puede declarar una carga después de avanzar." },
  despliegueProfundo: { name: "Despliegue profundo", text: "Puede empezar en reserva y llegar en la fase de movimiento (desde la ronda 2) a cualquier punto a más de 8\" de los enemigos. Si al acabar la ronda 3 no ha llegado, se pierde." },
  tuneles: { name: "Túneles", text: "Puede empezar en reserva y salir de un túnel en la fase de movimiento (desde la ronda 2) a más de 8\" de los enemigos. Si al acabar la ronda 3 no ha llegado, se pierde." },
  infiltrador: { name: "Infiltrador", text: "Despliega en cualquier punto de su mitad de la mesa a más de 6\" de la línea central, no solo en su zona de despliegue." },
  vuelo: { name: "Vuelo", text: "Al mover, avanzar, retirarse o cargar pasa por encima de la escenografía sólida (contenedores, búnker, barricadas); no puede acabar encima." },
  impacto: { name: "Martillo de ira", text: "Al acabar una carga, tira un dado por cada miniatura trabada con la unidad cargada: cada 4+ le hace una herida mortal." },
  sanador: { name: "Botiquín", text: "En tu fase de mando, la escuadra a la que acompaña recupera D3+1 heridas: primero las de las miniaturas heridas y, con lo que sobre, vuelven miniaturas caídas." },
  estandarte: { name: "Honor de la compañía", text: "La escuadra a la que acompaña suma +1 al control de objetivos de cada miniatura." },
  alzarEstandarte: { name: "Alzar el estandarte", text: "Al acabar tu fase de movimiento, si su escuadra controla un objetivo, ese objetivo queda asegurado: sigue siendo tuyo aunque te vayas, hasta que el rival lo controle." },
  contraataque: { name: "Golpea primero", text: "Combate primero, como si hubiera cargado, aunque sea ella la cargada." },
  reparar: { name: "Bendición de la máquina", text: "Al empezar tu fase de mando, cura D3 heridas a un vehículo propio a 3\" o menos." },
  sigilo: { name: "Sigilo", text: "Los disparos contra ella la tratan siempre como en cobertura." },
  horaGloriosa: { name: "Hora gloriosa", text: "Una vez por partida, la primera vez que combate: +3 ataques con su arma de combate y sus heridas críticas no permiten salvación (Devastadora)." },
  destructor: { name: "Destructor", text: "Sus disparos contra infantería mejoran 1 la penetración." },
  guardiaHoja: { name: "Guardia de la hoja", text: "Una vez por turno, en la fase de combate: si la atacan antes de golpear, los ataques contra ella restan 1 para impactar; si golpea primero, suma +1 para impactar." },
  opticas: { name: "Ópticas de puntería", text: "Sus disparos ignoran la cobertura." },
  disciplina: { name: "Disciplina bólter", text: "+1 para impactar al disparar si la unidad o su objetivo están a alcance de un objetivo." },
  sabiduria: { name: "Sabiduría de los antiguos", text: "La infantería propia a 6\" o menos repite los 1 al impactar." },
  furiaPrimera: { name: "Furia de la Primera", text: "Sus ataques contra unidades a 9\" o menos mejoran 1 la penetración." },
  cupula: { name: "Cúpula de fuerza", text: "Al empezar tu fase de movimiento tira 1D6: con 1 su escuadra queda desmoralizada; si no, tiene invulnerable 4+ hasta tu siguiente turno." },
  aceleron: { name: "Asalto a todo gas", text: "El turno que carga, sus armas de combate tienen Sostenida 1; el martillo de trueno suma +1 para impactar y las demás, +1 al daño." },
  embate: { name: "Embate", text: "Las armas a distancia de tus unidades a 6\" o menos de él tienen Asalto y Letal." },
  voluntadColmena: { name: "Voluntad de la colmena", text: "Una vez por ronda, una estratagema usada en una unidad propia a 12\" o menos de él cuesta 1 PM menos." },
  neurocitos: { name: "Neurocitos", text: "Si está en sinapsis de otra unidad (que no sean Aguijones), ella también es sináptica." },
  solitario: { name: "Operativo solitario", text: "Si no acompaña a una escuadra, solo pueden dispararle enemigos a 12\" o menos." },
  tentaculos: { name: "Tentáculos devoradores", text: "Cada vez que mata a un personaje enemigo, ganas 1 PM." },
  gritoMortal: { name: "Grito de muerte", text: "Tras disparar, una unidad a la que ha impactado chequea moral con −1, esté como esté." },
  espectaculo: { name: "Espectáculo horrendo", text: "Si al combatir destruye una unidad, cada unidad enemiga a 6\" o menos chequea moral." },
  minaFlotante: { name: "Muerte flotante", text: "Cuando ella o un enemigo acaban un movimiento, cada mina a 3\" o menos de un enemigo revienta: con 2–5 en 1D6 le hace 1 herida mortal; con un 6, D3." },
  depredadores: { name: "Depredadores adaptables", text: "Puede disparar y cargar aunque se haya retirado este turno." },
  camaleon: { name: "Capas camaleónicas", text: "Su alcance de detección baja 3\": oculta, solo la ven los enemigos a 12\" (9\" cuerpo a tierra)." },
  alfa: { name: "Guerrero alfa", text: "Mientras lidera una escuadra, las armas de esa escuadra tienen Sostenida 1." },
};
