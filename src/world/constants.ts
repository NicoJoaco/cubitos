/** Dimensiones del mundo. Todo lo demás se deriva de aquí. */

export const CHUNK_X = 16;
export const CHUNK_Y = 64; // altura total del mundo
export const CHUNK_Z = 16;
export const CHUNK_VOLUME = CHUNK_X * CHUNK_Y * CHUNK_Z; // 16 KB por chunk

export const SEA_LEVEL = 20;
export const GROUND_BASE = 22;

/** Distancia de render por defecto: gama media, no gama alta. */
export const RENDER_DISTANCE_DEFAULT = 4;
export const RENDER_DISTANCE_MIN = 2;
export const RENDER_DISTANCE_MAX = 6;

/** Índice lineal dentro del chunk. Orden Y-mayor: las columnas quedan
 *  contiguas, que es como las recorre el generador de terreno. */
export const idx = (x: number, y: number, z: number) =>
  (y * CHUNK_Z + z) * CHUNK_X + x;

export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
