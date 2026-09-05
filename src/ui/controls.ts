/**
 * HUD táctil. Todo está dimensionado para dedos de 4 años en una pantalla de
 * 6": objetivos grandes, separados, y ninguno debajo de la muesca ni en las
 * franjas donde se apoya la palma.
 *
 * Los tamaños son constantes con nombre porque son requisitos, no estética.
 */
import { classifyTouch, installTouchRouter, type Rect, type TouchRouter } from './touch.ts';
import { BLOCKS, PALETTE, BLOCK_TILES } from '../world/blocks.ts';
import { buildTileArray, TILE_SIZE } from '../world/atlas.ts';

export const JOYSTICK_RADIUS = 90;
export const BUTTON_DIAMETER = 100;
/** Separación mínima entre BORDES; los centros quedan a >= 124 px. */
export const BUTTON_GAP = 24;
export const PALETTE_ITEM = 80;
/** Margen contra el borde seguro de la pantalla. */
export const PAD = 24;

export interface InputState {
  /** -1..1 en cada eje; y positivo = adelante. */
  moveX: number;
  moveY: number;
  /** Radianes acumulados desde el frame anterior. */
  lookDX: number;
  lookDY: number;
  jump: boolean;
  /** Flancos: se consumen con consumeEdges(). */
  breakPressed: boolean;
  placePressed: boolean;
  selected: number;
}

export interface Controls {
  input: InputState;
  consumeEdges(): void;
  router: TouchRouter;
  root: HTMLElement;
  dispose(): void;
}

const BTN_BREAK = 0, BTN_PLACE = 1, BTN_JUMP = 2;

// ------------------------------------------------------------ dibujo de tiles
const tiles = buildTileArray();

/** Pinta un tile del atlas en un canvas, sin suavizado (pixel art). */
function tileImage(tile: number, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = TILE_SIZE;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(TILE_SIZE, TILE_SIZE);
  img.data.set(tiles.subarray(tile * TILE_SIZE * TILE_SIZE * 4, (tile + 1) * TILE_SIZE * TILE_SIZE * 4));
  ctx.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out.width = out.height = size;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(c, 0, 0, size, size);
  return out;
}

/** Muestra de un bloque: la cara lateral con una franja de la cara superior. */
function blockSwatch(block: number, size: number): HTMLCanvasElement {
  const side = BLOCK_TILES[block * 6]!;
  const top = BLOCK_TILES[block * 6 + 2]!;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileImage(side, size), 0, 0);
  ctx.drawImage(tileImage(top, size), 0, 0, size, size * 0.34);
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  return c;
}

// ------------------------------------------------------------------- iconos
const ICONS: Record<number, string> = {
  [BTN_BREAK]: '<path d="M22 44 L44 22 M30 16 l18 18 M16 30 l18 18" stroke="currentColor" stroke-width="7" stroke-linecap="round" fill="none"/>',
  [BTN_PLACE]: '<path d="M33 14 v38 M14 33 h38" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>',
  [BTN_JUMP]: '<path d="M33 50 V18 M18 32 L33 16 L48 32" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
};

function makeButton(kind: number, label: string, cls: string): HTMLElement {
  const b = document.createElement('div');
  b.className = 'btn ' + cls;
  b.setAttribute('role', 'button');
  b.setAttribute('aria-label', label);
  b.innerHTML = `<svg viewBox="0 0 66 66" aria-hidden="true">${ICONS[kind]}</svg>`;
  return b;
}

