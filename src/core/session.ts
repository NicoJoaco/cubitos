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

export async function loadSession(forcedSeed?: number): Promise<Session> {
  const persistent = await storage.available();
  if (!persistent) {
    return { seed: forcedSeed ?? newSeed(), edits: new Map(), player: null, persistent: false };
  }

  const meta = await storage.loadMeta();
  // Una semilla forzada por URL crea un mundo distinto: no se le aplican las
  // ediciones del mundo guardado, que pertenecen a otro terreno.
  if (forcedSeed !== undefined && meta && meta.seed !== forcedSeed) {
    return { seed: forcedSeed, edits: new Map(), player: null, persistent: true };
  }

  const seed = forcedSeed ?? meta?.seed ?? newSeed();
  const edits = new Map<string, Uint8Array>();
  for (const key of await storage.loadAllChunkKeys()) {
    const blocks = await storage.loadChunk(key, CHUNK_VOLUME);
    if (blocks) edits.set(key, blocks);
  }
  return { seed, edits, player: meta?.player ?? null, persistent: true };
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
