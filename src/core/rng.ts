// Generador aleatorio con semilla (mulberry32). Su estado vive dentro de GameState,
// así que dos navegadores que apliquen las mismas órdenes sacan los mismos dados.

/** Devuelve [valor en 0–1, siguiente estado]. Función pura: no toca nada global. */
export function nextRandom(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(s ^ (s >>> 15), s | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, s];
}

/** Tira `count` dados de `sides` caras. Devuelve los resultados y el nuevo estado. */
export function rollDice(state: number, count: number, sides: number): [number[], number] {
  const out: number[] = [];
  let s = state;
  for (let i = 0; i < count; i++) {
    const [v, n] = nextRandom(s);
    out.push(Math.floor(v * sides) + 1);
    s = n;
  }
  return [out, s];
}

/** Semilla nueva para una mesa nueva (esto sí usa el azar del navegador). */
export function freshSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
