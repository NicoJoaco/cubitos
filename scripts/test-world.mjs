/**
 * Pruebas del generador de mundo. La que importa de verdad es la del punto de
 * aparicion: la primera version publicada dejaba al jugador en mitad del
 * oceano segun que semilla tocara, que para un nino de 4 anos es un juego
 * roto, no una aventura.
 *
 *   node scripts/test-world.mjs
 */
import { findSpawn, surfaceHeight, biomeAt, generateChunk, Chunk } from '../src/world/chunk.ts';
import { SEA_LEVEL, CHUNK_Y, CHUNK_X, CHUNK_Z, idx } from '../src/world/constants.ts';
import { Block } from '../src/world/blocks.ts';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? '[OK]  ' : '[FALLA]'} ${name}${detail ? '  ' + detail : ''}`);
};

console.log('');
console.log('PRUEBAS DEL GENERADOR DE MUNDO');
console.log('='.repeat(64));

// -------------------------------------------------------- punto de aparicion
const SEEDS = 500;
let dry = 0, meadow = 0, underwater = 0;
const distances = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const p = findSpawn(seed);
  const h = surfaceHeight(p.x, p.z, seed);
  if (h >= SEA_LEVEL + 3) dry++; else if (h <= SEA_LEVEL) underwater++;
  if (biomeAt(p.x, p.z, seed) === 0) meadow++;
  distances.push(Math.hypot(p.x, p.z));
}
distances.sort((a, b) => a - b);

console.log(`\nPUNTO DE APARICION (${SEEDS} semillas)`);
check('ninguna semilla aparece bajo el agua', underwater === 0, `${underwater} de ${SEEDS}`);
check('todas con holgura sobre el mar', dry === SEEDS, `${dry}/${SEEDS}`);
check('todas en pradera (hay arboles para romper)', meadow === SEEDS, `${meadow}/${SEEDS}`);
check('el punto queda cerca del origen', distances[Math.floor(SEEDS * 0.95)] < 400,
  `mediana ${distances[Math.floor(SEEDS / 2)].toFixed(0)}, p95 ${distances[Math.floor(SEEDS * 0.95)].toFixed(0)} bloques`);

console.log('\nDETERMINISMO');
const a = findSpawn(4242), b = findSpawn(4242);
check('la misma semilla da siempre el mismo punto', a.x === b.x && a.z === b.z, `(${a.x}, ${a.z})`);
const c1 = new Chunk(3, -2), c2 = new Chunk(3, -2);
generateChunk(c1, 4242);
generateChunk(c2, 4242);
check('la misma semilla genera el mismo chunk', c1.blocks.every((v, i) => v === c2.blocks[i]));
const c3 = new Chunk(3, -2);
generateChunk(c3, 4243);
check('semillas distintas generan chunks distintos', !c3.blocks.every((v, i) => v === c1.blocks[i]));

console.log('\nCOHERENCIA DEL TERRENO');
const chunk = new Chunk(0, 0);
generateChunk(chunk, 1337);
let bedrockOk = true, floating = 0, waterAboveSea = 0;
for (let z = 0; z < CHUNK_Z; z++) {
  for (let x = 0; x < CHUNK_X; x++) {
    if (chunk.blocks[idx(x, 0, z)] !== Block.Bedrock) bedrockOk = false;
    for (let y = 1; y < CHUNK_Y; y++) {
      const b = chunk.blocks[idx(x, y, z)];
      if (b === Block.Water && y > SEA_LEVEL) waterAboveSea++;
      // Tierra o piedra sin nada debajo: agujero en el terreno.
      if ((b === Block.Dirt || b === Block.Stone) && chunk.blocks[idx(x, y - 1, z)] === Block.Air) floating++;
    }
  }
}
check('roca madre en toda la capa y=0', bedrockOk);
check('no hay agua por encima del nivel del mar', waterAboveSea === 0, `${waterAboveSea} bloques`);
check('no hay tierra ni piedra flotando', floating === 0, `${floating} bloques`);

const h = surfaceHeight(0, 0, 1337);
check('la altura del terreno cabe en el mundo', h > 0 && h < CHUNK_Y - 10, `y=${h} de ${CHUNK_Y}`);

let maxStep = 0;
for (let z = 0; z < 120; z++) {
  for (let x = 1; x < 120; x++) {
    maxStep = Math.max(maxStep, Math.abs(surfaceHeight(x, z, 1337) - surfaceHeight(x - 1, z, 1337)));
  }
}
check('el terreno no tiene acantilados de mas de 2 bloques', maxStep <= 2,
  `salto maximo ${maxStep} (el escalon automatico sube 1)`);

console.log('='.repeat(64));
console.log(failed ? `${failed} prueba(s) fallando` : 'todas las pruebas en verde');
process.exit(failed ? 1 : 0);
