import { canReserve, reserveErrors, sendToReserves } from "./reserves";
import { onForbiddenTerrain } from "./geometry";
import { resolveOverlaps } from "../core/placement";
import { zoneBand } from "./deployment";
import { DEFAULT_MISSION, MissionId, setupMission } from "./missions";
import { BASE_RADIUS, BOARD, DEPLOY_DEPTH, Faction, GameState, Piece, Unit } from "../core/state";
import { DATASHEETS, DatasheetId, optionErrors, optionPoints, pieceWeaponIds, unitPoints } from "./datasheets";

// Listas de ejército y despliegue en las zonas de cada bando.

export interface ArmyEntry {
  datasheet: DatasheetId;
  models: number;
  /** Personaje: índice (en la lista) de la escuadra que lidera. */
  leads?: number;
  /** Empieza en reserva (#56): solo unidades con Despliegue profundo o Túneles. */
  reserve?: boolean;
  /** Equipo opcional elegido (#63): ids de `Datasheet.options`. */
  options?: string[];
  /** Veterana (campaña, #71). */
  veteran?: boolean;
}
export interface ArmyList { name?: string; units: ArmyEntry[] }

export const POINTS_LIMIT = 500;

export function listPoints(list: ArmyList): number {
  return list.units.reduce((n, u) => n + (unitPoints(DATASHEETS[u.datasheet], u.models) ?? 0) + optionPoints(DATASHEETS[u.datasheet], u.models, u.options), 0);
}

/** Errores de una lista según el reglamento (vacío si es válida). */
export function validateList(list: ArmyList, faction: Faction, limit = POINTS_LIMIT): string[] {
  const errs: string[] = [];
  const counts = new Map<DatasheetId, number>();
  let big = 0, characters = 0;
  for (const u of list.units) {
    const ds = DATASHEETS[u.datasheet];
    if (!ds) { errs.push(`Hoja desconocida: ${u.datasheet}`); continue; }
    if (ds.faction !== faction) errs.push(`${ds.name} no es de este bando.`);
    if (unitPoints(ds, u.models) === null) errs.push(`${ds.name}: ${u.models} miniaturas no es un tamaño válido.`);
    errs.push(...optionErrors(ds, u.options));
    counts.set(u.datasheet, (counts.get(u.datasheet) ?? 0) + 1);
    if (ds.big) big++;
    if (ds.character) characters++;
  }
  errs.push(...reserveErrors(list));
  // Líderes: solo a escuadras que puedan liderar, y una escuadra con un líder como mucho
  const led = new Set<number>();
  for (const u of list.units) {
    if (u.leads === undefined) continue;
    const ds = DATASHEETS[u.datasheet], to = list.units[u.leads];
    if (!ds?.leads || !to || !ds.leads.includes(to.datasheet)) errs.push(`${ds?.name ?? u.datasheet} no puede liderar esa unidad.`);
    else if (led.has(u.leads)) errs.push(`${DATASHEETS[to.datasheet].name} tiene dos líderes.`);
    led.add(u.leads);
  }
  // Batallas de 1000 puntos (#88): el doble de todo (6 iguales, 2 Andadores o Tiranos)
  const k = Math.max(1, Math.round(limit / POINTS_LIMIT));
  for (const [id, n] of counts) if (n > 3 * k) errs.push(`Como mucho ${3 * k} ${DATASHEETS[id].name} (hay ${n}).`);
  if (big > k) errs.push(k > 1 ? `Como mucho ${k} Andadores o Tiranos.` : "Como mucho 1 Andador o Tirano.");
  if (!characters) errs.push("Hace falta al menos un personaje (Capitán o Tirano Sináptico).");
  const pts = listPoints(list);
  if (pts > limit) errs.push(`${pts} puntos: pasa de ${limit}.`);
  if (!list.units.length) errs.push("La lista está vacía.");
  return errs;
}

/**
 * Sustituye las unidades y miniaturas de los dos bandos por las de estas listas, desplegadas en
 * sus zonas: cada unidad en un bloque de filas de hasta 5, unidades una al lado de otra.
 * Muta `s`. Determinista.
 */