const CSS = `
#hud{position:fixed;inset:0;z-index:20;pointer-events:none;
     padding:var(--sat) var(--sar) var(--sab) var(--sal)}
#hud .btn{position:absolute;width:${BUTTON_DIAMETER}px;height:${BUTTON_DIAMETER}px;
  border-radius:50%;background:rgba(255,255,255,.34);border:3px solid rgba(255,255,255,.6);
  box-shadow:0 3px 10px rgba(0,0,0,.25);color:#12333f;display:grid;place-items:center;
  pointer-events:none;transition:transform .06s ease,background .06s ease}
#hud .btn svg{width:62%;height:62%}
#hud .btn.down{transform:scale(.92);background:rgba(255,255,255,.62)}
/* Anclados a las esquinas seguras con env(): un elemento posicionado en
   absoluto ignora el padding del contenedor, así que la muesca tiene que
   entrar en el propio cálculo de cada botón. */
#hud .btn.b-break{right:calc(var(--sar) + ${PAD + 124}px);bottom:calc(var(--sab) + ${PAD}px)}
#hud .btn.b-place{right:calc(var(--sar) + ${PAD}px);bottom:calc(var(--sab) + ${PAD}px)}
#hud .btn.b-jump {right:calc(var(--sar) + ${PAD + 62}px);bottom:calc(var(--sab) + ${PAD + 108}px)}
#hud #joy{position:absolute;width:${JOYSTICK_RADIUS * 2}px;height:${JOYSTICK_RADIUS * 2}px;
  margin:-${JOYSTICK_RADIUS}px 0 0 -${JOYSTICK_RADIUS}px;border-radius:50%;
  background:rgba(255,255,255,.20);border:3px solid rgba(255,255,255,.45);
  opacity:0;transition:opacity .12s ease}
#hud #joy.on{opacity:1}
#hud #knob{position:absolute;width:74px;height:74px;margin:-37px 0 0 -37px;border-radius:50%;
  background:rgba(255,255,255,.75);box-shadow:0 3px 8px rgba(0,0,0,.3);opacity:0;
  transition:opacity .12s ease}
#hud #knob.on{opacity:1}
#hud #palette{position:absolute;left:50%;transform:translateX(-50%);
  top:calc(var(--sat) + 8px);display:flex;gap:8px;padding:8px;
  max-width:min(72vw, ${PALETTE_ITEM * 7}px);overflow-x:auto;overflow-y:hidden;
  background:rgba(0,0,0,.22);border-radius:16px;
  pointer-events:auto;touch-action:pan-x;scrollbar-width:none;
  -webkit-overflow-scrolling:touch}
#hud #palette::-webkit-scrollbar{display:none}
#hud .slot{flex:0 0 auto;width:${PALETTE_ITEM}px;height:${PALETTE_ITEM}px;border-radius:12px;
  overflow:hidden;border:4px solid transparent;background:rgba(255,255,255,.12);
  display:grid;place-items:center}
#hud .slot canvas{width:100%;height:100%;display:block;image-rendering:pixelated}
#hud .slot.sel{border-color:#ffd54a;box-shadow:0 0 0 3px rgba(0,0,0,.28)}
#hud #crosshair{position:absolute;left:50%;top:50%;width:26px;height:26px;
  margin:-13px 0 0 -13px;opacity:.75}
#hud #crosshair::before,#hud #crosshair::after{content:'';position:absolute;background:#fff;
  box-shadow:0 0 2px rgba(0,0,0,.7)}
#hud #crosshair::before{left:11px;top:0;width:4px;height:26px}
#hud #crosshair::after{top:11px;left:0;height:4px;width:26px}
`;

