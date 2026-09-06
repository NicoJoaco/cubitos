import { CHUNK_X, CHUNK_Y, CHUNK_Z, CHUNK_VOLUME, SEA_LEVEL, GROUND_BASE, idx } from './constants.ts';
import { Block } from './blocks.ts';
import { fbm2, rand2 } from './noise.ts';

/** 16 KB de voxels + metadatos. El mundo entero son estos, nada más. */
export class Chunk {
  readonly blocks = new Uint8Array(CHUNK_VOLUME);
  /** Necesita re-mallado. */
  dirty = true;
  /** El jugador lo modificó: hay que guardarlo. */
  modified = false;
  /** Sin un solo bloque sólido: se salta el mallado por completo. */
  empty = true;

  readonly cx: number;
  readonly cz: number;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }

  get(x: number, y: number, z: number): number {
    if (x < 0 || x >= CHUNK_X || y < 0 || y >= CHUNK_Y || z < 0 || z >= CHUNK_Z) return Block.Air;
    return this.blocks[idx(x, y, z)]!;
  }
  set(x: number, y: number, z: number, b: number): boolean {
    if (x < 0 || x >= CHUNK_X || y < 0 || y >= CHUNK_Y || z < 0 || z >= CHUNK_Z) return false;
    const i = idx(x, y, z);
    if (this.blocks[i] === b) return false;
    this.blocks[i] = b;
    this.dirty = true;
    this.modified = true;
    if (b !== Block.Air) this.empty = false;
    return true;
  }
}

// ---------------------------------------------------------------- terreno
/**
 * Altura del terreno en una columna del mundo. Es una función pura de
 * (wx, wz, seed): el generador puede consultarla para columnas de chunks
 * vecinos, que es lo que permite que los árboles crucen bordes de chunk sin
 * dejar el patrón de rejilla delator.
 */
export function surfaceHeight(wx: number, wz: number, seed: number): number {
  const cont = fbm2(wx * 0.006, wz * 0.006, seed, 3);          // continentes suaves
  const hills = fbm2(wx * 0.035, wz * 0.035, seed + 1000, 3);  // lomas
  const detail = fbm2(wx * 0.12, wz * 0.12, seed + 2000, 2);   // rugosidad
  const h = GROUND_BASE + (cont - 0.5) * 26 + (hills - 0.5) * 9 + (detail - 0.5) * 2.5;
  return Math.max(1, Math.min(CHUNK_Y - 12, Math.round(h)));
}

/** 0 = pradera, 1 = desierto, 2 = nieve. */
export function biomeAt(wx: number, wz: number, seed: number): number {
  const t = fbm2(wx * 0.004, wz * 0.004, seed + 5000, 2);
  if (t > 0.62) return 1;
  if (t < 0.34) return 2;
  return 0;
}

/** ¿Nace un árbol en esta columna? Determinista y sin estado. */
function hasTree(wx: number, wz: number, seed: number): boolean {
  return rand2(wx, wz, seed + 9000) > 0.988;
}

const LEAF_R = 2;

/** ¿Esta columna queda tapada por la copa de algun arbol vecino? */
function underCanopy(wx: number, wz: number, seed: number): boolean {
  for (let dz = -LEAF_R; dz <= LEAF_R; dz++) {
    for (let dx = -LEAF_R; dx <= LEAF_R; dx++) {
      if (hasTree(wx + dx, wz + dz, seed)) return true;
    }
  }
  return false;
}

