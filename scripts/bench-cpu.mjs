/**
 * Benchmark de CPU del motor de mundo, sin navegador.
 *
 * Mide lo único que un PC de escritorio puede decirte con honestidad sobre un
 * teléfono de gama media: el coste algorítmico. Generación y greedy meshing son
 * JavaScript puro sobre TypedArrays; el móvil será ~3-6x más lento, pero la
 * proporción entre pasos y el número de triángulos son idénticos.
 *
 * El frametime real de GPU sólo se mide en el teléfono con ?bench=1.
 *
 *   node scripts/bench-cpu.mjs [--radius 4] [--seed 1337] [--json]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHUNK_X, CHUNK_Y, CHUNK_Z, chunkKey } from '../src/world/constants.ts';
import { Chunk, generateChunk } from '../src/world/chunk.ts';
import { meshChunk, PAD_VOLUME } from '../src/world/mesher.ts';
import { buildPad } from '../src/world/padding.ts';
import { Block, IS_TRANSPARENT } from '../src/world/blocks.ts';
import { padIdx } from '../src/world/mesher.ts';

/** Caras visibles sin fusionar: el denominador del ratio de greedy meshing. */
function countVisibleFaces(pad) {
  const N = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  let faces = 0;
  for (let y = 0; y < CHUNK_Y; y++)
    for (let z = 0; z < CHUNK_Z; z++)
      for (let x = 0; x < CHUNK_X; x++) {
        const a = pad[padIdx(x, y, z)];
        if (a === Block.Air) continue;
        for (const [dx, dy, dz] of N) {
          const b = pad[padIdx(x + dx, y + dy, z + dz)];
          if (b === Block.Air || (IS_TRANSPARENT[b] === 1 && b !== a)) faces++;
        }
      }
  return faces;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? Number(argv[i + 1]) : def;
};
const R = arg('radius', 4);
const SEED = arg('seed', 1337);
const asJson = argv.includes('--json');

const ms = () => Number(process.hrtime.bigint()) / 1e6;
const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return {
    avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3),
    p50: +s[Math.floor(s.length * 0.5)].toFixed(3),
    p95: +s[Math.floor(s.length * 0.95)].toFixed(3),
    max: +s[s.length - 1].toFixed(3),
  };
};

// --- generación: el anillo completo que carga el juego al arrancar (R+1)
const genR = R + 1;
const coords = [];
for (let dz = -genR; dz <= genR; dz++) {
  for (let dx = -genR; dx <= genR; dx++) if (dx * dx + dz * dz <= genR * genR) coords.push([dx, dz]);
}

const chunks = new Map();
const genTimes = [];
for (const [cx, cz] of coords) {
  const c = new Chunk(cx, cz);
  const t = ms();
  generateChunk(c, SEED);
  genTimes.push(ms() - t);
  chunks.set(chunkKey(cx, cz), c);
}

// --- mallado: sólo el radio visible, que es lo que se sube a la GPU
const pad = new Uint8Array(PAD_VOLUME);

// Calentamiento: sin esto el p95 mide el JIT de V8, no el algoritmo.
for (let i = 0; i < 12; i++) {
  const c = chunks.get(chunkKey(0, 0));
  buildPad(pad, c, chunks.get(chunkKey(-1, 0)), chunks.get(chunkKey(1, 0)), chunks.get(chunkKey(0, -1)), chunks.get(chunkKey(0, 1)));
  meshChunk(pad, false); meshChunk(pad, true);
}

const meshTimes = [];
let naiveFaces = 0;
let quads = 0, verts = 0, tris = 0, geomBytes = 0, meshCount = 0;
let meshed = 0;

