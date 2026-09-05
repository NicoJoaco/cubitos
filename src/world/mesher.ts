/**
 * Greedy meshing. Fusiona caras coplanares del mismo bloque en un solo quad,
 * que es lo que mantiene el conteo de triángulos (y el ancho de banda) dentro
 * del presupuesto de gama media.
 *
 * Sin oclusión ambiental por vértice: meter AO en la clave de fusión rompería
 * los quads grandes y multiplicaría los triángulos. El sombreado es por cara
 * (constante según la normal), que con niebla se ve limpio y cuesta 1 byte
 * por vértice.
 */
import { CHUNK_X, CHUNK_Y, CHUNK_Z } from './constants.ts';
import { Block, BLOCK_TILES, IS_TRANSPARENT, IS_TRANSLUCENT } from './blocks.ts';

export const PAD_X = CHUNK_X + 2;
export const PAD_Y = CHUNK_Y + 2;
export const PAD_Z = CHUNK_Z + 2;
export const PAD_VOLUME = PAD_X * PAD_Y * PAD_Z;

/** Índice en el volumen con borde de 1. Acepta -1..dim. */
export const padIdx = (x: number, y: number, z: number) =>
  ((y + 1) * PAD_Z + (z + 1)) * PAD_X + (x + 1);

// Pasos de cada eje dentro del volumen con borde, y el origen (0,0,0).
const STRIDE = [1, PAD_Z * PAD_X, PAD_X];
const ORIGIN = PAD_Z * PAD_X + PAD_X + 1;

// Sombreado por normal: arriba pleno, abajo el más oscuro. 0..255.
const FACE_SHADE = new Uint8Array([199, 199, 255, 140, 224, 224]);

const MAX_VERTS = 65536; // los índices son Uint16
const MAX_INDICES = (MAX_VERTS / 4) * 6;

const sPos = new Float32Array(MAX_VERTS * 3);
const sUv = new Float32Array(MAX_VERTS * 2);
const sLayer = new Uint8Array(MAX_VERTS);
const sShade = new Uint8Array(MAX_VERTS);
const sIdx = new Uint16Array(MAX_INDICES);

const DIMS = [CHUNK_X, CHUNK_Y, CHUNK_Z];
const mask = new Int16Array(Math.max(CHUNK_X * CHUNK_Y, CHUNK_Y * CHUNK_Z, CHUNK_X * CHUNK_Z));

// Reutilizados en cada quad para no crear basura en el bucle caliente.
const c0 = [0, 0, 0];
const eu = [0, 0, 0];
const ev = [0, 0, 0];

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  layers: Uint8Array;
  shades: Uint8Array;
  indices: Uint16Array;
  vertCount: number;
  indexCount: number;
}

/** ¿Se dibuja la cara del bloque `a` que mira hacia el bloque `b`? */
function faceVisible(a: number, b: number): boolean {
  if (a === Block.Air) return false;
  if (b === Block.Air) return true;
  // Las caras internas entre dos bloques iguales y transparentes
  // (agua-agua, hojas-hojas, vidrio-vidrio) no se dibujan: es overdraw puro.
  return IS_TRANSPARENT[b] === 1 && b !== a;
}

/**
 * @param pad volumen con borde de 1 bloque tomado de los chunks vecinos
 * @param translucent true = pasada de agua/vidrio; false = pasada opaca
 */
export function meshChunk(pad: Uint8Array, translucent: boolean): MeshData {
  let vc = 0, ic = 0;

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const du = DIMS[u]!, dv = DIMS[v]!, dd = DIMS[d]!;
    const sd = STRIDE[d]!, su = STRIDE[u]!, sv = STRIDE[v]!;

    for (let a = -1; a < dd; a++) {
      // --- 1. máscara del plano: +bloque = cara hacia +d, -bloque = hacia -d
      let n = 0;
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du; i++, n++) {
          const at = ORIGIN + a * sd + i * su + j * sv;
          const A = pad[at]!;
          const B = pad[at + sd]!;
          const aOk = A !== Block.Air && (IS_TRANSLUCENT[A] === 1) === translucent;
          const bOk = B !== Block.Air && (IS_TRANSLUCENT[B] === 1) === translucent;
          mask[n] = aOk && faceVisible(A, B) ? A : bOk && faceVisible(B, A) ? -B : 0;
        }
      }

      const plane = a + 1;

      // --- 2. fusión: se estira el quad en u y luego en v
      n = 0;
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du;) {
          const c = mask[n]!;
          if (c === 0) { i++; n++; continue; }

          let w = 1;
          while (i + w < du && mask[n + w] === c) w++;
          let h = 1;
          grow: for (; j + h < dv; h++) {
            for (let k = 0; k < w; k++) if (mask[n + k + h * du] !== c) break grow;
          }

          const positive = c > 0;
          const block = positive ? c : -c;
          const face = d * 2 + (positive ? 0 : 1);
          const layer = BLOCK_TILES[block * 6 + face]!;
          const shade = FACE_SHADE[face]!;

          if (vc + 4 <= MAX_VERTS && ic + 6 <= MAX_INDICES) {
            c0[d] = plane; c0[u] = i; c0[v] = j;
            eu[d] = 0; eu[u] = w; eu[v] = 0;
            ev[d] = 0; ev[u] = 0; ev[v] = h;

            const p = vc * 3;
            sPos[p] = c0[0]!; sPos[p + 1] = c0[1]!; sPos[p + 2] = c0[2]!;
            sPos[p + 3] = c0[0]! + eu[0]!; sPos[p + 4] = c0[1]! + eu[1]!; sPos[p + 5] = c0[2]! + eu[2]!;
            sPos[p + 6] = c0[0]! + eu[0]! + ev[0]!; sPos[p + 7] = c0[1]! + eu[1]! + ev[1]!; sPos[p + 8] = c0[2]! + eu[2]! + ev[2]!;
            sPos[p + 9] = c0[0]! + ev[0]!; sPos[p + 10] = c0[1]! + ev[1]!; sPos[p + 11] = c0[2]! + ev[2]!;

            const t = vc * 2;
            sUv[t] = 0; sUv[t + 1] = 0;
            sUv[t + 2] = w; sUv[t + 3] = 0;
            sUv[t + 4] = w; sUv[t + 5] = h;
            sUv[t + 6] = 0; sUv[t + 7] = h;

            for (let k = 0; k < 4; k++) { sLayer[vc + k] = layer; sShade[vc + k] = shade; }

            // Winding invertido en las caras negativas para que la normal
            // geométrica apunte hacia afuera (el material hace face culling).
            if (positive) {
              sIdx[ic] = vc; sIdx[ic + 1] = vc + 1; sIdx[ic + 2] = vc + 2;
              sIdx[ic + 3] = vc; sIdx[ic + 4] = vc + 2; sIdx[ic + 5] = vc + 3;
            } else {
              sIdx[ic] = vc; sIdx[ic + 1] = vc + 2; sIdx[ic + 2] = vc + 1;
              sIdx[ic + 3] = vc; sIdx[ic + 4] = vc + 3; sIdx[ic + 5] = vc + 2;
            }
            vc += 4; ic += 6;
          }

          for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * du] = 0;
          i += w; n += w;
        }
      }
    }
  }

  return {
    positions: sPos.subarray(0, vc * 3),
    uvs: sUv.subarray(0, vc * 2),
    layers: sLayer.subarray(0, vc),
    shades: sShade.subarray(0, vc),
    indices: sIdx.subarray(0, ic),
    vertCount: vc,
    indexCount: ic,
  };
}
