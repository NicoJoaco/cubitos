/**
 * Menú de pausa. Aparece con el botón Atrás de Android (que ya no cierra el
 * juego) y al volver de segundo plano.
 *
 * Deliberadamente NO tiene "borrar mundo": un niño de 4 años lo encontraría.
 * Para empezar de cero, el adulto borra los datos del sitio (está en el README).
 */
import { isMuted, setMuted, sfxSelect } from '../audio/sfx.ts';

const CSS = `
#pause{position:fixed;inset:0;z-index:60;display:none;place-items:center;
  background:rgba(12,40,52,.55);backdrop-filter:blur(3px);
  padding:var(--sat) var(--sar) var(--sab) var(--sal)}
#pause.on{display:grid}
#pause .card{background:rgba(255,255,255,.94);border-radius:24px;padding:22px 26px;
  display:flex;flex-direction:column;gap:14px;align-items:center;
  box-shadow:0 12px 40px rgba(0,0,0,.35);max-width:min(88vw,420px)}
#pause h1{margin:0;font-size:22px;color:#14414f;letter-spacing:.3px}
#pause button{font:600 20px/1 system-ui,sans-serif;border:0;border-radius:16px;
  padding:18px 26px;min-width:240px;min-height:64px;color:#fff;background:#3aa64a;
  box-shadow:0 4px 0 #2c7f39;cursor:pointer}
#pause button:active{transform:translateY(2px);box-shadow:0 2px 0 #2c7f39}
#pause button.sec{background:#5a7f8c;box-shadow:0 4px 0 #45626c;font-size:18px;min-height:56px}
#pause .saved{font:500 14px system-ui,sans-serif;color:#3b6b4a;min-height:18px}
`;

export interface PauseMenu {
  show(): void;
  hide(): void;
  toggle(): void;
  readonly visible: boolean;
  setSaved(text: string): void;
  dispose(): void;
}

/**
 * @param onRescue lleva al jugador a tierra firme. Es la salida para cuando
 *   alguien acaba en mitad del mar o metido en un agujero del que no sabe
 *   salir: sin esto, la unica via era escribir un parametro raro en la URL, y
 *   eso no es algo que se le pueda pedir a nadie, y menos a un nino.
 */
export function createPauseMenu(onResume: () => void, onRescue: () => void): PauseMenu {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'pause';
  root.innerHTML = `
    <div class="card">
      <h1>Juego en pausa</h1>
      <button id="pause-resume">Seguir jugando</button>
      <button id="pause-sound" class="sec"></button>
      <button id="pause-rescue" class="sec">Llevarme a tierra firme</button>
      <div class="saved" id="pause-saved"></div>
    </div>`;
  document.body.appendChild(root);

  const savedEl = root.querySelector('#pause-saved') as HTMLElement;
  const soundBtn = root.querySelector('#pause-sound') as HTMLButtonElement;
  const paintSound = () => { soundBtn.textContent = isMuted() ? 'Sonido: apagado' : 'Sonido: encendido'; };
  paintSound();

  soundBtn.addEventListener('click', () => { setMuted(!isMuted()); paintSound(); sfxSelect(); });

  const menu: PauseMenu = {
    get visible() { return root.classList.contains('on'); },
    show() { root.classList.add('on'); },
    hide() { root.classList.remove('on'); },
    toggle() { if (menu.visible) { menu.hide(); onResume(); } else menu.show(); },
    setSaved(text: string) { savedEl.textContent = text; },
    dispose() { root.remove(); style.remove(); },
  };

  (root.querySelector('#pause-resume') as HTMLElement).addEventListener('click', () => {
    menu.hide();
    onResume();
  });

  (root.querySelector('#pause-rescue') as HTMLElement).addEventListener('click', () => {
    onRescue();
    sfxSelect();
    menu.setSaved('Ya estas en tierra firme');
    menu.hide();
    onResume();
  });

  return menu;
}
