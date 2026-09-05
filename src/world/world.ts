import { Group, Mesh } from 'three';
import type { Material } from 'three';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, RENDER_DISTANCE_MAX, chunkKey, idx } from './constants.ts';
import { Block } from './blocks.ts';
import { Chunk, generateChunk } from './chunk.ts';
import { meshChunk, PAD_VOLUME } from './mesher.ts';
import { buildPad } from './padding.ts';
import { GeometryPool, type PooledGeometry } from '../render/geometryPool.ts';

interface Entry {
  chunk: Chunk;
  opaque: Mesh | null;
  trans: Mesh | null;
  opaqueGeo: PooledGeometry | null;
  transGeo: PooledGeometry | null;
  meshed: boolean;
}

/** Volumen con borde compartido: se rellena y se descarta en cada re-mallado. */
const pad = new Uint8Array(PAD_VOLUME);

/** Desplazamientos (dx,dz) ordenados por distancia: garantiza que lo cercano
 *  se genera y se malla antes que lo lejano cuando el presupuesto se agota. */
const OFFSETS: { dx: number; dz: number; d2: number }[] = [];
{
  const R = RENDER_DISTANCE_MAX + 1;
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) OFFSETS.push({ dx, dz, d2: dx * dx + dz * dz });
  }
  OFFSETS.sort((a, b) => a.d2 - b.d2);
}

export class World {
  readonly group = new Group();
  private chunks = new Map<string, Entry>();
  private pool = new GeometryPool();
  private lastCx = NaN;
  private lastCz = NaN;

  /** Chunks con ediciones del jugador, indexados por clave. Se consultan al
   *  generar: el terreno se regenera con la semilla y encima se aplica lo
   *  guardado, así el disco sólo carga con lo que el niño construyó. */
  private saved = new Map<string, Uint8Array>();
  /** Se invoca al descargar un chunk modificado, para persistirlo. */
  onEvict: ((key: string, blocks: Uint8Array) => void) | null = null;

  /** Contadores del último update, para el reporte de métricas. */
  generatedLastFrame = 0;
  meshedLastFrame = 0;
  triangles = 0;

  readonly seed: number;
  private opaqueMat: Material;
  private transMat: Material;
  private _renderDistance: number;
  /** Al bajar la distancia hay que descargar YA: si se espera al próximo cruce
   *  de chunk, el escalador de calidad no libera nada y no sirve de nada. */
  private forceUnload = false;

  get renderDistance() { return this._renderDistance; }
  set renderDistance(n: number) {
    if (n === this._renderDistance) return;
    this._renderDistance = n;
    this.forceUnload = true;
  }

  constructor(seed: number, opaqueMat: Material, transMat: Material, renderDistance: number) {
    this.seed = seed;
    this.opaqueMat = opaqueMat;
    this.transMat = transMat;
    this._renderDistance = renderDistance;
    this.group.matrixAutoUpdate = false;
  }