export function generateChunk(chunk: Chunk, seed: number): void {
  const { blocks, cx, cz } = chunk;
  blocks.fill(Block.Air);
  const ox = cx * CHUNK_X, oz = cz * CHUNK_Z;
  let solid = false;

  for (let z = 0; z < CHUNK_Z; z++) {
    for (let x = 0; x < CHUNK_X; x++) {
      const wx = ox + x, wz = oz + z;
      const h = surfaceHeight(wx, wz, seed);
      const biome = biomeAt(wx, wz, seed);
      const top = biome === 1 ? Block.Sand : biome === 2 ? Block.Snow : Block.Grass;
      const sub = biome === 1 ? Block.Sand : Block.Dirt;

      blocks[idx(x, 0, z)] = Block.Bedrock;
      for (let y = 1; y <= h; y++) {
        const b = y === h ? (h < SEA_LEVEL ? Block.Sand : top)
          : y >= h - 3 ? sub
          : Block.Stone;
        blocks[idx(x, y, z)] = b;
      }
      for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[idx(x, y, z)] = Block.Water;
      solid = true;
    }
  }

  // Árboles: se recorren también las columnas vecinas para que la copa pueda
  // invadir este chunk desde fuera. Sólo se escribe lo que cae adentro.
  for (let z = -LEAF_R; z < CHUNK_Z + LEAF_R; z++) {
    for (let x = -LEAF_R; x < CHUNK_X + LEAF_R; x++) {
      const wx = ox + x, wz = oz + z;
      if (!hasTree(wx, wz, seed)) continue;
      const h = surfaceHeight(wx, wz, seed);
      if (h <= SEA_LEVEL || biomeAt(wx, wz, seed) !== 0) continue;
      const trunk = 4 + Math.floor(rand2(wx, wz, seed + 11) * 3);
      const topY = h + trunk;
      if (topY + 2 >= CHUNK_Y) continue;

      for (let ly = -1; ly <= 2; ly++) {
        const r = ly >= 1 ? 1 : LEAF_R;
        for (let lz = -r; lz <= r; lz++) {
          for (let lx = -r; lx <= r; lx++) {
            if (Math.abs(lx) === r && Math.abs(lz) === r && ly >= 1) continue;
            const px = x + lx, pz = z + lz, py = topY + ly;
            if (px < 0 || px >= CHUNK_X || pz < 0 || pz >= CHUNK_Z || py < 0 || py >= CHUNK_Y) continue;
            const i = idx(px, py, pz);
            if (blocks[i] === Block.Air) blocks[i] = Block.Leaves;
          }
        }
      }
      for (let y = h + 1; y <= topY; y++) {
        if (x < 0 || x >= CHUNK_X || z < 0 || z >= CHUNK_Z || y >= CHUNK_Y) continue;
        blocks[idx(x, y, z)] = Block.Log;
      }
    }
  }

  chunk.empty = !solid;
  chunk.dirty = true;
  chunk.modified = false;
}

/**
 * Busca un sitio decente para aparecer: tierra firme, con holgura sobre el mar
 * y fuera del desierto.
 *
 * Sin esto, una semilla al azar puede dejar al jugador en mitad del oceano,
 * hundiendose en agua azul sin nada que construir a la vista. Para un nino de
 * 4 anos eso no es "explorar", es que el juego esta roto.
 *
 * Sale barato porque surfaceHeight y biomeAt son funciones puras de la semilla:
 * se consultan sin generar ni un chunk.
 */
export function findSpawn(seed: number): { x: number; z: number } {
  const MARGIN = 3;          // bloques de holgura sobre el nivel del mar
  const STEP = 6;            // muestreo grueso: no hace falta mirar columna a columna
  const MAX_RINGS = 90;      // ~540 bloques de busqueda

  let fallback: { x: number; z: number } | null = null;

  for (let ring = 0; ring < MAX_RINGS; ring++) {
    const r = ring * STEP;
    // Perimetro del anillo; el anillo 0 es un solo punto.
    for (let i = 0; i < Math.max(1, ring * 8); i++) {
      const t = (i / Math.max(1, ring * 8)) * Math.PI * 2;
      const x = Math.round(Math.cos(t) * r);
      const z = Math.round(Math.sin(t) * r);
      const h = surfaceHeight(x, z, seed);
      if (h < SEA_LEVEL + MARGIN) continue;
      // Bajo una copa no: aparecer dentro de las hojas de un arbol deja la
      // pantalla verde entera y sin ninguna referencia de donde estas.
      if (underCanopy(x, z, seed)) continue;

      // La pradera es el mejor sitio para empezar: hay arboles, y madera y
      // hojas son de lo primero que un nino quiere romper.
      if (biomeAt(x, z, seed) === 0) return { x, z };
      if (!fallback) fallback = { x, z };
    }
  }

  return fallback ?? { x: 8, z: 8 };
}
