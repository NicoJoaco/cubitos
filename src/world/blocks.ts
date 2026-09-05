/**
 * Catálogo de bloques. Cada bloque apunta a capas de una DataArrayTexture
 * (una capa = una textura de 16x16 generada por código, ver atlas.ts).
 * No hay archivos de imagen: cero bytes de textura en el bundle.
 */

// Objetos const en vez de `enum`: sintaxis borrable, así el mismo código
// corre bajo `node --experimental-strip-types` en el benchmark de CPU y en CI.
export const Tile = {
  GrassTop: 0, GrassSide: 1, Dirt: 2, Stone: 3, Sand: 4, LogTop: 5, LogSide: 6,
  Leaves: 7, Planks: 8, Brick: 9, Glass: 10, Water: 11, Snow: 12, Bedrock: 13,
} as const;
export const TILE_COUNT = 14;

export const Block = {
  Air: 0, Grass: 1, Dirt: 2, Stone: 3, Sand: 4, Log: 5, Leaves: 6,
  Planks: 7, Brick: 8, Glass: 9, Snow: 10, Water: 11, Bedrock: 12,
} as const;
export type BlockId = (typeof Block)[keyof typeof Block];
export const BLOCK_COUNT = 13;

export interface BlockDef {
  name: string;
  /** Capas por cara: [+X, -X, +Y(arriba), -Y(abajo), +Z, -Z] */
  tiles: [number, number, number, number, number, number];
  /** Bloquea la cámara y al jugador. */
  solid: boolean;
  /** Deja ver a través: sus caras vecinas NO se ocultan. */
  transparent: boolean;
  /** Se dibuja en la pasada translúcida (agua, vidrio). */
  translucent: boolean;
}

const all = (t: number): [number, number, number, number, number, number] => [t, t, t, t, t, t];
const sided = (side: number, top: number, bottom: number): [number, number, number, number, number, number] =>
  [side, side, top, bottom, side, side];

export const BLOCKS: BlockDef[] = [
  { name: 'aire',    tiles: all(0),                                          solid: false, transparent: true,  translucent: false },
  { name: 'pasto',   tiles: sided(Tile.GrassSide, Tile.GrassTop, Tile.Dirt), solid: true,  transparent: false, translucent: false },
  { name: 'tierra',  tiles: all(Tile.Dirt),                                  solid: true,  transparent: false, translucent: false },
  { name: 'piedra',  tiles: all(Tile.Stone),                                 solid: true,  transparent: false, translucent: false },
  { name: 'arena',   tiles: all(Tile.Sand),                                  solid: true,  transparent: false, translucent: false },
  { name: 'tronco',  tiles: sided(Tile.LogSide, Tile.LogTop, Tile.LogTop),   solid: true,  transparent: false, translucent: false },
  { name: 'hojas',   tiles: all(Tile.Leaves),                                solid: true,  transparent: true,  translucent: false },
  { name: 'tablas',  tiles: all(Tile.Planks),                                solid: true,  transparent: false, translucent: false },
  { name: 'ladrillo',tiles: all(Tile.Brick),                                 solid: true,  transparent: false, translucent: false },
  { name: 'vidrio',  tiles: all(Tile.Glass),                                 solid: true,  transparent: true,  translucent: true  },
  { name: 'nieve',   tiles: all(Tile.Snow),                                  solid: true,  transparent: false, translucent: false },
  { name: 'agua',    tiles: all(Tile.Water),                                 solid: false, transparent: true,  translucent: true  },
  { name: 'roca madre', tiles: all(Tile.Bedrock),                            solid: true,  transparent: false, translucent: false },
];

// Tablas planas: el mesher las consulta millones de veces por chunk y un
// acceso a Uint8Array es bastante más barato que un salto por objeto.
export const IS_SOLID = new Uint8Array(BLOCK_COUNT);
export const IS_TRANSPARENT = new Uint8Array(BLOCK_COUNT);
export const IS_TRANSLUCENT = new Uint8Array(BLOCK_COUNT);
/** tile[block * 6 + face] */
export const BLOCK_TILES = new Uint8Array(BLOCK_COUNT * 6);

for (let b = 0; b < BLOCKS.length; b++) {
  const d = BLOCKS[b]!;
  IS_SOLID[b] = d.solid ? 1 : 0;
  IS_TRANSPARENT[b] = d.transparent ? 1 : 0;
  IS_TRANSLUCENT[b] = d.translucent ? 1 : 0;
  for (let f = 0; f < 6; f++) BLOCK_TILES[b * 6 + f] = d.tiles[f]!;
}

/** Los 10 cubos de la paleta, en el orden en que los ve el niño. */
export const PALETTE: number[] = [
  Block.Grass, Block.Dirt, Block.Stone, Block.Sand, Block.Log,
  Block.Leaves, Block.Planks, Block.Brick, Block.Glass, Block.Snow,
];
