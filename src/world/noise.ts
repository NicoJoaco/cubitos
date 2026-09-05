/**
 * Ruido determinista sin dependencias. Misma semilla => mismo mundo en el
 * teléfono, en el APK y en CI, lo que hace que el benchmark sea comparable.
 */

/** Hash entero de 2 y 3 dimensiones (xorshift sobre enteros de 32 bits). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return h >>> 0;
}
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1442695040) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return h >>> 0;
}
/** [0,1) determinista. */
export const rand2 = (x: number, y: number, seed: number) => hash2(x, y, seed) / 4294967296;
export const rand3 = (x: number, y: number, z: number, seed: number) => hash3(x, y, z, seed) / 4294967296;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Ruido de valor 2D, interpolación suave. Salida en [0,1]. */
export function valueNoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = rand2(xi, yi, seed);
  const b = rand2(xi + 1, yi, seed);
  const c = rand2(xi, yi + 1, seed);
  const d = rand2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Suma de octavas. `octaves` chico a propósito: esto corre en el hilo del juego. */
export function fbm2(x: number, y: number, seed: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + o * 7919);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
