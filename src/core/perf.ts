/** Estadísticas de frametime. Es la entrada del escalador dinámico de calidad. */
export class FrameStats {
  private buf = new Float32Array(180);
  private n = 0;
  private head = 0;
  /** Media móvil de los últimos 60 frames, en ms. */
  avg60 = 0;
  private sum60 = 0;
  private win: number[] = [];

  push(ms: number) {
    this.buf[this.head] = ms;
    this.head = (this.head + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;

    this.win.push(ms);
    this.sum60 += ms;
    if (this.win.length > 60) this.sum60 -= this.win.shift()!;
    this.avg60 = this.sum60 / this.win.length;
  }

  get fps() { return this.avg60 > 0 ? 1000 / this.avg60 : 0; }
  get samples() { return this.n; }

  /** Percentil sobre la ventana completa (180 frames ~ 3 s). */
  percentile(p: number): number {
    if (this.n === 0) return 0;
    const a = Array.from(this.buf.subarray(0, this.n)).sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(a.length * p))]!;
  }

  reset() {
    this.n = 0; this.head = 0; this.win.length = 0; this.sum60 = 0; this.avg60 = 0;
  }
}