for (const [cx, cz] of coords) {
  if (cx * cx + cz * cz > R * R) continue;
  const c = chunks.get(chunkKey(cx, cz));
  const t = ms();
  buildPad(pad, c,
    chunks.get(chunkKey(cx - 1, cz)), chunks.get(chunkKey(cx + 1, cz)),
    chunks.get(chunkKey(cx, cz - 1)), chunks.get(chunkKey(cx, cz + 1)));
  for (const translucent of [false, true]) {
    const d = meshChunk(pad, translucent);
    if (d.indexCount === 0) continue;
    meshCount++;
    verts += d.vertCount;
    quads += d.vertCount / 4;
    tris += d.indexCount / 3;
    // 12 B posición + 8 B uv + 1 B capa + 1 B sombra por vértice, 2 B por índice
    geomBytes += d.vertCount * 22 + d.indexCount * 2;
  }
  meshTimes.push(ms() - t);
  naiveFaces += countVisibleFaces(pad);
  meshed++;
}

// --- una sola edición de bloque: lo que cuesta poner o romper un cubo
const editChunk = chunks.get(chunkKey(0, 0));
const editTimes = [];
for (let i = 0; i < 200; i++) {
  editChunk.set(8, 30 + (i % 8), 8, i % 2 ? 3 : 0);
  const t = ms();
  buildPad(pad, editChunk,
    chunks.get(chunkKey(-1, 0)), chunks.get(chunkKey(1, 0)),
    chunks.get(chunkKey(0, -1)), chunks.get(chunkKey(0, 1)));
  meshChunk(pad, false);
  meshChunk(pad, true);
  editTimes.push(ms() - t);
}

const voxelBytes = chunks.size * CHUNK_X * CHUNK_Y * CHUNK_Z;

const report = {
  seed: SEED,
  renderDistance: R,
  chunksGenerated: chunks.size,
  chunksMeshed: meshed,
  meshes: meshCount,
  generateMsPerChunk: stat(genTimes),
  meshMsPerChunk: stat(meshTimes),
  editRemeshMs: stat(editTimes),
  totalLoadMs: +(genTimes.reduce((a, b) => a + b, 0) + meshTimes.reduce((a, b) => a + b, 0)).toFixed(1),
  triangles: tris,
  vertices: verts,
  quadsAfterGreedy: quads,
  quadsWithoutGreedy: naiveFaces,
  greedyReduction: +(1 - quads / naiveFaces).toFixed(3),
  trianglesPerChunk: Math.round(tris / meshed),
  voxelMB: +(voxelBytes / 1048576).toFixed(2),
  geometryMB: +(geomBytes / 1048576).toFixed(2),
  node: process.version,
};

if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const W = 34;
const line = (k, v) => console.log('  ' + k.padEnd(W) + String(v).padStart(24));
console.log('');
console.log('BENCHMARK DE CPU DEL MOTOR DE MUNDO');
console.log('='.repeat(60));
line('semilla', SEED);
line('distancia de render', R + ' chunks (' + R * CHUNK_X + ' bloques)');
line('chunks generados', chunks.size);
line('chunks mallados', meshed);
line('mallas (opaca + agua)', meshCount);
console.log('');
const t = (name, s) => line(name, `avg ${s.avg}  p95 ${s.p95}  max ${s.max} ms`);
t('generar 1 chunk', report.generateMsPerChunk);
t('mallar 1 chunk', report.meshMsPerChunk);
t('re-mallar tras editar 1 bloque', report.editRemeshMs);
line('carga completa del mundo', report.totalLoadMs + ' ms');
console.log('');
line('triángulos totales', tris.toLocaleString('es'));
line('triángulos por chunk', report.trianglesPerChunk);
line('quads tras greedy meshing', quads.toLocaleString('es'));
line('quads sin greedy meshing', naiveFaces.toLocaleString('es'));
line('reducción por greedy meshing', (report.greedyReduction * 100).toFixed(1) + ' %');
line('voxels en RAM', report.voxelMB + ' MB');
line('geometría en GPU', report.geometryMB + ' MB');
console.log('='.repeat(60));

mkdirSync(join(ROOT, 'metrics'), { recursive: true });
writeFileSync(join(ROOT, 'metrics', 'cpu.json'), JSON.stringify(report, null, 2));
