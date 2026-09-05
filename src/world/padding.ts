import { CHUNK_X, CHUNK_Y, CHUNK_Z, idx } from './constants.ts';
import { Block } from './blocks.ts';
import { padIdx } from './mesher.ts';
import type { Chunk } from './chunk.ts';

/**
 * Copia el chunk y el borde de 1 bloque de sus 4 vecinos a un volumen plano.
 * El mesher sólo lee ±1 en un eje a la vez, así que las diagonales nunca hacen
 * falta. Sin three: lo usa el juego y también el benchmark de CPU en Node.
 */
export function buildPad(
  pad: Uint8Array,
  c: Chunk,
  xm: Chunk | undefined, xp: Chunk | undefined,
  zm: Chunk | undefined, zp: Chunk | undefined,
): void {
  pad.fill(Block.Air);

  for (let y = 0; y < CHUNK_Y; y++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      const src = (y * CHUNK_Z + z) * CHUNK_X;
      pad.set(c.blocks.subarray(src, src + CHUNK_X), padIdx(0, y, z));
    }
  }

  for (let y = 0; y < CHUNK_Y; y++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      pad[padIdx(-1, y, z)] = xm ? xm.blocks[idx(CHUNK_X - 1, y, z)]! : Block.Air;
      pad[padIdx(CHUNK_X, y, z)] = xp ? xp.blocks[idx(0, y, z)]! : Block.Air;
    }
    for (let x = 0; x < CHUNK_X; x++) {
      pad[padIdx(x, y, -1)] = zm ? zm.blocks[idx(x, y, CHUNK_Z - 1)]! : Block.Air;
      pad[padIdx(x, y, CHUNK_Z)] = zp ? zp.blocks[idx(x, y, 0)]! : Block.Air;
    }
  }

  // Debajo del mundo, roca: la cara inferior de y=0 no se dibuja jamás.
  for (let z = 0; z < CHUNK_Z; z++) {
    for (let x = 0; x < CHUNK_X; x++) pad[padIdx(x, -1, z)] = Block.Bedrock;
  }
}