export function deployArmies(s: GameState, legion: ArmyList, swarm: ArmyList, mission: MissionId = DEFAULT_MISSION) {
  s.units = [];
  s.pieces = [];
  s.reserves = [];
  const reserved: string[] = [];
  let unitN = 0;
  for (const [faction, list] of [["legion", legion], ["swarm", swarm]] as [Faction, ArmyList][]) {
    const prefix = faction === "legion" ? "L" : "E";
    const dir = faction === "legion" ? 1 : -1;              // hacia su borde de la mesa
    const front = dir * (BOARD.d / 2 - DEPLOY_DEPTH + 0.8);  // primera fila, junto al borde de su zona
    let pieceN = 0;
    // Bloques: ancho de cada unidad. Cada líder va justo detrás (al lado) de su escuadra.
    const valid = (i: number) => {
      const u = list.units[i], to = u.leads !== undefined ? list.units[u.leads] : undefined;
      return !!to && !!DATASHEETS[u.datasheet].leads?.includes(to.datasheet) && list.units.findIndex((x) => x.leads === u.leads) === i;
    };
    const order: number[] = [];
    list.units.forEach((u, i) => { if (!valid(i)) order.push(i); });
    list.units.forEach((u, i) => { if (valid(i)) order.splice(order.indexOf(u.leads!) + 1, 0, i); });
    const blocks = order.map((i) => {
      const u = list.units[i];
      const ds = DATASHEETS[u.datasheet];
      const r = BASE_RADIUS[ds.model];
      const perRow = Math.min(5, u.models);
      const step = 2 * r + 0.6;
      return { i, u, ds, r, perRow, step, width: (perRow - 1) * step + 2 * r, attached: valid(i) };
    });
    const gapBetween = 3, gapLeader = 0.6;
    const gapBefore = (b: (typeof blocks)[number]) => (b.attached ? gapLeader : gapBetween);
    const total = blocks.reduce((n, b, k) => n + b.width + (k ? gapBefore(b) : 0), 0);
    const unitIdOf = new Map<number, string>();
    let x = -Math.min(total, BOARD.w - 2) / 2;
    let rowOffset = 0;
    blocks.forEach((b, k) => {
      if (k) x += gapBefore(b);
      if (x + b.width > BOARD.w / 2 - 1) { x = -BOARD.w / 2 + 1; rowOffset += 6; }   // otra franja si no cabe
      const unit: Unit = { id: `U${++unitN}`, datasheet: b.u.datasheet, faction, startingModels: b.u.models };
      const extra = optionPoints(b.ds, b.u.models, b.u.options);
      if (extra) unit.points = (unitPoints(b.ds, b.u.models) ?? 0) + extra;
      if (b.u.veteran) unit.veteran = true;
      unit.entry = b.i;
      if (b.attached) unit.attachedTo = unitIdOf.get(b.u.leads!);
      unitIdOf.set(b.i, unit.id);
      if (b.u.reserve && canReserve(b.ds)) reserved.push(unit.id);
      s.units.push(unit);
      for (let i = 0; i < b.u.models; i++) {
        const col = i % b.perRow, row = Math.floor(i / b.perRow);
        const p: Piece = {
          id: `${prefix}${++pieceN}`, faction, model: b.ds.model,
          x: x + b.r + col * b.step + (row % 2) * b.step * 0.5 * (b.perRow > 1 ? 1 : 0),
          z: front + dir * (b.r + rowOffset + row * b.step),
          rot: faction === "legion" ? Math.PI : 0,
          pose: (i * 2 + unitN) % 3, unit: unit.id,
          leader: i === Math.min(2, b.u.models - 1) && (b.ds.leaderWeapons !== undefined || faction === "swarm") && b.u.models > 1,
        };
        p.x = Math.max(-BOARD.w / 2 + b.r, Math.min(BOARD.w / 2 - b.r, p.x));
        p.z = Math.max(-BOARD.d / 2 + b.r, Math.min(BOARD.d / 2 - b.r, p.z));
        s.pieces.push(p);
      }
      applyOptions(s, unit.id, b.u.options);
      x += b.width;
    });
  }
  // Reservas (#56): fuera de la mesa hasta que lleguen
  sendToReserves(s, reserved);
  // Nadie empieza encima de contenedores, búnker o barricadas: al hueco más cercano de su zona
  const mine = s.pieces.filter((p) => p.unit);
  const fixed = resolveOverlaps(s.pieces, mine.map((p) => ({ id: p.id, x: p.x, z: p.z })), {
    zBand: (id) => { const p = mine.find((x) => x.id === id)!; return zoneBand(p.faction, BASE_RADIUS[p.model]); },
    blocked: (x, z, r) => onForbiddenTerrain(s.terrain, x, z, r + 0.05) !== null,
  });
  const at = new Map(fixed.map((m) => [m.id, m]));
  s.pieces = s.pieces.map((p) => { const m = at.get(p.id); return m ? { ...p, x: m.x, z: m.z } : p; });
  // Partida nueva: empieza en la fase de despliegue, con los dos bandos a 1 PM
  s.turnLog = { moves: {}, origins: {} };
  s.turn = 1; s.active = 0; s.phase = "despliegue"; s.cp = [1, 1]; s.gameOver = false;
  s.combatLog = []; s.moraleLog = []; s.history = [];
  setupMission(s, mission);
}

