import { Vector3 } from 'three';
import { createViewport, type Viewport } from './render/renderer.ts';
import { createVoxelMaterial, type VoxelMaterial } from './render/materials.ts';
import { createTileTexture } from './world/atlas.ts';
import { World } from './world/world.ts';
import { findSpawn } from './world/chunk.ts';
import { CHUNK_X, RENDER_DISTANCE_DEFAULT } from './world/constants.ts';
import { Block } from './world/blocks.ts';
import { createLoop, type Loop } from './core/loop.ts';
import { Player } from './player/player.ts';
import { raycastVoxels } from './player/raycast.ts';
import { createControls, type Controls } from './ui/controls.ts';
import { installKeyboard } from './ui/keyboard.ts';
import { createPauseMenu, type PauseMenu } from './ui/pause.ts';
import { sfxBreak, sfxPlace, sfxJump, sfxLand, sfxStep, audioReady, isMuted } from './audio/sfx.ts';
import { saveSession, type Session } from './core/session.ts';
import { onBack, onPause, setPaused, isPaused } from './core/screen.ts';
import { createQualityScaler, DEFAULT_LEVEL, type QualityScaler } from './core/quality.ts';

export interface Game {
  view: Viewport;
  world: World;
  loop: Loop;
  player: Player;
  controls: Controls;
  pause: PauseMenu;
  quality: QualityScaler;
  /** El benchmark lo apaga para medir un nivel fijo. */
  setAutoQuality(on: boolean): void;
  save(): Promise<number>;
  /** Teletransporta a tierra firme. Lo usa el menu de pausa. */
  rescue(): void;
  setRenderDistance(n: number): void;
  /** Un frame completo: usado por el bucle y por el benchmark. */
  step(dt: number): void;
  stats(): Record<string, number>;
  dispose(): void;
}

/** Tiempo máximo por frame para generar/mallar. El resto del frame es render. */
const STREAM_BUDGET_MS = 5;
/** Alcance de romper/poner. Corto a propósito: el objetivo es lo que se ve. */
const REACH = 6;
/** Cada cuánto se vuelca el mundo si hay cambios. Un niño no va a pulsar
 *  "guardar": el juego guarda solo, y también al minimizar. */
const AUTOSAVE_MS = 12_000;
/** Distancia entre pisadas, en bloques. */
const STEP_DISTANCE = 2.1;

const eye = new Vector3();
const dir = new Vector3();

