import { BASE_RADIUS, BOARD, DEPLOY_DEPTH, Faction, GameState, Piece, Unit } from "../core/state";
import { DATASHEETS, DatasheetId, unitPoints } from "./datasheets";

// Listas de ejército y despliegue en las zonas de cada bando.

export interface ArmyEntry { datasheet: DatasheetId; models: number }
export interface ArmyList { name?: string; units: ArmyEntry[] }

export const POINTS_LIMIT = 500;

export function listPoints(list: ArmyList): number {
  return list.units.reduce((n, u) => n + (unitPoints(DATASHEETS[u.datasheet], u.models) ?? 0), 0);
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
    counts.set(u.datasheet, (counts.get(u.datasheet) ?? 0) + 1);
    if (ds.big) big++;
    if (ds.character) characters++;
  }
  for (const [id, n] of counts) if (n > 3) errs.push(`Como mucho 3 ${DATASHEETS[id].name} (hay ${n}).`);
  if (big > 1) errs.push("Como mucho 1 Andador o Tirano.");
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
export function deployArmies(s: GameState, legion: ArmyList, swarm: ArmyList) {
  s.units = [];
  s.pieces = [];
  let unitN = 0;
  for (const [faction, list] of [["legion", legion], ["swarm", swarm]] as [Faction, ArmyList][]) {
    const prefix = faction === "legion" ? "L" : "E";
    const dir = faction === "legion" ? 1 : -1;              // hacia su borde de la mesa
    const front = dir * (BOARD.d / 2 - DEPLOY_DEPTH + 0.8);  // primera fila, junto al borde de su zona
    let pieceN = 0;
    // Bloques: ancho de cada unidad
    const blocks = list.units.map((u) => {
      const ds = DATASHEETS[u.datasheet];
      const r = BASE_RADIUS[ds.model];
      const perRow = Math.min(5, u.models);
      const step = 2 * r + 0.6;
      return { u, ds, r, perRow, step, width: (perRow - 1) * step + 2 * r };
    });
    const gapBetween = 3;
    const total = blocks.reduce((n, b) => n + b.width, 0) + gapBetween * (blocks.length - 1);
    let x = -Math.min(total, BOARD.w - 2) / 2;
    let rowOffset = 0;
    for (const b of blocks) {
      if (x + b.width > BOARD.w / 2 - 1) { x = -BOARD.w / 2 + 1; rowOffset += 6; }   // otra franja si no cabe
      const unit: Unit = { id: `U${++unitN}`, datasheet: b.u.datasheet, faction, startingModels: b.u.models };
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
      x += b.width + gapBetween;
    }
  }
  s.turnLog = { moves: {}, origins: {} };
}

/** Listas de la partida de prueba (#25): unos 450 puntos por bando. */
export const TEST_LEGION: ArmyList = { name: "Prueba Legión", units: [
  { datasheet: "capitan", models: 1 }, { datasheet: "asalto", models: 10 }, { datasheet: "asalto", models: 5 }, { datasheet: "fuegoPesado", models: 5 },
] };
export const TEST_SWARM: ArmyList = { name: "Prueba Enjambre", units: [
  { datasheet: "tirano", models: 1 }, { datasheet: "nodo", models: 3 }, { datasheet: "garras", models: 20 }, { datasheet: "escupidores", models: 10 },
] };