export function createControls(): Controls {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'hud';

  const crosshair = document.createElement('div');
  crosshair.id = 'crosshair';
  root.appendChild(crosshair);

  const joy = document.createElement('div');
  joy.id = 'joy';
  const knob = document.createElement('div');
  knob.id = 'knob';
  root.append(joy, knob);

  const buttons = [
    makeButton(BTN_BREAK, 'Romper bloque', 'b-break'),
    makeButton(BTN_PLACE, 'Poner bloque', 'b-place'),
    makeButton(BTN_JUMP, 'Saltar', 'b-jump'),
  ];
  root.append(...buttons);

  const palette = document.createElement('div');
  palette.id = 'palette';
  const slots: HTMLElement[] = [];
  PALETTE.forEach((block, i) => {
    const s = document.createElement('div');
    s.className = 'slot' + (i === 0 ? ' sel' : '');
    s.setAttribute('role', 'button');
    s.setAttribute('aria-label', BLOCKS[block]!.name);
    s.appendChild(blockSwatch(block, PALETTE_ITEM));
    // Tap simple para elegir. Nada de arrastrar al mundo: a esta edad el
    // arrastre se confunde con el scroll de la propia paleta.
    s.addEventListener('click', () => select(i));
    palette.appendChild(s);
    slots.push(s);
  });
  root.appendChild(palette);
  document.body.appendChild(root);

  const input: InputState = {
    moveX: 0, moveY: 0, lookDX: 0, lookDY: 0,
    jump: false, breakPressed: false, placePressed: false,
    selected: PALETTE[0]!,
  };

  function select(i: number) {
    slots.forEach((s, k) => s.classList.toggle('sel', k === i));
    input.selected = PALETTE[i]!;
  }

  const rectOf = (el: HTMLElement): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  // ---------------------------------------------------------------- joystick
  let joyId = -1;
  let joyOX = 0, joyOY = 0;

  const setJoy = (x: number, y: number) => {
    let dx = x - joyOX, dy = y - joyOY;
    const len = Math.hypot(dx, dy);
    if (len > JOYSTICK_RADIUS) { dx = dx / len * JOYSTICK_RADIUS; dy = dy / len * JOYSTICK_RADIUS; }
    knob.style.left = `${joyOX + dx}px`;
    knob.style.top = `${joyOY + dy}px`;
    // Zona muerta del 12%: un dedo apoyado quieto no debe hacer caminar.
    const nx = dx / JOYSTICK_RADIUS, ny = dy / JOYSTICK_RADIUS;
    const m = Math.hypot(nx, ny);
    if (m < 0.12) { input.moveX = 0; input.moveY = 0; return; }
    input.moveX = nx;
    input.moveY = -ny;
  };

  const router = installTouchRouter(document.getElementById('game')!, {
    layout: () => ({
      buttons: buttons.map(rectOf),
      palette: rectOf(palette),
    }),
    onJoystickStart(id, x, y) {
      if (joyId !== -1) return;
      joyId = id;
      joyOX = x; joyOY = y;
      joy.style.left = `${x}px`; joy.style.top = `${y}px`;
      knob.style.left = `${x}px`; knob.style.top = `${y}px`;
      joy.classList.add('on'); knob.classList.add('on');
      setJoy(x, y);
    },
    onJoystickMove(id, x, y) { if (id === joyId) setJoy(x, y); },
    onJoystickEnd(id) {
      if (id !== joyId) return;
      joyId = -1;
      input.moveX = 0; input.moveY = 0;
      joy.classList.remove('on'); knob.classList.remove('on');
    },
    onLookStart() { /* la mirada sólo reacciona al arrastre */ },
    onLookMove(_id, dx, dy) {
      // 0.0042 rad/px: gira ~90 grados con un arrastre de 370 px.
      input.lookDX -= dx * 0.0042;
      input.lookDY -= dy * 0.0042;
    },
    onLookEnd() { /* nada que reiniciar */ },
    onButtonDown(i) {
      buttons[i]?.classList.add('down');
      if (i === BTN_JUMP) input.jump = true;
      else if (i === BTN_BREAK) input.breakPressed = true;
      else if (i === BTN_PLACE) input.placePressed = true;
    },
    onButtonUp(i) {
      buttons[i]?.classList.remove('down');
      if (i === BTN_JUMP) input.jump = false;
    },
  });

  // ------------------------------------------------------------------- raton
  /**
   * Los botones tienen `pointer-events: none` para que el enrutador tactil los
   * resuelva por coordenadas sobre el canvas, que es lo que permite pulsarlos
   * a la vez que el joystick. El efecto secundario es que con un raton no
   * recibian absolutamente nada: en un portatil los tres botones eran adorno.
   *
   * Aqui se hace la misma prueba de impacto que hace el enrutador tactil, con
   * la misma funcion, para que raton y dedo no puedan divergir.
   */
  function installMouse(canvas: HTMLElement): () => void {
    let dragging = false;
    let held = -1;

    const hit = (e: MouseEvent) =>
      classifyTouch(
        { identifier: -1, clientX: e.clientX, clientY: e.clientY },
        window.innerWidth, window.innerHeight,
        buttons.map(rectOf), rectOf(palette),
      );

    const releaseHeld = () => {
      if (held < 0) return;
      buttons[held]?.classList.remove('down');
      if (held === BTN_JUMP) input.jump = false;
      held = -1;
    };

    const onDown = (e: MouseEvent) => {
      const { zone, button } = hit(e);
      if (zone === 'ignore') return;             // la paleta la maneja el DOM
      if (zone === 'button') {
        held = button;
        buttons[button]?.classList.add('down');
        if (button === BTN_JUMP) input.jump = true;
        else if (button === BTN_BREAK) input.breakPressed = true;
        else if (button === BTN_PLACE) input.placePressed = true;
        e.preventDefault();
        return;
      }
      // Fuera de los botones, el raton es mirada + romper/poner. La zona del
      // joystick no aplica: en el escritorio se camina con el teclado.
      dragging = true;
      if (e.button === 0) input.breakPressed = true;
      if (e.button === 2) input.placePressed = true;
    };

    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      input.lookDX -= e.movementX * 0.0042;
      input.lookDY -= e.movementY * 0.0042;
    };

    const onUp = () => { dragging = false; releaseHeld(); };
    // Si el raton se suelta fuera de la ventana, el salto quedaria pulsado.
    const onLeave = () => { dragging = false; releaseHeld(); };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onLeave);

    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onLeave);
    };
  }

  const removeMouse = installMouse(document.getElementById('game')!);

  return {
    input,
    consumeEdges() {
      input.lookDX = 0; input.lookDY = 0;
      input.breakPressed = false; input.placePressed = false;
    },
    router,
    root,
    dispose() {
      router.dispose();
      removeMouse();
      root.remove();
      style.remove();
    },
  };
}
