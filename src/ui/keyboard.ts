/**
 * Adaptador de teclado y ratón. No es para el teléfono: es para poder probar
 * el juego en un portátil sin pantalla táctil (y para que un adulto le muestre
 * el juego al niño antes de instalarlo).
 */
import type { InputState } from './controls.ts';

export function installKeyboard(input: InputState, canvas: HTMLElement): () => void {
  const down = new Set<string>();
  let dragging = false;

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

  const md = (e: MouseEvent) => {
    dragging = true;
    if (e.button === 0) input.breakPressed = true;
    if (e.button === 2) input.placePressed = true;
  };
  const mm = (e: MouseEvent) => {
    if (!dragging) return;
    input.lookDX -= e.movementX * 0.0042;
    input.lookDY -= e.movementY * 0.0042;
  };
  const mu = () => { dragging = false; };

  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  canvas.addEventListener('mousedown', md);
  window.addEventListener('mousemove', mm);
  window.addEventListener('mouseup', mu);

  return () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    canvas.removeEventListener('mousedown', md);
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
  };
}
