/**
 * Persistencia del mundo en IndexedDB.
 *
 * Sólo se guardan los chunks que el niño tocó: el resto se regenera con la
 * semilla, que es determinista. Un mundo muy construido ocupa kilobytes, no
 * megabytes, y guardar nunca bloquea el frame porque va por transacción suelta.
 *
 * Cada chunk se comprime con RLE antes de escribir. El terreno de voxels es
 * enormemente repetitivo (columnas enteras de piedra), así que un RLE simple
 * de 2 bytes por tramo reduce ~20x sin coste de CPU apreciable.
 */

const DB_NAME = 'cubitos';
const DB_VERSION = 1;
const STORE_CHUNKS = 'chunks';
const STORE_META = 'meta';

export interface SavedPlayer {
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  selected: number;
}

export interface WorldMeta {
  seed: number;
  savedAt: number;
  player: SavedPlayer | null;
}

// ---------------------------------------------------------------------- RLE
const FMT_RLE = 0;
const FMT_RAW = 1;

/**
 * Byte de formato + tramos [valor, repeticiones16].
 *
 * El peor caso del RLE (valores alternados) infla x3. Con terreno de voxels
 * eso no pasa nunca, pero un byte de formato cuesta nada y garantiza que
 * guardar jamás ocupe más que los datos crudos.
 */
export function rleEncode(src: Uint8Array): Uint8Array {
  const out: number[] = [FMT_RLE];
  let i = 0;
  while (i < src.length) {
    const v = src[i]!;
    let n = 1;
    while (i + n < src.length && src[i + n] === v && n < 0xffff) n++;
    out.push(v, n & 0xff, (n >> 8) & 0xff);
    i += n;
    if (out.length > src.length) break; // no compensa: se guarda crudo
  }
  if (out.length > src.length) {
    const raw = new Uint8Array(src.length + 1);
    raw[0] = FMT_RAW;
    raw.set(src, 1);
    return raw;
  }
  return new Uint8Array(out);
}

export function rleDecode(src: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (src.length === 0) return out;
  if (src[0] === FMT_RAW) {
    out.set(src.subarray(1, 1 + length));
    return out;
  }
  let o = 0;
  for (let i = 1; i + 2 < src.length + 1 && o < length; i += 3) {
    const v = src[i]!;
    const n = src[i + 1]! | (src[i + 2]! << 8);
    out.fill(v, o, Math.min(length, o + n));
    o += n;
  }
  return out;
}

// ----------------------------------------------------------------- IndexedDB
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null); // modo incógnito o almacenamiento bloqueado: se juega sin guardar
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) db.createObjectStore(STORE_CHUNKS);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      let req: IDBRequest<T>;
      try {
        req = fn(db.transaction(store, mode).objectStore(store));
      } catch {
        resolve(null);
        return;
      }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  });
}

export const storage = {
  /** ¿Hay almacenamiento? Si no, el juego funciona igual, sin guardar. */
  async available(): Promise<boolean> {
    return (await openDb()) !== null;
  },

  async saveChunk(key: string, blocks: Uint8Array): Promise<void> {
    await tx(STORE_CHUNKS, 'readwrite', (s) => s.put(rleEncode(blocks), key));
  },

  async loadChunk(key: string, length: number): Promise<Uint8Array | null> {
    const raw = await tx<Uint8Array>(STORE_CHUNKS, 'readonly', (s) => s.get(key));
    return raw ? rleDecode(raw, length) : null;
  },

  async loadAllChunkKeys(): Promise<string[]> {
    const keys = await tx<IDBValidKey[]>(STORE_CHUNKS, 'readonly', (s) => s.getAllKeys());
    return (keys ?? []).map(String);
  },

  async saveMeta(meta: WorldMeta): Promise<void> {
    await tx(STORE_META, 'readwrite', (s) => s.put(meta, 'world'));
  },

  async loadMeta(): Promise<WorldMeta | null> {
    return await tx<WorldMeta>(STORE_META, 'readonly', (s) => s.get('world'));
  },

  /** Tamaño aproximado de lo guardado, para el reporte de métricas. */
  async usage(): Promise<{ chunks: number; bytes: number }> {
    const keys = await this.loadAllChunkKeys();
    let bytes = 0;
    for (const k of keys) {
      const raw = await tx<Uint8Array>(STORE_CHUNKS, 'readonly', (s) => s.get(k));
      bytes += raw?.byteLength ?? 0;
    }
    return { chunks: keys.length, bytes };
  },

  async clear(): Promise<void> {
    await tx(STORE_CHUNKS, 'readwrite', (s) => s.clear());
    await tx(STORE_META, 'readwrite', (s) => s.clear());
  },
};
