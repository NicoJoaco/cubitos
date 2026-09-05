/**
 * DDA sobre la rejilla de voxels (Amanatides & Woo). Avanza bloque a bloque en
 * vez de muestrear a pasos fijos: no se salta cubos finos ni esquinas, que es
 * exactamente el fallo que haría que un niño toque "romper" y no pase nada.
 */
import { IS_SOLID } from '../world/blocks.ts';

export interface RayHit {
  x: number; y: number; z: number;
  /** Cara golpeada, como desplazamiento al bloque vecino vacío. */
  nx: number; ny: number; nz: number;
  distance: number;
}

export function raycastVoxels(
  getBlock: (x: number, y: number, z: number) => number,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDistance = 6,
): RayHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  const bound = (o: number, i: number, step: number) =>
    step > 0 ? i + 1 - o : step < 0 ? o - i : Infinity;

  let tMaxX = dx !== 0 ? bound(ox, x, stepX) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? bound(oy, y, stepY) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? bound(oz, z, stepZ) * tDeltaZ : Infinity;

  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  // El bloque de origen cuenta: si la cámara está dentro de un cubo, romperlo
  // debe funcionar igual.
  if (IS_SOLID[getBlock(x, y, z)] === 1) return { x, y, z, nx: 0, ny: 1, nz: 0, distance: 0 };

  while (t <= maxDistance) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDistance) break;
    if (IS_SOLID[getBlock(x, y, z)] === 1) return { x, y, z, nx, ny, nz, distance: t };
  }
  return null;
}
