/**
 * Pruebas de direccion del movimiento.
 *
 * Existe por un fallo concreto: el eje Z de la base de movimiento estaba
 * espejado, asi que avanzar te llevaba en diagonal y las flechas parecian
 * apuntar a cualquier lado. La prueba que habia entonces media cuantos bloques
 * recorria el jugador en dos segundos, daba 8,80 y pasaba tan feliz.
 *
 * Medir la distancia no sirve de nada si no se mide la direccion.
 *
 *   node scripts/test-movement.mjs
 */
import { Player } from '../src/player/player.ts';
import { Block } from '../src/world/blocks.ts';

const FLOOR = 20;
const getBlock = (_x, y, _z) => (y < FLOOR ? Block.Stone : Block.Air);
const DT = 1 / 60;

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? '[OK]  ' : '[FALLA]'} ${name}${detail ? '  ' + detail : ''}`);
};

const noInput = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, jump: false };

/** Camina `frames` con la entrada dada y devuelve el desplazamiento horizontal. */
function walk(yaw, moveX, moveY, frames = 60) {
  const p = new Player();
  p.pos.set(0.5, FLOOR, 0.5);
  p.yaw = yaw;
  // Un frame quieto para que aterrice y onGround sea true.
  p.update(DT, getBlock, noInput);
  const x0 = p.pos.x, z0 = p.pos.z;
  for (let i = 0; i < frames; i++) {
    p.update(DT, getBlock, { ...noInput, moveX, moveY });
  }
  const dx = p.pos.x - x0, dz = p.pos.z - z0;
  const len = Math.hypot(dx, dz);
  return { dx, dz, len, ux: dx / len, uz: dz / len, player: p };
}

console.log('');
console.log('PRUEBAS DE DIRECCION DEL MOVIMIENTO');
console.log('='.repeat(64));

// --------------------------------------------- el sintoma que reporto el usuario
console.log('\nEL CASO QUE FALLABA: mirando al norte (yaw = 0)');
{
  const f = walk(0, 0, 1);
  check('adelante va al norte (-Z), no de lado',
    f.uz < -0.99 && Math.abs(f.ux) < 0.02,
    `direccion (${f.ux.toFixed(3)}, ${f.uz.toFixed(3)}), esperada (0, -1)`);

  const r = walk(0, 1, 0);
  check('derecha va al este (+X)',
    r.ux > 0.99 && Math.abs(r.uz) < 0.02,
    `direccion (${r.ux.toFixed(3)}, ${r.uz.toFixed(3)}), esperada (1, 0)`);

  const b = walk(0, 0, -1);
  check('atras va al sur (+Z)', b.uz > 0.99, `direccion (${b.ux.toFixed(3)}, ${b.uz.toFixed(3)})`);

  const l = walk(0, -1, 0);
  check('izquierda va al oeste (-X)', l.ux < -0.99, `direccion (${l.ux.toFixed(3)}, ${l.uz.toFixed(3)})`);
}

// ------------------------------- coherencia con la camara en cualquier angulo
console.log('\nCOHERENCIA CON LA CAMARA (16 angulos)');
{
  let worstF = 1, worstR = 1, worstYaw = 0;
  for (let i = 0; i < 16; i++) {
    const yaw = (i / 16) * Math.PI * 2;

    // Adelante debe coincidir con la horizontal de player.forward().
    const f = walk(yaw, 0, 1);
    const fw = f.player.forward();
    const fl = Math.hypot(fw.x, fw.z);
    const dotF = f.ux * (fw.x / fl) + f.uz * (fw.z / fl);

    // Derecha debe ser perpendicular: (cos yaw, -sin yaw).
    const r = walk(yaw, 1, 0);
    const dotR = r.ux * Math.cos(yaw) + r.uz * -Math.sin(yaw);

    if (dotF < worstF) { worstF = dotF; worstYaw = yaw; }
    if (dotR < worstR) worstR = dotR;
  }
  check('adelante siempre apunta a donde mira la camara', worstF > 0.999,
    `peor coincidencia ${worstF.toFixed(4)} en yaw ${worstYaw.toFixed(2)} rad`);
  check('derecha siempre es perpendicular a la mirada', worstR > 0.999,
    `peor coincidencia ${worstR.toFixed(4)}`);
}

// ------------------------------------------------------------------ velocidad
console.log('\nVELOCIDAD');
{
  const f = walk(0, 0, 1, 120);
  check('avanzar 2 s recorre 8.8 bloques', Math.abs(f.len - 8.8) < 0.1, `${f.len.toFixed(2)} bloques`);

  const d = walk(0, 1, 1, 120);
  check('en diagonal no se va mas rapido (se normaliza)',
    Math.abs(d.len - 8.8) < 0.1, `${d.len.toFixed(2)} bloques`);
  check('la diagonal apunta al noreste',
    Math.abs(d.ux - 0.7071) < 0.02 && Math.abs(d.uz + 0.7071) < 0.02,
    `direccion (${d.ux.toFixed(3)}, ${d.uz.toFixed(3)})`);
}

// -------------------------------------------------------------------- mirada
console.log('\nMIRADA');
{
  const p = new Player();
  p.pos.set(0.5, FLOOR, 0.5);
  p.update(DT, getBlock, noInput);

  const yaw0 = p.yaw;
  p.update(DT, getBlock, { ...noInput, lookDX: -0.5 });
  check('arrastrar a la derecha gira la vista a la derecha', p.yaw < yaw0,
    `yaw ${yaw0.toFixed(2)} -> ${p.yaw.toFixed(2)}`);

  p.pitch = 0;
  p.update(DT, getBlock, { ...noInput, lookDY: -0.5 });
  check('arrastrar hacia abajo mira hacia abajo', p.pitch < 0, `pitch ${p.pitch.toFixed(2)}`);

  p.pitch = 0;
  for (let i = 0; i < 200; i++) p.update(DT, getBlock, { ...noInput, lookDY: -0.5 });
  check('no se puede mirar mas alla de los pies', p.pitch > -Math.PI / 2,
    `pitch ${p.pitch.toFixed(3)} rad, tope ${(-Math.PI / 2).toFixed(3)}`);
  p.pitch = 0;
  for (let i = 0; i < 200; i++) p.update(DT, getBlock, { ...noInput, lookDY: 0.5 });
  check('ni mas alla del cenit', p.pitch < Math.PI / 2, `pitch ${p.pitch.toFixed(3)} rad`);
}

console.log('='.repeat(64));
console.log(failed ? `${failed} prueba(s) fallando` : 'todas las pruebas en verde');
process.exit(failed ? 1 : 0);
