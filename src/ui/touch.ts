/**
 * Enrutador táctil. Usa TouchEvent (no PointerEvent ni eventos de ratón
 * emulados) porque necesita dos cosas que sólo están ahí: `identifier`, para
 * seguir cada dedo por separado, y `radiusX/radiusY`, para distinguir la yema
 * de un dedo de una palma apoyada.
 *
 * La clasificación es una función pura para poder probarla sin navegador.
 */

export type Zone = 'joystick' | 'look' | 'button' | 'ignore' | 'reject';

export interface Rect { x: number; y: number; w: number; h: number }

export interface TouchLike {
  identifier: number;
  clientX: number;
  clientY: number;
  radiusX?: number;
  radiusY?: number;
}

/** Un dedo apoyado deja una huella mucho más ancha que una yema. */
export const PALM_RADIUS_PX = 40;
/** Franjas laterales que en la mano de un niño son casi siempre la palma. */
export const EDGE_FRACTION = 0.08;
/** El joystick nace en el tercio inferior izquierdo. */
export const JOYSTICK_ZONE = { xMax: 1 / 3, yMin: 2 / 3 };

const inRect = (x: number, y: number, r: Rect) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * A qué zona pertenece un toque. El orden importa: primero las zonas de
 * control (un botón junto al borde debe seguir funcionando) y sólo después el
 * rechazo por franja lateral.
 */
export function classifyTouch(
  t: TouchLike,
  w: number, h: number,
  buttons: Rect[] = [],
  palette: Rect | null = null,
): { zone: Zone; button: number } {
  const { clientX: x, clientY: y } = t;

  // 1. Palma: huella demasiado ancha, venga de donde venga.
  if ((t.radiusX ?? 0) > PALM_RADIUS_PX || (t.radiusY ?? 0) > PALM_RADIUS_PX) {
    return { zone: 'reject', button: -1 };
  }

  // 2. Botones de acción.
  for (let i = 0; i < buttons.length; i++) {
    if (inRect(x, y, buttons[i]!)) return { zone: 'button', button: i };
  }

  // 3. Paleta: la maneja el DOM (scroll horizontal nativo).
  if (palette && inRect(x, y, palette)) return { zone: 'ignore', button: -1 };

  // 4. Joystick.
  if (x < w * JOYSTICK_ZONE.xMax && y > h * JOYSTICK_ZONE.yMin) {
    return { zone: 'joystick', button: -1 };
  }

  // 5. Franjas laterales fuera de toda zona de control: palma apoyada.
  if (x < w * EDGE_FRACTION || x > w * (1 - EDGE_FRACTION)) {
    return { zone: 'reject', button: -1 };
  }

  return { zone: 'look', button: -1 };
}

export interface TouchHandlers {
  onJoystickStart(id: number, x: number, y: number): void;
  onJoystickMove(id: number, x: number, y: number): void;
  onJoystickEnd(id: number): void;
  onLookStart(id: number, x: number, y: number): void;
  onLookMove(id: number, dx: number, dy: number): void;
  onLookEnd(id: number): void;
  onButtonDown(index: number, id: number): void;
  onButtonUp(index: number, id: number): void;
  /** Rects vivos de los botones y de la paleta, en coordenadas de cliente. */
  layout(): { buttons: Rect[]; palette: Rect | null };
}

interface Active { zone: Zone; button: number; lastX: number; lastY: number }

export interface TouchRouter {
  dispose(): void;
  /** Diagnóstico: cuántos toques se descartaron por palma o por borde. */
  readonly rejected: number;
  readonly active: number;
}

export function installTouchRouter(target: HTMLElement, h: TouchHandlers): TouchRouter {
  const live = new Map<number, Active>();
  let rejected = 0;

  const onStart = (e: TouchEvent) => {
    const { buttons, palette } = h.layout();
    const w = window.innerWidth, hh = window.innerHeight;
    for (const t of Array.from(e.changedTouches)) {
      const { zone, button } = classifyTouch(t, w, hh, buttons, palette);
      if (zone === 'reject') { rejected++; continue; }
      if (zone === 'ignore') continue;
      live.set(t.identifier, { zone, button, lastX: t.clientX, lastY: t.clientY });
      if (zone === 'joystick') h.onJoystickStart(t.identifier, t.clientX, t.clientY);
      else if (zone === 'look') h.onLookStart(t.identifier, t.clientX, t.clientY);
      else if (zone === 'button') h.onButtonDown(button, t.identifier);
    }
    // Sólo se cancela el gesto si al menos un dedo es nuestro: así la paleta
    // conserva su scroll nativo.
    if (live.size) e.preventDefault();
  };

  const onMove = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const a = live.get(t.identifier);
      if (!a) continue;
      if (a.zone === 'joystick') {
        h.onJoystickMove(t.identifier, t.clientX, t.clientY);
      } else if (a.zone === 'look') {
        h.onLookMove(t.identifier, t.clientX - a.lastX, t.clientY - a.lastY);
      }
      a.lastX = t.clientX;
      a.lastY = t.clientY;
    }
    if (live.size) e.preventDefault();
  };

  const onEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const a = live.get(t.identifier);
      if (!a) continue;
      live.delete(t.identifier);
      if (a.zone === 'joystick') h.onJoystickEnd(t.identifier);
      else if (a.zone === 'look') h.onLookEnd(t.identifier);
      else if (a.zone === 'button') h.onButtonUp(a.button, t.identifier);
    }
  };

  const opts = { passive: false } as const;
  target.addEventListener('touchstart', onStart, opts);
  target.addEventListener('touchmove', onMove, opts);
  target.addEventListener('touchend', onEnd, opts);
  target.addEventListener('touchcancel', onEnd, opts);

  return {
    dispose() {
      target.removeEventListener('touchstart', onStart);
      target.removeEventListener('touchmove', onMove);
      target.removeEventListener('touchend', onEnd);
      target.removeEventListener('touchcancel', onEnd);
    },
    get rejected() { return rejected; },
    get active() { return live.size; },
  };
}
