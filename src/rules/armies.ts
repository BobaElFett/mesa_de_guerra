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

/** Tamaño de partida por defecto: Incursión de la 11.ª edición (fase 30). */
export const POINTS_LIMIT = 1000;

/** Cuántas unidades de la misma hoja lleva la lista hasta la `i` incluida (para el coste de la 3.ª+). */
export function nthOfSheet(list: ArmyList, i: number): number {
  return list.units.slice(0, i + 1).filter((u) => u.datasheet === list.units[i].datasheet).length;
}

/** Coste de la entrada `i` de la lista: tamaño (según cuántas iguales van antes) y equipo. */
export function entryPoints(list: ArmyList, i: number): number {
  const u = list.units[i], ds = DATASHEETS[u.datasheet];
  if (!ds) return 0;
  return (unitPoints(ds, u.models, nthOfSheet(list, i)) ?? 0) + optionPoints(ds, u.models, u.options);
}

export function listPoints(list: ArmyList): number {
  return list.units.reduce((n, _u, i) => n + entryPoints(list, i), 0);
}

/**
 * Unidades con el mismo nombre (11.ª, Incursión): 2, o 4 si son de línea de batalla. Desde la
 * fase 30 sustituye al límite de unidades grandes.
 */
export function unitLimit(ds: { battleline?: boolean }): number {
  return ds.battleline ? 4 : 2;
}