export async function createGame(
  canvas: HTMLCanvasElement,
  session: Session,
  onProgress?: (v: number, msg: string) => void,
): Promise<Game> {
  const seed = session.seed;
  const view = createViewport(canvas);
  const tex = createTileTexture();
  const opaqueMat = createVoxelMaterial(tex, false);
  const transMat = createVoxelMaterial(tex, true);
  const world = new World(seed, opaqueMat, transMat, RENDER_DISTANCE_DEFAULT);
  world.restore(session.edits);
  view.scene.add(world.group);

  const player = new Player();
  const controls = createControls();
  const removeKeyboard = installKeyboard(controls.input);
  const getBlock = (x: number, y: number, z: number) => world.getBlock(x, y, z);
  /** Deja al jugador de pie en tierra firme, sin tocar lo que haya construido. */
  function rescue() {
    const s = findSpawn(seed);
    // Se genera el terreno de destino antes de mover: si no, columnTop leeria
    // un chunk vacio y lo dejaria cayendo al vacio.
    for (let i = 0; i < 400; i++) {
      world.update(s.x, s.z, 16);
      if (world.generatedLastFrame === 0 && world.meshedLastFrame === 0) break;
    }
    player.pos.set(s.x + 0.5, world.columnTop(s.x, s.z), s.z + 0.5);
    player.vel.set(0, 0, 0);
    player.pitch = 0;
  }

  const pause = createPauseMenu(() => setPaused(false), rescue);

  // El escalador manda sobre la resolución y la distancia; nada más las toca.
  const quality = createQualityScaler((lvl) => {
    view.setRenderScale(lvl.scale);
    world.renderDistance = lvl.distance;
    applyFog(lvl.distance, opaqueMat, transMat, view);
  }, DEFAULT_LEVEL);

  // Estado del sonido: hace falta recordar el frame anterior para distinguir
  // "está en el suelo" de "acaba de aterrizar".
  let wasOnGround = true;
  let jumpWasHeld = false;
  let stepAccum = 0;
  let autoQuality = true;
  const lastPos = new Vector3();

  const game: Game = {
    view, world, player, controls, pause, quality,
    loop: null as unknown as Loop,
    save: () => saveSession(world, player, seed, controls.input.selected),
    rescue,
    step,
    setRenderDistance(n: number) {
      world.renderDistance = n;
      applyFog(n, opaqueMat, transMat, view);
    },
    stats() {
      const s = world.stats();
      const info = view.renderer.info;
      return {
        fps: Math.round(game.loop.stats.fps),
        frametimeMs: +game.loop.stats.avg60.toFixed(2),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        chunks: s.chunks,
        meshes: s.meshes,
        renderDistance: world.renderDistance,
        renderScale: view.renderScale,
        qualityLevel: quality.level,
        geometryMB: +(s.geometryBytes / 1048576).toFixed(2),
        voxelMB: +(s.voxelBytes / 1048576).toFixed(2),
        touchesRejected: controls.router.rejected,
        editedChunks: world.editedCount,
        poolReused: s.poolReused,
        poolCreated: s.poolCreated,
        audio: audioReady() && !isMuted() ? 1 : 0,
      };
    },
    setAutoQuality(on: boolean) { autoQuality = on; },
    dispose() {
      clearInterval(autosave);
      game.loop.stop();
      pause.dispose();
      removeKeyboard();
      controls.dispose();
      world.dispose();
      opaqueMat.dispose();
      transMat.dispose();
      tex.dispose();
      view.dispose();
    },
  };

  function step(dt: number) {
    const input = controls.input;

    lastPos.copy(player.pos);
    player.update(dt, getBlock, input);

    // --- sonido ligado al estado, no a los eventos de entrada
    if (input.jump && !jumpWasHeld && wasOnGround) sfxJump();
    jumpWasHeld = input.jump;
    if (player.onGround && !wasOnGround) sfxLand();
    if (player.onGround) {
      stepAccum += Math.hypot(player.pos.x - lastPos.x, player.pos.z - lastPos.z);
      if (stepAccum >= STEP_DISTANCE) { stepAccum = 0; sfxStep(); }
    } else {
      stepAccum = 0;
    }
    wasOnGround = player.onGround;

    applyEdits(input.breakPressed, input.placePressed, input.selected);
    controls.consumeEdges();

    player.eye(eye);
    view.camera.position.copy(eye);
    view.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

    world.update(player.pos.x, player.pos.z, STREAM_BUDGET_MS);

    // Se muestrea con el frametime del bucle real; durante el benchmark el
    // escalador se apaga para que la medición no se mueva bajo los pies.
    if (autoQuality && game.loop) quality.sample(game.loop.stats.avg60, performance.now());

    view.renderer.info.reset();
    view.renderer.render(view.scene, view.camera);
  }

  function applyEdits(doBreak: boolean, doPlace: boolean, selected: number) {
    if (!doBreak && !doPlace) return;
    player.eye(eye);
    player.forward(dir);
    const hit = raycastVoxels(getBlock, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
    if (!hit) return;

    if (doBreak) {
      if (world.setBlock(hit.x, hit.y, hit.z, Block.Air)) sfxBreak();
      return;
    }
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    // Nunca construir dentro del propio jugador: quedaría atrapado en un cubo.
    if (player.overlapsBlock(px, py, pz)) return;
    const target = getBlock(px, py, pz);
    if (target !== Block.Air && target !== Block.Water) return;
    if (world.setBlock(px, py, pz, selected)) sfxPlace();
  }

  applyFog(world.renderDistance, opaqueMat, transMat, view);

  // --- carga inicial: se insiste hasta que el anillo visible está mallado,
  //     cediendo el hilo para que la barra de carga se siga animando.
  // Un mundo nuevo aparece en tierra firme, no en mitad del oceano. Con una
  // partida guardada se retoma donde se dejo.
  const spawn = session.player
    ? { x: session.player.x, z: session.player.z }
    : findSpawn(seed);
  const target = (2 * world.renderDistance + 1) ** 2;
  for (let i = 0; i < 400; i++) {
    world.update(spawn.x, spawn.z, 16);
    onProgress?.(0.15 + 0.8 * Math.min(1, world.stats().chunks / target), 'Construyendo el mundo…');
    if (world.generatedLastFrame === 0 && world.meshedLastFrame === 0) break;
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }

  // Se retoma donde se dejó; si es la primera partida, de pie sobre el terreno.
  if (session.player) {
    player.pos.set(session.player.x, session.player.y, session.player.z);
    player.yaw = session.player.yaw;
    player.pitch = session.player.pitch;
    controls.input.selected = session.player.selected;
  } else {
    player.pos.set(spawn.x + 0.5, world.columnTop(spawn.x, spawn.z), spawn.z + 0.5);
    player.yaw = 0.6;
  }

  // Guardado automático: periódico, al minimizar y al abrir la pausa. IndexedDB
  // es asíncrono, así que nunca bloquea el frame.
  const autosave = setInterval(() => { void game.save(); }, AUTOSAVE_MS);
  onPause(() => { void game.save().then((n) => pause.setSaved(n ? 'Mundo guardado' : '')); });
  onBack(() => {
    const nowPaused = !isPaused();
    setPaused(nowPaused);
    pause.toggle();
    if (nowPaused) void game.save().then(() => pause.setSaved('Mundo guardado'));
  });

  game.loop = createLoop((dt) => game.step(dt));
  return game;
}

function applyFog(renderDistance: number, a: VoxelMaterial, b: VoxelMaterial, view: Viewport) {
  const far = renderDistance * CHUNK_X - 4;
  a.setFog(far * 0.55, far);
  b.setFog(far * 0.55, far);
  view.camera.far = far + 24;
  view.camera.updateProjectionMatrix();
}
