/**
 * Orquesta cargar y guardar la partida. Separado de storage.ts (que sólo sabe
 * de IndexedDB) y de game.ts (que sólo sabe de jugar).
 */
import { CHUNK_VOLUME } from '../world/constants.ts';
import { storage, type SavedPlayer, type WorldMeta } from './storage.ts';
import type { World } from '../world/world.ts';
import type { Player } from '../player/player.ts';

export interface Session {
  seed: number;
  edits: Map<string, Uint8Array>;
  player: SavedPlayer | null;
  /** false = modo incógnito o almacenamiento bloqueado: se juega sin guardar. */
  persistent: boolean;
}

/** Semilla nueva y estable: se guarda con el mundo para poder regenerarlo. */
const newSeed = () => (Math.random() * 0x7fffffff) | 0;

export interface SessionPlan {
  seed: number;
  /** Borrar los chunks guardados: pertenecen a otro terreno. */
  wipe: boolean;
  /** Cargar del disco lo que el jugador construyo. */
  keepEdits: boolean;
  /** Retomar la posicion guardada en vez de buscar un sitio donde aparecer. */
  keepPlayer: boolean;
}

/**
 * Que hacer al arrancar, en funcion de lo guardado y de la semilla de la URL.
 * Es una funcion pura para poder probar la tabla completa sin IndexedDB: la
 * regla de cuando hay que borrar el disco es facil de romper sin darse cuenta,
 * y romperla mezcla dos mundos.
 */
export function planSession(
  meta: WorldMeta | null,
  forcedSeed: number | undefined,
  random: () => number = newSeed,
): SessionPlan {
  if (!meta) {
    // Primera partida. No hay nada que borrar ni que conservar.
    return { seed: forcedSeed ?? random(), wipe: false, keepEdits: false, keepPlayer: false };
  }
  if (forcedSeed !== undefined && forcedSeed !== meta.seed) {
    // Otra semilla es otro mundo. Los chunks se indexan por coordenada, asi
    // que dejarlos ahi haria que reaparecieran encima del terreno nuevo.
    return { seed: forcedSeed, wipe: true, keepEdits: false, keepPlayer: false };
  }
  return { seed: meta.seed, wipe: false, keepEdits: true, keepPlayer: true };
}

export async function loadSession(forcedSeed?: number): Promise<Session> {
  const persistent = await storage.available();
  if (!persistent) {
    return { seed: forcedSeed ?? newSeed(), edits: new Map(), player: null, persistent: false };
  }

  const meta = await storage.loadMeta();
  const plan = planSession(meta, forcedSeed);

  if (plan.wipe) await storage.clear();

  const edits = new Map<string, Uint8Array>();
  if (plan.keepEdits) {
    for (const key of await storage.loadAllChunkKeys()) {
      const blocks = await storage.loadChunk(key, CHUNK_VOLUME);
      if (blocks) edits.set(key, blocks);
    }
  }

  return {
    seed: plan.seed,
    edits,
    player: plan.keepPlayer ? (meta?.player ?? null) : null,
    persistent: true,
  };
}

/** Vuelca lo pendiente. Devuelve cuántos chunks se escribieron. */
export async function saveSession(world: World, player: Player, seed: number, selected: number): Promise<number> {
  const pending = world.flush();
  for (const [key, blocks] of pending) await storage.saveChunk(key, blocks);

  const meta: WorldMeta = {
    seed,
    savedAt: Date.now(),
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch, selected,
    },
  };
  await storage.saveMeta(meta);
  return pending.length;
}
