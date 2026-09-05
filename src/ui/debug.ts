import type { Game } from '../game.ts';

/** Overlay de diagnóstico (?debug=1). Se actualiza 4 veces por segundo para no
 *  falsear la propia medición con reflows del DOM. */
export function mountDebugHud(game: Game): () => void {
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;left:calc(8px + var(--sal));top:calc(8px + var(--sat));z-index:40;' +
    'margin:0;padding:8px 10px;background:rgba(0,0,0,.55);color:#cfe;' +
    'font:11px/1.4 ui-monospace,monospace;border-radius:8px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);

  const id = setInterval(() => {
    const s = game.stats();
    el.textContent = Object.entries(s).map(([k, v]) => k.padEnd(15) + v).join('\n');
  }, 250);

  return () => { clearInterval(id); el.remove(); };
}
