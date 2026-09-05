/**
 * Texturas generadas por código: 14 tiles de 16x16 apilados en una
 * DataArrayTexture (sampler2DArray). Cero archivos de imagen en el bundle y,
 * al ser un array y no un atlas 2D, las UV del greedy mesher pueden repetir
 * sin sangrado entre tiles.
 */
import { DataArrayTexture, NearestFilter, NearestMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { Tile, TILE_COUNT } from './blocks.ts';
import { rand2 } from './noise.ts';

export const TILE_SIZE = 16;

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

/** Ruido granulado estable por pixel: da textura sin parecer estática de TV. */
function grain(x: number, y: number, seed: number, amount: number): number {
  return (rand2(x, y, seed) - 0.5) * amount;
}

function paint(
  data: Uint8Array, layer: number,
  fn: (x: number, y: number) => RGB,
  alpha: (x: number, y: number) => number = () => 255,
) {
  const base = layer * TILE_SIZE * TILE_SIZE * 4;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const c = fn(x, y);
      const i = base + (y * TILE_SIZE + x) * 4;
      data[i] = Math.max(0, Math.min(255, c[0]));
      data[i + 1] = Math.max(0, Math.min(255, c[1]));
      data[i + 2] = Math.max(0, Math.min(255, c[2]));
      data[i + 3] = alpha(x, y);
    }
  }
}

export function buildTileArray(): Uint8Array {
  const data = new Uint8Array(TILE_COUNT * TILE_SIZE * TILE_SIZE * 4);

  const speck = (c: RGB, seed: number, amt: number) => (x: number, y: number): RGB => {
    const g = grain(x, y, seed, amt);
    return [c[0] + g, c[1] + g, c[2] + g];
  };

  paint(data, Tile.GrassTop, (x, y) => {
    const g = grain(x, y, 11, 34);
    return [92 + g * 0.6, 176 + g, 74 + g * 0.6];
  });

  // El costado del pasto: tierra con un borde verde irregular arriba.
  paint(data, Tile.GrassSide, (x, y) => {
    const edge = 3 + Math.floor(rand2(x, 0, 23) * 2.6);
    if (y < edge) { const g = grain(x, y, 11, 30); return [92 + g * 0.6, 176 + g, 74 + g * 0.6]; }
    const g = grain(x, y, 12, 26);
    return [134 + g, 96 + g * 0.8, 66 + g * 0.6];
  });

  paint(data, Tile.Dirt, speck([134, 96, 66], 12, 30));
  paint(data, Tile.Stone, speck([132, 132, 136], 13, 26));
  paint(data, Tile.Sand, speck([224, 208, 156], 14, 22));

  // Tronco: anillos concéntricos arriba, vetas verticales al costado.
  paint(data, Tile.LogTop, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    const ring = Math.sin(d * 2.2) * 0.5 + 0.5;
    return mix([146, 108, 64], [110, 78, 44], ring * 0.75);
  });
  paint(data, Tile.LogSide, (x, y) => {
    const v = rand2(Math.floor(x / 2), 0, 31);
    const g = grain(x, y, 15, 16);
    return mix([124, 90, 52], [96, 68, 38], v * 0.8) .map((c) => c + g) as RGB;
  });

  // Hojas: opacas pero con huecos oscuros; se marcan transparentes en blocks.ts
  // para que no oculten las caras vecinas y el follaje se vea con volumen.
  paint(data, Tile.Leaves, (x, y) => {
    const n = rand2(x, y, 16);
    return n < 0.18 ? [40, 84, 34] : mix([70, 148, 56], [96, 178, 72], n);
  });

  // Tablas: listones horizontales con junta oscura.
  paint(data, Tile.Planks, (x, y) => {
    const seam = y % 4 === 3;
    const g = grain(x, y, 17, 14);
    return seam ? [126, 92, 52] : [172, 132, 82].map((c) => c + g) as RGB;
  });

  // Ladrillo: hiladas trabadas con mortero claro.
  paint(data, Tile.Brick, (x, y) => {
    const row = Math.floor(y / 4);
    const off = (row % 2) * 4;
    const mortar = y % 4 === 0 || (x + off) % 8 === 0;
    const g = grain(x, y, 18, 16);
    return mortar ? [196, 190, 182] : [172, 76, 58].map((c) => c + g) as RGB;
  });

  // Vidrio: marco y un brillo diagonal; el interior es casi transparente.
  paint(data, Tile.Glass,
    (x, y) => (x + y === 5 || x + y === 6 ? [255, 255, 255] : [206, 236, 246]),
    (x, y) => {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      if (border) return 235;
      if (x + y === 5 || x + y === 6) return 150;
      return 46;
    });

  paint(data, Tile.Water, (x, y) => {
    const w = Math.sin((x + y) * 0.7) * 0.5 + 0.5;
    return mix([56, 122, 200], [82, 152, 224], w);
  }, () => 170);

  paint(data, Tile.Snow, speck([242, 246, 252], 19, 12));
  paint(data, Tile.Bedrock, speck([64, 64, 70], 20, 40));

  return data;
}

export function createTileTexture(): DataArrayTexture {
  const tex = new DataArrayTexture(buildTileArray(), TILE_SIZE, TILE_SIZE, TILE_COUNT);
  // Nearest: pixel art nítido. Mipmaps: sin ellos, el suelo lejano hierve.
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 2; // 4+ no compensa el ancho de banda en gama media
  tex.needsUpdate = true;
  return tex;
}
