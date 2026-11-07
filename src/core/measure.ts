// Medidas en la mesa, en pulgadas. Como en el tablero real, entre miniaturas se mide
// de borde de peana a borde de peana. Funciones puras: las usarán también las reglas.

export interface Spot {
  x: number;
  z: number;
  /** Radio de la peana si el extremo está en una miniatura; 0 si es un punto del tapete. */
  r: number;
}

export interface Measurement {
  /** Distancia medida (borde a borde), nunca negativa. */
  inches: number;
  /** Extremos de la cinta, ya sobre el borde de cada peana. */
  from: [number, number];
  to: [number, number];
}

export function measure(a: Spot, b: Spot): Measurement {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-9) return { inches: 0, from: [a.x, a.z], to: [b.x, b.z] };
  const ux = dx / d, uz = dz / d;
  const inches = Math.max(0, d - a.r - b.r);
  if (inches === 0) {
    // Peanas que se tocan o pisan: la cinta queda en el punto medio de contacto
    const m: [number, number] = [a.x + ux * (d / 2), a.z + uz * (d / 2)];
    return { inches, from: m, to: m };
  }
  return {
    inches,
    from: [a.x + ux * a.r, a.z + uz * a.r],
    to: [b.x - ux * b.r, b.z - uz * b.r],
  };
}

/** Texto en pulgadas con coma decimal: 12,3". */
export function inchesText(v: number): string {
  return `${v.toFixed(1).replace(".", ",")}"`;
}

/** Alcances que se pueden mostrar alrededor de la selección (0 = ninguno). */
export const RANGES = [0, 3, 6, 12, 18, 24] as const;
