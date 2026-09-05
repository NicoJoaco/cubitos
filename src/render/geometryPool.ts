/**
 * Pool de BufferGeometry. Descargar un chunk NO libera su geometría: vuelve al
 * pool con sus buffers ya dimensionados y el siguiente chunk los reescribe.
 * Sin esto, caminar por el mundo genera decenas de geometrías por segundo y el
 * GC del móvil produce tirones perfectamente visibles.
 *
 * El dispose es explícito (`trim`/`disposeAll`): nada queda librado al GC.
 */
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import type { MeshData } from '../world/mesher.ts';

const nextCap = (n: number) => Math.max(256, 1 << (32 - Math.clz32(Math.max(1, n - 1))));

export class PooledGeometry {
  geom = new BufferGeometry();
  private capVerts = 0;
  private capIndices = 0;
  private pos!: BufferAttribute;
  private uv!: BufferAttribute;
  private layer!: BufferAttribute;
  private shade!: BufferAttribute;
  private index!: BufferAttribute;
  /** Bytes de GPU reservados por esta geometría. */
  bytes = 0;

  private allocate(verts: number, indices: number) {
    // Al crecer se tira la geometría anterior de forma explícita: three borra
    // los buffers de WebGL en dispose(), no cuando el GC recoge el objeto.
    this.geom.dispose();
    this.capVerts = nextCap(verts);
    this.capIndices = nextCap(indices);
    this.pos = new BufferAttribute(new Float32Array(this.capVerts * 3), 3);
    this.uv = new BufferAttribute(new Float32Array(this.capVerts * 2), 2);
    this.layer = new BufferAttribute(new Uint8Array(this.capVerts), 1);
    this.shade = new BufferAttribute(new Uint8Array(this.capVerts), 1, true);
    this.index = new BufferAttribute(new Uint16Array(this.capIndices), 1);
    this.geom.setAttribute('position', this.pos);
    this.geom.setAttribute('uv', this.uv);
    this.geom.setAttribute('layer', this.layer);
    this.geom.setAttribute('shade', this.shade);
    this.geom.setIndex(this.index);
    this.bytes = this.capVerts * (12 + 8 + 1 + 1) + this.capIndices * 2;
  }

  upload(data: MeshData) {
    if (data.vertCount > this.capVerts || data.indexCount > this.capIndices) {
      this.allocate(data.vertCount, data.indexCount);
    }
    (this.pos.array as Float32Array).set(data.positions);
    (this.uv.array as Float32Array).set(data.uvs);
    (this.layer.array as Uint8Array).set(data.layers);
    (this.shade.array as Uint8Array).set(data.shades);
    (this.index.array as Uint16Array).set(data.indices);
    this.pos.needsUpdate = true;
    this.uv.needsUpdate = true;
    this.layer.needsUpdate = true;
    this.shade.needsUpdate = true;
    this.index.needsUpdate = true;
    this.geom.setDrawRange(0, data.indexCount);
    this.setBounds(data);
  }

  /** Esfera ajustada a los datos reales: culling de frustum mucho más eficaz
   *  que usar el chunk entero (16x64x16 => esfera de radio 34). */
  private setBounds(data: MeshData) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const p = data.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX)) { minX = minY = minZ = 0; maxX = maxY = maxZ = 0; }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const r = Math.hypot(maxX - cx, maxY - cy, maxZ - cz);
    this.geom.boundingSphere = new Sphere(new Vector3(cx, cy, cz), r || 0.001);
  }

  dispose() {
    this.geom.dispose();
    this.capVerts = 0;
    this.capIndices = 0;
    this.bytes = 0;
  }
}

export class GeometryPool {
  private free: PooledGeometry[] = [];
  private live = 0;
  /** Contadores para el reporte: cuántas geometrías se reutilizaron y cuántas
   *  hubo que crear de cero. La proporción es la razón de ser del pool. */
  reused = 0;
  created = 0;
  disposed = 0;

  acquire(): PooledGeometry {
    this.live++;
    const g = this.free.pop();
    if (g) { this.reused++; return g; }
    this.created++;
    return new PooledGeometry();
  }

  release(g: PooledGeometry) {
    this.live--;
    g.geom.setDrawRange(0, 0);
    this.free.push(g);
  }

  /** Deja como máximo `keep` geometrías en reserva; el resto se libera de la GPU. */
  trim(keep: number) {
    while (this.free.length > keep) { this.free.pop()!.dispose(); this.disposed++; }
  }

  disposeAll() {
    for (const g of this.free) g.dispose();
    this.free.length = 0;
  }

  stats() {
    let bytes = 0;
    for (const g of this.free) bytes += g.bytes;
    return {
      free: this.free.length, live: this.live, reserveBytes: bytes,
      reused: this.reused, created: this.created, disposed: this.disposed,
    };
  }
}
