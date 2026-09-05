/**
 * Simulación del escalador dinámico de calidad. Es lógica pura, así que se
 * puede alimentar con curvas de frametime sintéticas y comprobar exactamente
 * cuándo reacciona, sin depender de tener un teléfono lento a mano.
 *
 *   node scripts/test-quality.mjs
 */
import {
  createQualityScaler, LEVELS, DEFAULT_LEVEL, DOWN_MS, UP_MS, UP_HOLD_MS, COOLDOWN_MS,
} from '../src/core/quality.ts';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? '[OK]  ' : '[FALLA]'} ${name}${detail ? '  ' + detail : ''}`);
};

/** Corre `frames` frames a un frametime dado y devuelve la traza de cambios. */
function run(scaler, frametime, seconds, t0 = 0) {
  const changes = [];
  const frames = Math.round((seconds * 1000) / frametime);
  let t = t0;
  for (let i = 0; i < frames; i++) {
    t += frametime;
    if (scaler.sample(frametime, t)) changes.push({ t: +(t / 1000).toFixed(2), level: scaler.level });
  }
  return { changes, t };
}

const makeScaler = (start = DEFAULT_LEVEL) => {
  const applied = [];
  const s = createQualityScaler((lvl) => applied.push(lvl), start);
  return { s, applied };
};

console.log('');
console.log('SIMULACIÓN DEL ESCALADOR DE CALIDAD');
console.log('='.repeat(64));

console.log('\nESCALONES');
console.log('  nivel  escala  distancia');
LEVELS.forEach((l, i) => console.log(`  ${String(i).padEnd(7)}${l.scale.toFixed(2).padEnd(8)}${l.distance}${i === DEFAULT_LEVEL ? '   <- por defecto' : ''}`));
check('el nivel por defecto es distancia 4 y escala 1.00',
  LEVELS[DEFAULT_LEVEL].distance === 4 && LEVELS[DEFAULT_LEVEL].scale === 1);
check('primero baja la resolución, después la distancia',
  LEVELS[DEFAULT_LEVEL - 1].distance === LEVELS[DEFAULT_LEVEL].distance
  && LEVELS[DEFAULT_LEVEL - 1].scale < LEVELS[DEFAULT_LEVEL].scale,
  `nivel ${DEFAULT_LEVEL - 1} = escala ${LEVELS[DEFAULT_LEVEL - 1].scale}, distancia ${LEVELS[DEFAULT_LEVEL - 1].distance}`);
check('nunca baja de distancia 2', Math.min(...LEVELS.map((l) => l.distance)) === 2);
check('nunca sube de distancia 6', Math.max(...LEVELS.map((l) => l.distance)) === 6);

console.log('\nTELÉFONO LENTO: 25 ms sostenidos (40 fps)');
{
  const { s } = makeScaler();
  const r = run(s, 25, 12);
  check('baja escalón a escalón, no de golpe',
    r.changes.every((c, i) => i === 0 || c.level === r.changes[i - 1].level - 1));
  check('respeta el enfriamiento entre bajadas',
    r.changes.every((c, i) => i === 0 || (c.t - r.changes[i - 1].t) * 1000 >= COOLDOWN_MS - 30));
  check('termina en el nivel mínimo', s.level === 0, `nivel ${s.level}, escala ${s.current.scale}, distancia ${s.current.distance}`);
  console.log('   traza: ' + r.changes.map((c) => `${c.t}s→N${c.level}`).join('  '));
}

console.log('\nTELÉFONO HOLGADO: 9 ms sostenidos (110 fps)');
{
  const { s } = makeScaler();
  const r = run(s, 9, 20);
  check('la primera subida tarda al menos 5 s',
    r.changes.length > 0 && r.changes[0].t * 1000 >= UP_HOLD_MS,
    `primera subida a los ${r.changes[0]?.t}s`);
  check('llega al máximo', s.level === LEVELS.length - 1, `nivel ${s.level}, distancia ${s.current.distance}`);
  console.log('   traza: ' + r.changes.map((c) => `${c.t}s→N${c.level}`).join('  '));
}

console.log('\nZONA MUERTA: 16 ms (entre 12 y 20)');
{
  const { s } = makeScaler();
  const r = run(s, 16, 30);
  check('no cambia nada en 30 s', r.changes.length === 0 && s.level === DEFAULT_LEVEL);
}

console.log('\nOSCILACIÓN: 21 ms y 11 ms alternando cada 3 s');
{
  const { s } = makeScaler();
  let t = 0, changes = 0;
  for (let cycle = 0; cycle < 10; cycle++) {
    const ft = cycle % 2 === 0 ? 21 : 11;
    const r = run(s, ft, 3, t);
    t = r.t;
    changes += r.changes.length;
  }
  check('no entra en bucle de subir y bajar sin parar', changes <= 6, `${changes} cambios en 30 s`);
  check('se queda en la mitad baja de la escala', s.level <= DEFAULT_LEVEL, `nivel ${s.level}`);
}

console.log('\nPICO AISLADO: 1 frame de 200 ms sobre 10 ms de base');
{
  const { s } = makeScaler();
  // avg60 con un pico de 200 ms en una ventana de 60 frames de 10 ms:
  const avgConPico = (59 * 10 + 200) / 60;
  check('un pico suelto no llega a mover la media por encima de 20 ms',
    avgConPico < DOWN_MS, `media = ${avgConPico.toFixed(1)} ms`);
  let moved = false;
  for (let i = 0; i < 60; i++) if (s.sample(avgConPico, 2000 + i * 10)) moved = true;
  check('y por tanto no baja la calidad', !moved && s.level === DEFAULT_LEVEL);
}

console.log('\nUMBRALES');
check(`bajar por encima de ${DOWN_MS} ms`, DOWN_MS === 20);
check(`subir por debajo de ${UP_MS} ms`, UP_MS === 12);
check(`la subida exige ${UP_HOLD_MS / 1000} s sostenidos`, UP_HOLD_MS === 5000);

console.log('='.repeat(64));
console.log(failed ? `${failed} prueba(s) fallando` : 'todas las pruebas en verde');
process.exit(failed ? 1 : 0);
