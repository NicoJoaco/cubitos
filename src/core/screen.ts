/**
 * Todo lo que hace que el juego se comporte como una app instalada y no como
 * una página: pantalla completa, bloqueo horizontal, pantalla siempre encendida,
 * botón Atrás capturado y pausa al minimizar.
 *
 * Ninguna de estas APIs existe en todos los navegadores: cada una se pide
 * dentro de try/catch y su ausencia nunca rompe el juego.
 */

type Cb = () => void;

const pauseCbs: Cb[] = [];
const resumeCbs: Cb[] = [];
const backCbs: Cb[] = [];

export function onPause(cb: Cb) { pauseCbs.push(cb); }
export function onResume(cb: Cb) { resumeCbs.push(cb); }
/** Se dispara cuando el usuario pulsa Atrás en Android. El juego NO se cierra. */
export function onBack(cb: Cb) { backCbs.push(cb); }

let paused = false;
export const isPaused = () => paused;

function emit(list: Cb[]) { for (const cb of list) { try { cb(); } catch (e) { console.error(e); } } }

// ---------------------------------------------------------------- wake lock
// WakeLockSentinel no está tipado de forma estable entre versiones de lib.dom.
let sentinel: any = null;

async function acquireWakeLock() {
  const wl = (navigator as any).wakeLock;
  if (!wl || sentinel) return;
  try {
    sentinel = await wl.request('screen');
    sentinel?.addEventListener?.('release', () => { sentinel = null; });
  } catch { /* batería baja o sin permiso: se juega igual */ }
}
async function releaseWakeLock() {
  try { await sentinel?.release(); } catch { /* ya liberado */ }
  sentinel = null;
}

// -------------------------------------------------------- fullscreen + giro
/**
 * Ninguna de estas promesas tiene garantía de resolverse: hay WebViews donde
 * requestFullscreen se queda colgada para siempre. Si el arranque del juego
 * dependiera de ella, la pantalla de carga no se iría nunca.
 */
function withTimeout<T>(p: Promise<T> | undefined, ms: number): Promise<void> {
  return Promise.race([
    Promise.resolve(p).then(() => undefined, () => undefined),
    new Promise<void>((r) => setTimeout(r, ms)),
  ]);
}

/** Debe llamarse DENTRO de un gesto del usuario (primer toque). */
export async function goImmersive(): Promise<void> {
  const el = document.documentElement as any;
  try {
    if (!document.fullscreenElement) {
      const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
      await withTimeout(req?.call(el, { navigationUI: 'hide' }), 1500);
    }
  } catch { /* iOS Safari no lo permite en <html>; seguimos */ }
  try {
    await withTimeout((screen.orientation as any)?.lock?.('landscape'), 1000);
  } catch { /* desktop / iOS: no se puede bloquear */ }
  void acquireWakeLock();
}

/** ¿Estamos en apaisado? El HUD lo usa para pedirle al niño que gire el tablet. */
export function isLandscape(): boolean {
  return window.innerWidth >= window.innerHeight;
}

// ------------------------------------------------------------ botón "Atrás"
/**
 * Android cierra la PWA con Atrás por defecto. Empujamos un estado de guarda al
 * historial y lo re-empujamos cada vez que lo consumen: el historial nunca se
 * vacía, así que Atrás jamás sale del juego. Se reporta como evento para abrir
 * el menú de pausa.
 */
function installBackGuard() {
  try { history.pushState({ guard: 1 }, '', location.href); } catch { return; }
  window.addEventListener('popstate', () => {
    try { history.pushState({ guard: 1 }, '', location.href); } catch { /* noop */ }
    emit(backCbs);
  });
}

// ------------------------------------------------------------- ciclo de vida
export function installScreenGuards() {
  installBackGuard();

  // En el teléfono la pausa se abre con Atrás. Con teclado, lo natural es
  // Escape: sin esto, en un portátil no había forma de llegar al menú.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); emit(backCbs); }
  });

  // Nada de menús contextuales al apoyar el dedo, ni zoom por doble tap.
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!paused) { paused = true; emit(pauseCbs); }
      void releaseWakeLock();
    } else {
      // Volver NO reinicia cámara ni posición: sólo se reanuda el bucle.
      if (paused) { paused = false; emit(resumeCbs); }
      void acquireWakeLock();
    }
  });

  // Último aviso fiable en móvil para persistir el mundo.
  window.addEventListener('pagehide', () => { if (!paused) { paused = true; emit(pauseCbs); } });

  // Si el usuario sale de pantalla completa, recuperamos el wake lock al volver.
  document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) void acquireWakeLock(); });
}

/** Pausa manual (menú). No toca cámara ni estado del mundo. */
export function setPaused(v: boolean) {
  if (v === paused) return;
  paused = v;
  emit(v ? pauseCbs : resumeCbs);
}
