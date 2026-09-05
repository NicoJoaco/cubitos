/**
 * Teclado. No es para el telefono: es para probar el juego en un portatil sin
 * pantalla tactil, y para que un adulto se lo muestre al nino antes de
 * instalarlo.
 *
 * El raton lo maneja controls.ts, que es quien sabe donde estan los botones.
 */
import type { InputState } from './controls.ts';

export function installKeyboard(input: InputState): () => void {
  const down = new Set<string>();

  const key = (e: KeyboardEvent, isDown: boolean) => {
    const k = e.key.toLowerCase();
    if (isDown) down.add(k); else down.delete(k);
    input.moveY = (down.has('w') || down.has('arrowup') ? 1 : 0) - (down.has('s') || down.has('arrowdown') ? 1 : 0);
    input.moveX = (down.has('d') || down.has('arrowright') ? 1 : 0) - (down.has('a') || down.has('arrowleft') ? 1 : 0);
    input.jump = down.has(' ');
    if (k === ' ') e.preventDefault();
  };
  const kd = (e: KeyboardEvent) => key(e, true);
  const ku = (e: KeyboardEvent) => key(e, false);
  // Si el navegador pierde el foco, las teclas se quedarian "pegadas".
  const blur = () => {
    down.clear();
    input.moveX = 0; input.moveY = 0; input.jump = false;
  };

  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', blur);

  return () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('blur', blur);
  };
}
