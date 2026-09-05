/**
 * Efectos de sonido sintetizados con WebAudio. Ni un archivo de audio: son
 * osciladores y ruido generados en el momento, lo que cuesta 0 bytes de bundle
 * y 0 peticiones de red.
 *
 * El AudioContext arranca suspendido en Android hasta que hay un gesto del
 * usuario; se reanuda en el mismo toque que activa la pantalla completa.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;

export function initAudio(): void {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Un segundo de ruido blanco, reutilizado por todos los golpes.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

export function resumeAudio(): void {
  void ctx?.resume().catch(() => {});
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.5;
}
export const isMuted = () => muted;
export const audioReady = () => ctx !== null;

function noise(duration: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'lowpass') {
  if (!ctx || !master || !noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + duration);
}

function tone(freq: number, duration: number, gain: number, type: OscillatorType = 'triangle', slideTo?: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  const t = ctx.currentTime;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + duration);
}

/** Romper: golpe seco y grave, con cola de escombro. */
export const sfxBreak = () => { noise(0.18, 900, 1, 0.5); tone(180, 0.12, 0.18, 'square', 90); };
/** Poner: un "toc" corto y alegre. */
export const sfxPlace = () => { tone(520, 0.09, 0.24, 'triangle', 700); noise(0.05, 2200, 1, 0.16); };
/** Saltar: subida rápida. */
export const sfxJump = () => tone(340, 0.14, 0.2, 'sine', 620);
/** Aterrizar: golpe amortiguado. */
export const sfxLand = () => noise(0.1, 420, 1, 0.3);
/** Elegir cubo en la paleta. */
export const sfxSelect = () => tone(880, 0.06, 0.16, 'sine');
/** Paso. Se alterna el tono para que no suene a metrónomo. */
let stepFlip = false;
export const sfxStep = () => {
  stepFlip = !stepFlip;
  noise(0.055, stepFlip ? 780 : 620, 1.4, 0.1, 'bandpass');
};