/** Errores de una lista según el reglamento (vacío si es válida). */
export function validateList(list: ArmyList, faction: Faction, limit = POINTS_LIMIT): string[] {
  const errs: string[] = [];
  const counts = new Map<DatasheetId, number>();
  let characters = 0;
  for (const u of list.units) {
    const ds = DATASHEETS[u.datasheet];
    if (!ds) { errs.push(`Hoja desconocida: ${u.datasheet}`); continue; }
    if (ds.faction !== faction) errs.push(`${ds.name} no es de este bando.`);
    if (unitPoints(ds, u.models) === null) errs.push(`${ds.name}: ${u.models} miniaturas no es un tamaño válido.`);
    errs.push(...optionErrors(ds, u.options, u.models));
    counts.set(u.datasheet, (counts.get(u.datasheet) ?? 0) + 1);
    if (ds.character) characters++;
  }
  errs.push(...reserveErrors(list));
  // Líderes: solo a escuadras que puedan liderar; cada escuadra, un líder y un apoyo como mucho
  const led = new Set<string>();
  for (const u of list.units) {
    if (u.leads === undefined) continue;
    const ds = DATASHEETS[u.datasheet], to = list.units[u.leads];
    if (!ds?.leads || !to || !ds.leads.includes(to.datasheet)) { errs.push(`${ds?.name ?? u.datasheet} no puede liderar esa unidad.`); continue; }
    const key = `${u.leads}|${ds.support ? "apoyo" : "lider"}`;
    if (led.has(key)) errs.push(`${DATASHEETS[to.datasheet].name} lleva dos ${ds.support ? "personajes de apoyo" : "líderes"}.`);
    led.add(key);
  }
  // Unidades con el mismo nombre (11.ª): 2, o 4 de línea de batalla
  for (const [id, n] of counts) if (n > unitLimit(DATASHEETS[id])) errs.push(`Como mucho ${unitLimit(DATASHEETS[id])} ${DATASHEETS[id].name} (hay ${n}).`);
  if (!characters) errs.push("Hace falta al menos un personaje (Capitán, Psíquico, Médico, Portaestandarte, Tirano o Mente).");
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
      const sup = !!DATASHEETS[u.datasheet].support;
      return !!to && !!DATASHEETS[u.datasheet].leads?.includes(to.datasheet)
        && list.units.findIndex((x) => x.leads === u.leads && !!DATASHEETS[x.datasheet].support === sup) === i;
    };
    const order: number[] = [];
    list.units.forEach((u, i) => { if (!valid(i)) order.push(i); });
    list.units.forEach((u, i) => { if (valid(i)) { let at = order.indexOf(u.leads!) + 1; while (at < order.length && list.units[order[at]].leads === u.leads) at++; order.splice(at, 0, i); } });
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
    // Un personaje unido va al lado de su escuadra; con líder y apoyo, los dos detrás de ella, uno en
    // cada punta (así todas quedan en coherencia con dos miniaturas)
    const charsOf = (i: number) => blocks.filter((x) => x.attached && x.u.leads === i).length;
    const behindSquad = (b: (typeof blocks)[number]) => b.attached && charsOf(b.u.leads!) > 1;
    const total = blocks.reduce((n, b, k) => n + (behindSquad(b) ? 0 : b.width + (k ? gapBefore(b) : 0)), 0);
    const unitIdOf = new Map<number, string>();
    const squadAt = new Map<number, { x: number; rowOffset: number; r: number; step: number; rows: number; perRow: number; chars: number }>();
    let x = -Math.min(total, BOARD.w - 2) / 2;
    let rowOffset = 0;
    blocks.forEach((b, k) => {
      const sq = behindSquad(b) ? squadAt.get(b.u.leads!) : undefined;
      if (!sq) {
        if (k) x += gapBefore(b);
        if (x + b.width > BOARD.w / 2 - 1) { x = -BOARD.w / 2 + 1; rowOffset += 6; }   // otra franja si no cabe
      }
      const unit: Unit = { id: `U${++unitN}`, datasheet: b.u.datasheet, faction, startingModels: b.u.models };
      const cost = entryPoints(list, b.i);
      if (cost !== unitPoints(b.ds, b.u.models)) unit.points = cost;   // equipo de pago o 3.ª unidad igual
      if (b.u.veteran) unit.veteran = true;
      unit.entry = b.i;
      if (b.attached) unit.attachedTo = unitIdOf.get(b.u.leads!);
      unitIdOf.set(b.i, unit.id);
      if (b.u.reserve && canReserve(b.ds)) reserved.push(unit.id);
      s.units.push(unit);
      if (!b.attached) squadAt.set(b.i, { x, rowOffset, r: b.r, step: b.step, rows: Math.ceil(b.u.models / b.perRow), perRow: b.perRow, chars: 0 });
      for (let i = 0; i < b.u.models; i++) {
        const col = i % b.perRow, row = Math.floor(i / b.perRow);
        // Detrás de la primera o de la penúltima columna (la última fila va desplazada media si es par)
        const behind = sq ? { x: sq.x + sq.r + ((sq.chars ? Math.max(1, sq.perRow - 2) : 0) + (sq.rows % 2 === 0 ? 1 : 0)) * sq.step,
          z: front + dir * (sq.r + sq.rowOffset + sq.rows * sq.step + Math.max(0, b.r - sq.r)) } : null;
        const p: Piece = {
          id: `${prefix}${++pieceN}`, faction, model: b.ds.model,
          x: behind ? behind.x : x + b.r + col * b.step + (row % 2) * b.step * 0.5 * (b.perRow > 1 ? 1 : 0),
          z: behind ? behind.z : front + dir * (b.r + rowOffset + row * b.step),
          rot: faction === "legion" ? Math.PI : 0,
          pose: (i * 2 + unitN) % 3, unit: unit.id,
          leader: i === Math.min(2, b.u.models - 1) && b.u.models > 1,
        };
        p.x = Math.max(-BOARD.w / 2 + b.r, Math.min(BOARD.w / 2 - b.r, p.x));
        p.z = Math.max(-BOARD.d / 2 + b.r, Math.min(BOARD.d / 2 - b.r, p.z));
        s.pieces.push(p);
      }
      applyOptions(s, unit.id, b.u.options);
      if (sq) sq.chars++;
      else x += b.width;
    });
  }
  // Reservas (#56): fuera de la mesa hasta que lleguen
  sendToReserves(s, reserved);
  // Nadie empieza encima de contenedores, búnker o barricadas: al hueco más cercano de su zona
  const mine = s.pieces.filter((p) => p.unit);
  const fixed = resolveOverlaps(s.pieces, mine.map((p) => ({ id: p.id, x: p.x, z: p.z })), {
    zBand: (id) => { const p = mine.find((x) => x.id === id)!; return zoneBand(p.faction, BASE_RADIUS[p.model]); },   // al empezar, todos en su zona
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

/** Listas de la partida de prueba (#25): 485 y 500 puntos con los costes de la 11.ª (fase 30). */
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
  // Cambia por `to` la primera de `from` que lleve y quita las demás; con `from` vacía, la añade
  const swap = (p: Piece, from: string | string[], to: string) => {
    const cur = pieceWeaponIds(ds, p), list = [from].flat();
    if (!list.length) { p.weapons = [...cur, to]; return; }
    const at = cur.findIndex((w) => list.includes(w));
    if (at < 0) return;
    p.weapons = cur.flatMap((w, k) => (k === at ? [to] : list.includes(w) ? [] : [w]));
  };
  const carries = (p: Piece, from: string | string[]) => { const list = [from].flat(); return !list.length || pieceWeaponIds(ds, p).some((w) => list.includes(w)); };
  for (const id of ids) {
    const o = ds.options?.find((x) => x.id === id);
    if (!o) continue;
    if (o.who === "lider") { const lead = ps.filter((q) => q.leader); for (const p of lead.length ? lead : ps.length === 1 ? ps : []) swap(p, o.replace, o.with); }
    else if (o.who === "todos") { for (const p of ps) swap(p, o.replace, o.with); }
    else {
      const p = [...ps].reverse().find((q) => !q.leader && !used.has(q.id) && carries(q, o.replace));
      if (p) { used.add(p.id); swap(p, o.replace, o.with); }
    }
  }
}

/** Tamaños de partida (#88). */
export const GAME_SIZES = { 500: "Escaramuza (500 puntos)", 1000: "Incursión (1.000 puntos)" } as const;
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
