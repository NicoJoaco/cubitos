/**
 * Pruebas y medición del guardado. El RLE es lo que decide si el mundo de un
 * niño ocupa kilobytes o megabytes en el teléfono.
 *
 *   node scripts/test-storage.mjs
 */
import { rleEncode, rleDecode } from '../src/core/storage.ts';
import { planSession } from '../src/core/session.ts';
import { CHUNK_VOLUME, CHUNK_X, CHUNK_Y, CHUNK_Z, idx } from '../src/world/constants.ts';
import { Chunk, generateChunk } from '../src/world/chunk.ts';
import { rand2 } from '../src/world/noise.ts';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? '[OK]  ' : '[FALLA]'} ${name}${detail ? '  ' + detail : ''}`);
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

console.log('');
console.log('PRUEBAS DE GUARDADO');

console.log('\nIDA Y VUELTA DEL RLE');
const cases = {
  'array vacío': new Uint8Array(0),
  'todo ceros': new Uint8Array(CHUNK_VOLUME),
  'un solo valor': new Uint8Array([7]),
  'alternado (peor caso)': Uint8Array.from({ length: 4096 }, (_, i) => i % 2),
  'tramo de más de 65535': new Uint8Array(200000).fill(3),
  'ruido puro': Uint8Array.from({ length: 8192 }, (_, i) => Math.floor(rand2(i, 0, 5) * 13)),
};
for (const [name, src] of Object.entries(cases)) {
  const round = rleDecode(rleEncode(src), src.length);
  check(name, same(src, round), `${src.length} B → ${rleEncode(src).length} B`);
}

console.log('\nTAMAÑO REAL DE UN CHUNK');
const chunk = new Chunk(0, 0);
generateChunk(chunk, 1337);
const virgin = rleEncode(chunk.blocks);
check('chunk de terreno se recupera intacto',
  same(chunk.blocks, rleDecode(virgin, CHUNK_VOLUME)),
  `${CHUNK_VOLUME} B → ${virgin.length} B (${(CHUNK_VOLUME / virgin.length).toFixed(1)}x)`);

// Un chunk "muy construido": 600 cubos puestos a mano por un niño.
const built = new Chunk(0, 0);
generateChunk(built, 1337);
for (let i = 0; i < 600; i++) {
  const x = Math.floor(rand2(i, 1, 11) * CHUNK_X);
  const z = Math.floor(rand2(i, 2, 12) * CHUNK_Z);
  const y = 26 + Math.floor(rand2(i, 3, 13) * 10);
  built.blocks[idx(x, y, z)] = 1 + Math.floor(rand2(i, 4, 14) * 10);
}
const builtEnc = rleEncode(built.blocks);
check('chunk muy construido se recupera intacto',
  same(built.blocks, rleDecode(builtEnc, CHUNK_VOLUME)),
  `${CHUNK_VOLUME} B → ${builtEnc.length} B (${(CHUNK_VOLUME / builtEnc.length).toFixed(1)}x)`);

console.log('\nPRESUPUESTO DE DISCO');
const perChunkKB = builtEnc.length / 1024;
const world50 = perChunkKB * 50;
console.log(`  ${'chunk sin tocar'.padEnd(38)}${(virgin.length / 1024).toFixed(2)} KB`);
console.log(`  ${'chunk con 600 cubos puestos'.padEnd(38)}${perChunkKB.toFixed(2)} KB`);
console.log(`  ${'mundo con 50 chunks construidos'.padEnd(38)}${world50.toFixed(1)} KB`);
console.log(`  ${'sin RLE, esos 50 chunks'.padEnd(38)}${(CHUNK_VOLUME * 50 / 1024).toFixed(1)} KB`);
check('50 chunks construidos por debajo de 1 MB', world50 < 1024, `${world50.toFixed(1)} KB`);
const worst = cases['alternado (peor caso)'];
check('el peor caso nunca infla: se guarda crudo',
  rleEncode(worst).length <= worst.length + 1,
  `${worst.length} B → ${rleEncode(worst).length} B`);
check('dimensiones del chunk coherentes', CHUNK_X * CHUNK_Y * CHUNK_Z === CHUNK_VOLUME);

// --------------------------------------------------------- plan de arranque
// Cambiar de semilla debe borrar el disco. Si no, los chunks del mundo viejo
// (indexados por coordenada) reaparecen sobre el terreno nuevo: trozos de la
// casa anterior flotando en mitad de la nada.
console.log('\nPLAN DE ARRANQUE (semilla de la URL vs mundo guardado)');
const guardado = { seed: 500, savedAt: 0, player: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, selected: 1 } };
const fijo = () => 999;

const casos = [
  ['sin nada guardado y sin semilla en la URL', null, undefined,
    { seed: 999, wipe: false, keepEdits: false, keepPlayer: false }],
  ['sin nada guardado, con semilla en la URL', null, 42,
    { seed: 42, wipe: false, keepEdits: false, keepPlayer: false }],
  ['mundo guardado, sin semilla en la URL', guardado, undefined,
    { seed: 500, wipe: false, keepEdits: true, keepPlayer: true }],
  ['mundo guardado, MISMA semilla en la URL', guardado, 500,
    { seed: 500, wipe: false, keepEdits: true, keepPlayer: true }],
  ['mundo guardado, OTRA semilla en la URL', guardado, 77,
    { seed: 77, wipe: true, keepEdits: false, keepPlayer: false }],
];

for (const [nombre, meta, forced, esperado] of casos) {
  const p = planSession(meta, forced, fijo);
  const ok = Object.entries(esperado).every(([k, v]) => p[k] === v);
  check(nombre, ok,
    `semilla ${p.seed}, borrar=${p.wipe}, conservar construccion=${p.keepEdits}`);
}

console.log('='.repeat(64));
console.log(failed ? `${failed} prueba(s) fallando` : 'todas las pruebas en verde');
process.exit(failed ? 1 : 0);

