import { registerSW } from 'virtual:pwa-register';
import { installScreenGuards, goImmersive } from './core/screen.ts';
import { boot } from './core/boot.ts';
import { createGame } from './game.ts';
import { loadSession } from './core/session.ts';
import { initAudio, resumeAudio } from './audio/sfx.ts';
import { NoWebGL2Error } from './render/renderer.ts';

// autoUpdate: el SW nuevo toma control solo. Al recargar, el niño ya tiene la
// versión nueva sin ver ningún diálogo.
registerSW({ immediate: true });

const params = new URLSearchParams(location.search);
const forcedSeed = params.has('seed') ? Number(params.get('seed')) : undefined;

async function main() {
  installScreenGuards();
  boot.progress(0.1, 'Preparando el mundo…');

  const session = await loadSession(forcedSeed);
  if (!session.persistent) {
    console.warn('Sin IndexedDB: se juega, pero el mundo no se guarda.');
  }

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = await createGame(canvas, session, (v, m) => boot.progress(v, m));

  if (params.has('debug')) {
    // Gancho de diagnóstico: permite medir draw calls y triángulos desde la
    // consola sin depender del bucle de render.
    (window as any).__GAME__ = game;
    const { mountDebugHud } = await import('./ui/debug.ts');
    mountDebugHud(game);
  }

  // El toque es obligatorio: pantalla completa y bloqueo de giro sólo se
  // conceden dentro de un gesto del usuario.
  await boot.waitForTap();
  // Mismo gesto para las tres cosas que Android sólo concede con un toque:
  // pantalla completa, bloqueo de giro y arranque del audio.
  initAudio();
  resumeAudio();
  await goImmersive();
  boot.hide();
  game.view.resize();

  if (params.has('bench')) {
    const { runBench, showBench } = await import('./bench.ts');
    showBench(await runBench(game, Number(params.get('bench')) || 420));
  }
  game.loop.start();
}

main().catch((e) => {
  console.error(e);
  boot.fail(e instanceof NoWebGL2Error
    ? 'Este teléfono no soporta WebGL2, que es lo que el juego necesita para dibujar.'
    : e);
});
