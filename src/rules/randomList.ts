import { Faction } from "../core/state";
import { nextRandom } from "../core/rng";
import { ArmyEntry, ArmyList, listPoints, POINTS_LIMIT, validateList } from "./armies";
import { DATASHEETS, Datasheet, DatasheetId, optionPoints, unitPoints } from "./datasheets";
import { canReserve } from "./reserves";

// Listas al azar (#82): una lista válida de hasta 500 puntos, con un personaje (que lidera si
// puede), equipo opcional y, a veces, reservas. Con semilla, para repetirla y para las pruebas.

export function randomList(faction: Faction, seed: number, limit = POINTS_LIMIT): ArmyList {
  let st = seed >>> 0;
  const rnd = () => { const [r, s] = nextRandom(st); st = s; return r; };
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const sheets = Object.values(DATASHEETS).filter((d) => d.faction === faction);
  const chars = sheets.filter((d) => d.character), troops = sheets.filter((d) => !d.character);

  for (let attempt = 0; attempt < 60; attempt++) {
    const units: ArmyEntry[] = [];
    const cost = (e: ArmyEntry) => (unitPoints(DATASHEETS[e.datasheet], e.models) ?? 0) + optionPoints(DATASHEETS[e.datasheet], e.models, e.options);
    const add = (ds: Datasheet): ArmyEntry | null => {
      const size = rnd() < 0.6 ? ds.sizes[0] : pick(ds.sizes);   // más unidades, más pequeñas
      const e: ArmyEntry = { datasheet: ds.id as DatasheetId, models: size.models };
      // Equipo: cada opción con un 40 %; las que se excluyen, una sola
      const taken = new Set<string>();
      for (const o of ds.options ?? []) {
        const k = `${o.who}|${o.replace}`;
        if (rnd() < 0.4 && (o.who === "uno" || !taken.has(k))) { (e.options ??= []).push(o.id); taken.add(k); }
      }
      if (listPoints({ units }) + cost(e) > limit) { delete e.options; if (listPoints({ units }) + cost(e) > limit) return null; }
      units.push(e);
      return e;
    };
    const leader = add(pick(chars));
    if (!leader) continue;
    // Tropas hasta acercarse al límite (como mucho 3 iguales y 1 grande)
    for (let tries = 0; tries < 40 && listPoints({ units }) < limit - 40; tries++) {
      const ds = pick(troops);
      if (units.filter((u) => u.datasheet === ds.id).length >= 3) continue;
      if (ds.big && units.some((u) => DATASHEETS[u.datasheet].big)) continue;
      add(ds);
    }
    // El personaje lidera una escuadra que pueda
    const lead = DATASHEETS[leader.datasheet].leads;
    if (lead) {
      const i = units.findIndex((u, k) => k > 0 && lead.includes(u.datasheet));
      if (i > 0) leader.leads = i;
    }
    // Reservas (a veces), sin pasar de la mitad de los puntos
    for (const u of units) {
      if (!canReserve(DATASHEETS[u.datasheet]) || rnd() < 0.5) continue;
      u.reserve = true;
      if (validateList({ units }, faction, limit).length) delete u.reserve;
    }
    const list: ArmyList = { name: "Al azar", units };
    if (!validateList(list, faction, limit).length && listPoints(list) >= limit - 120) return list;
  }
  throw new Error("No se pudo hacer una lista al azar válida");
}
