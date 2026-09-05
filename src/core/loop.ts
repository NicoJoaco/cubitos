import { onPause, onResume, isPaused } from './screen.ts';
import { FrameStats } from './perf.ts';

export interface Loop {
  readonly stats: FrameStats;
  start(): void;
  stop(): void;
  /** Frames renderizados desde el arranque. */
  readonly frame: number;
}

/**
 * Bucle de render. Al minimizar se cancela el rAF (Android igual lo congela,
 * pero así no queda un frame a medio procesar) y al volver se descarta el
 * delta acumulado: el juego reanuda, no salta.
 */
export function createLoop(step: (dtSeconds: number) => void): Loop {
  const stats = new FrameStats();
  let raf = 0;
  let last = 0;
  let frame = 0;
  let running = false;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const rawDt = now - last;
    last = now;
    // Tope de 100 ms: tras una pausa larga el mundo no se teletransporta.
    const dt = Math.min(rawDt, 100) / 1000;
    step(dt);
    stats.push(rawDt);
    frame++;
  };

  const begin = () => {
    if (running) return;
    running = true;
    last = performance.now();
    stats.reset();
    raf = requestAnimationFrame(tick);
  };
  const end = () => {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  onPause(end);
  onResume(() => { if (!isPaused()) begin(); });

  return {
    stats,
    start: begin,
    stop: end,
    get frame() { return frame; },
  };
}