  // ------------------------------------------------------------ acceso
  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz))?.chunk;
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_Y) return Block.Air;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.getChunk(cx, cz);
    if (!c) return Block.Air;
    return c.blocks[idx(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z)]!;
  }

  /** Devuelve true si cambió algo. Marca vecinos si el bloque toca un borde. */
  setBlock(wx: number, wy: number, wz: number, b: number): boolean {
    if (wy < 0 || wy >= CHUNK_Y) return false;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const e = this.chunks.get(chunkKey(cx, cz));
    if (!e) return false;
    const lx = wx - cx * CHUNK_X, lz = wz - cz * CHUNK_Z;
    if (!e.chunk.set(lx, wy, lz, b)) return false;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_X - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_Z - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  private markDirty(cx: number, cz: number) {
    const e = this.chunks.get(chunkKey(cx, cz));
    if (e) e.chunk.dirty = true;
  }

  /** Altura del primer bloque de aire sobre el suelo. Para aparecer al jugador. */
  columnTop(wx: number, wz: number): number {
    for (let y = CHUNK_Y - 1; y > 0; y--) if (this.getBlock(wx, y, wz) !== Block.Air) return y + 1;
    return 1;
  }

  // ------------------------------------------------------- ciclo de carga
  /**
   * @param budgetMs cuánto tiempo puede robarle este update al frame. Es el
   *   pomo que evita que cargar chunks produzca tirones: si no alcanza, el
   *   trabajo restante sigue en el frame siguiente, siempre de cerca a lejos.
   */
  update(px: number, pz: number, budgetMs: number): void {
    const cx = Math.floor(px / CHUNK_X);
    const cz = Math.floor(pz / CHUNK_Z);
    const R = this._renderDistance;
    const genR = R + 1;

    this.generatedLastFrame = 0;
    this.meshedLastFrame = 0;

    if (cx !== this.lastCx || cz !== this.lastCz || this.forceUnload) {
      this.unloadFar(cx, cz, genR + 1);
      this.trimMeshes(cx, cz, R);
      this.lastCx = cx;
      this.lastCz = cz;
      this.forceUnload = false;
    }

    const t0 = performance.now();
    for (const o of OFFSETS) {
      if (o.d2 > genR * genR) continue;
      const ccx = cx + o.dx, ccz = cz + o.dz;
      const key = chunkKey(ccx, ccz);
      let e = this.chunks.get(key);

      if (!e) {
        const chunk = new Chunk(ccx, ccz);
        generateChunk(chunk, this.seed);
        const edits = this.saved.get(key);
        if (edits) {
          chunk.blocks.set(edits);
          chunk.modified = true;
          chunk.dirty = true;
        }
        e = { chunk, opaque: null, trans: null, opaqueGeo: null, transGeo: null, meshed: false };
        this.chunks.set(key, e);
        this.generatedLastFrame++;
        if (performance.now() - t0 > budgetMs) return;
      }

      // Sólo se malla dentro del radio visible y con los 4 vecinos presentes:
      // así ningún borde de chunk se dibuja como una pared que luego desaparece.
      if (o.d2 <= R * R && e.chunk.dirty && this.hasNeighbours(ccx, ccz)) {
        this.remesh(e);
        this.meshedLastFrame++;
        if (performance.now() - t0 > budgetMs) return;
      }
    }
  }

  private hasNeighbours(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx - 1, cz)) && this.chunks.has(chunkKey(cx + 1, cz))
      && this.chunks.has(chunkKey(cx, cz - 1)) && this.chunks.has(chunkKey(cx, cz + 1));
  }

  private unloadFar(cx: number, cz: number, keepR: number) {
    for (const [key, e] of this.chunks) {
      const { cx: ex, cz: ez } = e.chunk;
      if (Math.abs(ex - cx) <= keepR && Math.abs(ez - cz) <= keepR) continue;
      // Antes de soltar la memoria: lo editado se guarda. Si no, alejarse
      // borraría lo construido.
      if (e.chunk.modified) this.persist(key, e.chunk.blocks);
      this.releaseEntry(e);
      this.chunks.delete(key);
    }
    // Reserva acotada: ~1 anillo de geometrías, el resto vuelve a la GPU.
    this.pool.trim(2 * (2 * keepR + 1));
  }

  private persist(key: string, blocks: Uint8Array) {
    const copy = blocks.slice();
    this.saved.set(key, copy);
    this.onEvict?.(key, copy);
  }

  /** Devuelve los chunks vivos con ediciones sin escribir y los marca como
   *  limpios. Quien llama se encarga de mandarlos a disco. */
  flush(): [string, Uint8Array][] {
    const out: [string, Uint8Array][] = [];
    for (const [key, e] of this.chunks) {
      if (!e.chunk.modified) continue;
      const copy = e.chunk.blocks.slice();
      this.saved.set(key, copy);
      e.chunk.modified = false;
      out.push([key, copy]);
    }
    return out;
  }

  /** Cuántos chunks tienen ediciones del jugador (vivos o ya descargados). */
  get editedCount() { return this.saved.size; }

  /** Ediciones recuperadas del disco, antes de empezar a generar. */
  restore(edits: Map<string, Uint8Array>) {
    this.saved = edits;
  }

  /**
   * Suelta las mallas de los chunks que quedaron fuera de la distancia de
   * render, conservando sus voxels. Sin esto, bajar la distancia no reduce ni
   * una draw call: la niebla tapa los chunks lejanos pero la GPU los sigue
   * dibujando, y el escalador de calidad no serviría de nada.
   */
  private trimMeshes(cx: number, cz: number, R: number) {
    const r2 = R * R;
    for (const e of this.chunks.values()) {
      if (!e.meshed) continue;
      const dx = e.chunk.cx - cx, dz = e.chunk.cz - cz;
      if (dx * dx + dz * dz <= r2) continue;
      this.releaseEntry(e);
      e.chunk.dirty = true; // se re-malla si el jugador vuelve a acercarse
    }
  }

  private releaseEntry(e: Entry) {
    if (e.opaque) { this.group.remove(e.opaque); e.opaque = null; }
    if (e.trans) { this.group.remove(e.trans); e.trans = null; }
    if (e.opaqueGeo) { this.pool.release(e.opaqueGeo); e.opaqueGeo = null; }
    if (e.transGeo) { this.pool.release(e.transGeo); e.transGeo = null; }
    e.meshed = false;
  }

  // ---------------------------------------------------------- re-mallado
  private remesh(e: Entry) {
    const { cx, cz } = e.chunk;
    buildPad(pad, e.chunk,
      this.getChunk(cx - 1, cz), this.getChunk(cx + 1, cz),
      this.getChunk(cx, cz - 1), this.getChunk(cx, cz + 1));

    for (const translucent of [false, true]) {
      const data = meshChunk(pad, translucent);
      const geoKey = translucent ? 'transGeo' : 'opaqueGeo';
      const meshKey = translucent ? 'trans' : 'opaque';

      if (data.indexCount === 0) {
        const mesh = e[meshKey];
        if (mesh) { this.group.remove(mesh); e[meshKey] = null; }
        const geo = e[geoKey];
        if (geo) { this.pool.release(geo); e[geoKey] = null; }
        continue;
      }

      let geo = e[geoKey];
      if (!geo) { geo = this.pool.acquire(); e[geoKey] = geo; }
      geo.upload(data);

      let mesh = e[meshKey];
      if (!mesh) {
        mesh = new Mesh(geo.geom, translucent ? this.transMat : this.opaqueMat);
        mesh.matrixAutoUpdate = false;
        mesh.position.set(cx * CHUNK_X, 0, cz * CHUNK_Z);
        mesh.updateMatrix();
        mesh.renderOrder = translucent ? 1 : 0;
        e[meshKey] = mesh;
        this.group.add(mesh);
      } else if (mesh.geometry !== geo.geom) {
        mesh.geometry = geo.geom;
      }
    }

    e.chunk.dirty = false;
    e.meshed = true;
  }

  // -------------------------------------------------------------- métricas
  stats() {
    let tris = 0, meshes = 0, bytes = 0;
    for (const e of this.chunks.values()) {
      for (const g of [e.opaqueGeo, e.transGeo]) {
        if (!g) continue;
        meshes++;
        bytes += g.bytes;
        tris += g.geom.drawRange.count / 3;
      }
    }
    this.triangles = tris;
    const p = this.pool.stats();
    return {
      chunks: this.chunks.size,
      meshes,
      triangles: tris,
      geometryBytes: bytes + p.reserveBytes,
      voxelBytes: this.chunks.size * CHUNK_X * CHUNK_Y * CHUNK_Z,
      poolFree: p.free,
      poolReused: p.reused,
      poolCreated: p.created,
      poolDisposed: p.disposed,
    };
  }

  dispose() {
    for (const e of this.chunks.values()) this.releaseEntry(e);
    this.chunks.clear();
    this.pool.disposeAll();
  }
}
