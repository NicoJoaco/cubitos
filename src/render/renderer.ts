import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { SKY_INT } from '../theme.ts';

export interface Viewport {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** 1 = nativo (hasta 2x DPR), 0.75 = primer escalón del escalador. */
  setRenderScale(s: number): void;
  renderScale: number;
  resize(): void;
  dispose(): void;
}

export class NoWebGL2Error extends Error {
  constructor() { super('Este dispositivo no soporta WebGL2'); }
}

export function createViewport(canvas: HTMLCanvasElement): Viewport {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,          // el escalado de resolución hace de sustituto
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
    desynchronized: true,      // menos latencia de toque en Android
  });
  if (!gl) throw new NoWebGL2Error();

  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: false });
  renderer.setClearColor(SKY_INT, 1);
  renderer.autoClear = true;
  renderer.shadowMap.enabled = false;
  renderer.info.autoReset = false; // se resetea a mano para poder leer draw calls

  const scene = new Scene();
  const camera = new PerspectiveCamera(72, 1, 0.1, 400);

  let renderScale = 1;

  const resize = () => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    // Tope duro de 2x: en pantallas 3x el coste de fragmentos se dispara sin
    // que se note en un juego de cubos.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * renderScale);
    renderer.setSize(w, h, false); // false: el CSS ya estira el canvas al 100%
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', resize, { passive: true });

  return {
    renderer, scene, camera, resize,
    get renderScale() { return renderScale; },
    setRenderScale(s: number) {
      if (s === renderScale) return;
      renderScale = s;
      resize();
    },
    dispose() {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      renderer.dispose();
    },
  };
}
