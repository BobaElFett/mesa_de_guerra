import { Faction } from "../core/state";
import { nextRandom } from "../core/rng";
import { ArmyEntry, ArmyList, listPoints, POINTS_LIMIT, unitLimit, validateList } from "./armies";
import { DATASHEETS, Datasheet, DatasheetId } from "./datasheets";
import { canReserve, deepStrikes } from "./reserves";

// Listas al azar (#82): una lista válida de hasta 1.000 puntos (o los que se pidan), con un personaje (que lidera si
// puede), equipo opcional y, a veces, reservas. Con semilla, para repetirla y para las pruebas.

export function randomList(faction: Faction, seed: number, limit = POINTS_LIMIT): ArmyList {
  let st = seed >>> 0;
  const rnd = () => { const [r, s] = nextRandom(st); st = s; return r; };
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const sheets = Object.values(DATASHEETS).filter((d) => d.faction === faction);
  const chars = sheets.filter((d) => d.character), troops = sheets.filter((d) => !d.character);

  for (let attempt = 0; attempt < 60; attempt++) {
    const units: ArmyEntry[] = [];
    const cost = (e: ArmyEntry) => listPoints({ units: [...units, e] }) - listPoints({ units });
    const add = (ds: Datasheet): ArmyEntry | null => {
      const size = rnd() < 0.6 ? ds.sizes[0] : pick(ds.sizes);   // más unidades, más pequeñas
      const e: ArmyEntry = { datasheet: ds.id as DatasheetId, models: size.models };
      // Equipo: cada opción con un 40 %; las que se excluyen, una sola
      const taken = new Set<string>();
      for (const o of ds.options ?? []) {
        const k = `${o.who}|${[o.replace].flat().join(",")}`;
        if (o.minModels && e.models < o.minModels) continue;
        if (rnd() < 0.4 && (o.who === "uno" || !taken.has(k))) { (e.options ??= []).push(o.id); taken.add(k); }
      }
      if (listPoints({ units }) + cost(e) > limit) { delete e.options; if (listPoints({ units }) + cost(e) > limit) return null; }
      units.push(e);
      return e;
    };
    const leader = add(pick(chars));
    if (!leader) continue;
    // Tropas hasta acercarse al límite (respetando cuántas iguales se pueden llevar)
    for (let tries = 0; tries < 60 && listPoints({ units }) < limit - 40; tries++) {
      const ds = pick(rnd() < 0.15 ? chars : troops);
      if (units.filter((u) => u.datasheet === ds.id).length >= unitLimit(ds)) continue;
      add(ds);
    }
    // Cada personaje lidera (o acompaña) una escuadra que pueda
    units.forEach((c) => {
      const cd = DATASHEETS[c.datasheet];
      if (!cd.character || !cd.leads) return;
      const i = units.findIndex((u) => cd.leads!.includes(u.datasheet)
        && !units.some((o) => o !== c && o.leads === units.indexOf(u) && !!DATASHEETS[o.datasheet].support === !!cd.support));
      if (i >= 0) c.leads = i;
    });
    // Reservas (a veces), sin pasar de la mitad de los puntos
    for (const u of units) {
      if (u.leads !== undefined || !canReserve(DATASHEETS[u.datasheet]) || rnd() < (deepStrikes(DATASHEETS[u.datasheet]) ? 0.5 : 0.88)) continue;
      u.reserve = true;
      if (validateList({ units }, faction, limit).length) delete u.reserve;
    }
    const list: ArmyList = { name: "Al azar", units };
    if (!validateList(list, faction, limit).length && listPoints(list) >= limit - Math.max(120, limit * 0.1)) return list;
  }
  throw new Error("No se pudo hacer una lista al azar válida");
}
