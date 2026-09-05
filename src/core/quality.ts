/**
 * Escalador dinámico de calidad.
 *
 * Regla de la especificación: si la media móvil de frametime sobre 60 frames
 * pasa de 20 ms, se baja calidad; si baja de 12 ms sostenido 5 s, se sube.
 *
 * El orden importa y es deliberado: primero se toca la resolución de render
 * (barata de cambiar, invisible en un juego de cubos, y ataca el cuello de
 * botella real de la gama media, que es el ancho de banda de fragmentos) y
 * sólo después la distancia de render, que cambia lo que el niño VE.
 *
 * Escalones, de peor a mejor:
 *   0: escala 0.65, distancia 2      3: escala 0.75, distancia 4
 *   1: escala 0.75, distancia 2      4: escala 1.00, distancia 4  <- por defecto
 *   2: escala 1.00, distancia 3      5: escala 1.00, distancia 5
 *                                    6: escala 1.00, distancia 6
 */
import { RENDER_DISTANCE_MAX, RENDER_DISTANCE_MIN } from '../world/constants.ts';

export interface Level { scale: number; distance: number }

export const LEVELS: Level[] = [
  { scale: 0.65, distance: 2 },
  { scale: 0.75, distance: 2 },
  { scale: 1.00, distance: 3 },
  { scale: 0.75, distance: 4 },
  { scale: 1.00, distance: 4 },
  { scale: 1.00, distance: 5 },
  { scale: 1.00, distance: 6 },
];
export const DEFAULT_LEVEL = 4;

export const DOWN_MS = 20;   // media de 60 frames por encima => bajar
export const UP_MS = 12;     // por debajo, sostenido, => subir
export const UP_HOLD_MS = 5000;
/** Tras cambiar, se ignoran las medidas un momento: reconstruir chunks produce
 *  un pico de frametime que, sin esto, dispararía otra bajada en cadena. */
export const COOLDOWN_MS = 1500;

export interface QualityScaler {
  readonly level: number;
  readonly current: Level;
  /** @param avg60 media móvil de frametime en ms
   *  @param now  reloj en ms
   *  @returns true si el nivel cambió */
  sample(avg60: number, now: number): boolean;
  reset(level?: number): void;
}

export function createQualityScaler(
  apply: (level: Level) => void,
  startLevel = DEFAULT_LEVEL,
): QualityScaler {
  let level = startLevel;
  let goodSince = -1;
  let changedAt = -Infinity;

  const clampLevel = (n: number) => {
    let l = Math.max(0, Math.min(LEVELS.length - 1, n));
    // Respeta los topes duros de distancia aunque se toquen los escalones.
    while (l > 0 && LEVELS[l]!.distance > RENDER_DISTANCE_MAX) l--;
    while (l < LEVELS.length - 1 && LEVELS[l]!.distance < RENDER_DISTANCE_MIN) l++;
    return l;
  };

  const set = (n: number, now: number) => {
    const next = clampLevel(n);
    if (next === level) return false;
    level = next;
    changedAt = now;
    goodSince = -1;
    apply(LEVELS[level]!);
    return true;
  };

  return {
    get level() { return level; },
    get current() { return LEVELS[level]!; },

    sample(avg60: number, now: number): boolean {
      if (now - changedAt < COOLDOWN_MS) return false;
      if (avg60 <= 0) return false;

      if (avg60 > DOWN_MS) {
        goodSince = -1;
        return set(level - 1, now);
      }
      if (avg60 < UP_MS) {
        if (goodSince < 0) goodSince = now;
        if (now - goodSince >= UP_HOLD_MS) return set(level + 1, now);
        return false;
      }
      // Zona muerta entre 12 y 20 ms: no se toca nada. Sin ella, un juego a
      // 60 fps justos oscilaría entre dos escalones para siempre.
      goodSince = -1;
      return false;
    },

    reset(l = startLevel) {
      level = clampLevel(l);
      goodSince = -1;
      changedAt = -Infinity;
      apply(LEVELS[level]!);
    },
  };
}
