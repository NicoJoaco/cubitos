/**
 * Pruebas de la clasificación táctil. Es lógica pura a propósito: el rechazo de
 * palma y las zonas de control son la diferencia entre un juego usable por un
 * niño de 4 años y uno que se vuelve loco cada vez que apoya la mano.
 *
 *   node scripts/test-controls.mjs
 */
import {
  classifyTouch, PALM_RADIUS_PX, EDGE_FRACTION, JOYSTICK_ZONE,
} from '../src/ui/touch.ts';

// Pantalla de 6" en apaisado, en píxeles CSS típicos.
const W = 780, H = 360;

// Cluster de botones tal como los coloca controls.ts (100 px, 24 de separación).
const D = 100, PAD = 24, R = D / 2;
const cx = W - PAD - R, cy = H - PAD - R;
const centers = [[cx - 124, cy], [cx, cy], [cx - 62, cy - 108]];
const buttons = centers.map(([x, y]) => ({ x: x - R, y: y - R, w: D, h: D }));
const palette = { x: W / 2 - 280, y: 8, w: 560, h: 96 };

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? '[OK]  ' : '[FALLA]'} ${name}${detail ? '  ' + detail : ''}`);
};
const zoneOf = (x, y, radiusX = 12) =>
  classifyTouch({ identifier: 0, clientX: x, clientY: y, radiusX, radiusY: radiusX }, W, H, buttons, palette).zone;

console.log('');
console.log('PRUEBAS DE CONTROLES TÁCTILES');
console.log('='.repeat(64));

console.log('\nGEOMETRÍA DE LOS BOTONES');
check('diámetro = 100 px', D === 100, `${D} px`);
let minGap = Infinity;
for (let i = 0; i < centers.length; i++) {
  for (let j = i + 1; j < centers.length; j++) {
    const d = Math.hypot(centers[i][0] - centers[j][0], centers[i][1] - centers[j][1]);
    minGap = Math.min(minGap, d);
  }
}
check('separación entre centros >= 124 px', minGap >= 124, `min ${minGap.toFixed(1)} px`);
check('separación entre bordes >= 24 px', minGap - D >= 24, `min ${(minGap - D).toFixed(1)} px`);
check('todos los botones dentro de la pantalla',
  buttons.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H));

console.log('\nRECHAZO DE PALMA');
check('radiusX > 40 se descarta en el centro', zoneOf(W / 2, H / 2, PALM_RADIUS_PX + 5) === 'reject');
check('radiusX > 40 se descarta sobre un botón', zoneOf(cx, cy, PALM_RADIUS_PX + 5) === 'reject');
check('radiusX > 40 se descarta sobre el joystick', zoneOf(60, H - 30, PALM_RADIUS_PX + 5) === 'reject');
check('una yema normal (radiusX 12) pasa', zoneOf(W / 2, H / 2, 12) === 'look');
check('radiusX exactamente 40 pasa (el umbral es estricto)', zoneOf(W / 2, H / 2, 40) === 'look');

console.log('\nFRANJAS LATERALES (8 %)');
const edgeX = W * EDGE_FRACTION * 0.5;
check('borde izquierdo a media altura se descarta', zoneOf(edgeX, H / 2) === 'reject');
check('borde derecho a media altura se descarta', zoneOf(W - edgeX, H / 2) === 'reject');
check('borde izquierdo DENTRO del joystick sí vale',
  zoneOf(edgeX, H * JOYSTICK_ZONE.yMin + 20) === 'joystick');
check('borde derecho SOBRE un botón sí vale', zoneOf(cx + 40, cy) === 'button');

console.log('\nZONAS');
check('tercio inferior izquierdo = joystick', zoneOf(W * 0.2, H * 0.9) === 'joystick');
check('justo encima del tercio inferior = mirada', zoneOf(W * 0.2, H * 0.6) === 'look');
check('justo a la derecha del tercio izquierdo = mirada', zoneOf(W * 0.4, H * 0.9) === 'look');
check('centro de la pantalla = mirada', zoneOf(W / 2, H / 2) === 'look');
check('paleta la maneja el DOM', zoneOf(W / 2, 40) === 'ignore');
for (let i = 0; i < 3; i++) {
  const [bx, by] = centers[i];
  check(`botón ${i} responde en su centro`,
    classifyTouch({ identifier: 0, clientX: bx, clientY: by, radiusX: 12 }, W, H, buttons, palette).button === i);
}

console.log('\nMULTITÁCTIL');
const a = classifyTouch({ identifier: 7, clientX: W * 0.15, clientY: H * 0.9, radiusX: 14 }, W, H, buttons, palette);
const b = classifyTouch({ identifier: 8, clientX: cx, clientY: cy, radiusX: 14 }, W, H, buttons, palette);
check('joystick y botón se clasifican de forma independiente',
  a.zone === 'joystick' && b.zone === 'button' && b.button === 1);

console.log('='.repeat(64));
console.log(failed ? `${failed} prueba(s) fallando` : 'todas las pruebas en verde');
process.exit(failed ? 1 : 0);
