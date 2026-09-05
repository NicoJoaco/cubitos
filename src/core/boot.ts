/** Pantalla de carga. Existe sólo para que no haya un frame en blanco y para
 *  capturar el primer toque, que es lo único que autoriza pantalla completa. */
const el = () => document.getElementById('boot');
const msgEl = () => document.getElementById('boot-msg');
const barEl = () => document.getElementById('boot-bar');

export const boot = {
  progress(v: number, msg?: string) {
    const bar = barEl();
    if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    if (msg) { const m = msgEl(); if (m) m.textContent = msg; }
  },
  /** Resuelve con el primer toque real del usuario. */
  waitForTap(label = '¡Toca para jugar!'): Promise<void> {
    const m = msgEl();
    if (m) m.textContent = label;
    const bar = barEl();
    if (bar) bar.parentElement!.style.visibility = 'hidden';
    return new Promise((resolve) => {
      const root = el();
      const handler = (e: Event) => {
        e.preventDefault();
        root?.removeEventListener('pointerdown', handler);
        resolve();
      };
      root?.addEventListener('pointerdown', handler, { passive: false });
    });
  },
  hide() {
    const root = el();
    if (!root) return;
    root.classList.add('gone');
    setTimeout(() => root.remove(), 400);
  },
  fail(err: unknown) {
    const m = msgEl();
    if (m) {
      m.innerHTML = 'No se pudo iniciar el juego.<br><small style="font-weight:400">' +
        String(err).slice(0, 200) + '</small>';
    }
  },
};