/** Listas de la partida de prueba (#25): 460 y 485 puntos (las Garras bajaron de precio en #51). */
export const TEST_LEGION: ArmyList = { name: "Prueba Legión", units: [
  { datasheet: "capitan", models: 1, leads: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "asalto", models: 5 }, { datasheet: "fuegoPesado", models: 5 },
] };
export const TEST_SWARM: ArmyList = { name: "Prueba Enjambre", units: [
  { datasheet: "tirano", models: 1 }, { datasheet: "nodo", models: 3 }, { datasheet: "garras", models: 20 }, { datasheet: "escupidores", models: 10 }, { datasheet: "garras", models: 10 },
] };

/**
 * Equipo opcional (#63): da a cada miniatura afectada su propia lista de armas. «uno» elige una
 * miniatura normal distinta por cada opción; «todos», todas las que lleven el arma cambiada.
 */
export function applyOptions(s: GameState, unitId: string, ids: string[] = []) {
  const u = s.units.find((x) => x.id === unitId);
  if (!u || !ids.length) return;
  const ds = DATASHEETS[u.datasheet];
  const ps = s.pieces.filter((p) => p.unit === unitId);
  const used = new Set<string>();
  const swap = (p: Piece, from: string, to: string) => {
    const cur = pieceWeaponIds(ds, p);
    if (cur.includes(from)) p.weapons = cur.map((w) => (w === from ? to : w));
  };
  for (const id of ids) {
    const o = ds.options?.find((x) => x.id === id);
    if (!o) continue;
    if (o.who === "lider") { for (const p of ps.filter((q) => q.leader)) swap(p, o.replace, o.with); }
    else if (o.who === "todos") { for (const p of ps) swap(p, o.replace, o.with); }
    else {
      const p = [...ps].reverse().find((q) => !q.leader && !used.has(q.id) && pieceWeaponIds(ds, q).includes(o.replace));
      if (p) { used.add(p.id); swap(p, o.replace, o.with); }
    }
  }
}

/** Tamaños de partida (#88). */
export const GAME_SIZES = { 500: "Escaramuza (500 puntos)", 1000: "Batalla (1.000 puntos)" } as const;
export type GameSize = keyof typeof GAME_SIZES;

/** Listas de prueba para cada tamaño (las de 1000, dos veces las de 500). */
export function testLists(size: number): { legion: ArmyList; swarm: ArmyList } {
  if (size < 1000) return { legion: TEST_LEGION, swarm: TEST_SWARM };
  const twice = (l: ArmyList): ArmyList => ({
    name: `${l.name} (1000)`,
    units: [...l.units.map((u) => ({ ...u })), ...l.units.map((u) => ({ ...u, ...(u.leads !== undefined ? { leads: u.leads + l.units.length } : {}) }))],
  });
  return { legion: twice(TEST_LEGION), swarm: twice(TEST_SWARM) };
}
