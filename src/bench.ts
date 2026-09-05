/**
 * Benchmark determinista. Mueve la cámara por un recorrido fijo (con cambios
 * de chunk, para que el streaming entre en la medición) y devuelve el frametime
 * real, las draw calls y la memoria. Es lo que alimenta el reporte de métricas.
 *
 * Se activa con ?bench=1 y deja el resultado en window.__BENCH__ y en pantalla.
 */
import type { Game } from './game.ts';

export interface BenchResult {
  frames: number;
  seconds: number;
  fps: number;
  frametimeAvgMs: number;
  frametimeP50Ms: number;
  frametimeP95Ms: number;
  frametimeMaxMs: number;
  drawCallsAvg: number;
  drawCallsMax: number;
  trianglesAvg: number;
  chunksLoaded: number;
  geometryMB: number;
  voxelMB: number;
  heapMB: number | null;
  renderDistance: number;
  renderScale: number;
  devicePixelRatio: number;
  viewport: string;
  renderer: string;
  qualityLevel: number;
}

const q = (a: number[], p: number) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))]! : 0;

export async function runBench(game: Game, frames = 420, warmup = 90): Promise<BenchResult> {
  game.loop.stop();
  // Nivel fijo durante la medición: si el escalador actuara a mitad del
  // benchmark, el número resultante no describiría ninguna configuración.
  game.setAutoQuality(false);

  const dts: number[] = [];
  const calls: number[] = [];
  const tris: number[] = [];
  let n = 0;
  let t0 = 0;
  let startWall = 0;

  const startPos = game.player.pos.clone();

  await new Promise<void>((resolve) => {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;

      // Recorrido: avanza en línea recta cruzando chunks mientras gira. Toca
      // generación, mallado, descarga y culling en una sola pasada.
      const t = n / 60;
      game.player.pos.x = startPos.x + t * 6;
      game.player.pos.z = startPos.z + Math.sin(t * 0.8) * 24;
      game.player.pos.y = startPos.y + 1 + Math.sin(t * 0.5) * 2;
      game.player.vel.set(0, 0, 0);
      game.player.yaw = t * 0.35;
      game.player.pitch = -0.18 + Math.sin(t * 0.6) * 0.12;

      game.step(dt / 1000);

      if (n === warmup) { t0 = now; startWall = now; }
      if (n >= warmup) {
        dts.push(dt);
        const info = game.view.renderer.info;
        calls.push(info.render.calls);
        tris.push(info.render.triangles);
      }
      n++;
      if (n >= warmup + frames) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const seconds = (performance.now() - startWall) / 1000;
  const sorted = [...dts].sort((a, b) => a - b);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const s = game.world.stats();
  const mem = (performance as any).memory;
  const gl = game.view.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');

  game.setAutoQuality(true);
  void t0;
  return {
    frames: dts.length,
    seconds: +seconds.toFixed(2),
    fps: +(dts.length / seconds).toFixed(1),
    frametimeAvgMs: +(sum(dts) / dts.length).toFixed(2),
    frametimeP50Ms: +q(sorted, 0.5).toFixed(2),
    frametimeP95Ms: +q(sorted, 0.95).toFixed(2),
    frametimeMaxMs: +Math.max(...dts).toFixed(2),
    drawCallsAvg: +(sum(calls) / calls.length).toFixed(1),
    drawCallsMax: Math.max(...calls),
    trianglesAvg: Math.round(sum(tris) / tris.length),
    chunksLoaded: s.chunks,
    geometryMB: +(s.geometryBytes / 1048576).toFixed(2),
    voxelMB: +(s.voxelBytes / 1048576).toFixed(2),
    heapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null,
    renderDistance: game.world.renderDistance,
    renderScale: game.view.renderScale,
    devicePixelRatio: window.devicePixelRatio || 1,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'desconocido',
    qualityLevel: game.quality.level,
  };
}

export function showBench(r: BenchResult) {
  (window as any).__BENCH__ = r;
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;left:calc(8px + var(--sal));top:calc(8px + var(--sat));z-index:99;' +
    'margin:0;padding:10px 12px;background:rgba(0,0,0,.72);color:#bfe;font:12px/1.45 ui-monospace,monospace;' +
    'border-radius:10px;white-space:pre;pointer-events:none;max-height:90vh;overflow:hidden';
  el.textContent = Object.entries(r).map(([k, v]) => k.padEnd(20) + String(v)).join('\n');
  document.body.appendChild(el);
  console.log('[bench]', r);
}
