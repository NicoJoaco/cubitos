/**
 * Jugador: AABB contra la rejilla de voxels, resuelto eje por eje.
 *
 * Dos concesiones deliberadas a un niño de 4 años:
 *  - escalón automático de 1 bloque, para que caminar contra una loma no
 *    requiera aprender a saltar;
 *  - flotación en el agua, para que caerse al lago no termine en "estoy
 *    atrapado en el fondo".
 */
import { Vector3 } from 'three';
import { Block, IS_SOLID } from '../world/blocks.ts';

export const PLAYER_HALF_W = 0.3;
export const PLAYER_HEIGHT = 1.7;
export const EYE_HEIGHT = 1.55;

const SPEED = 4.4;
const GRAVITY = 26;
const JUMP_V = 8.2;
const MAX_FALL = 42;
const WATER_DRAG = 0.35;
const SWIM_UP = 3.4;
const STEP_HEIGHT = 1.05;
const PITCH_LIMIT = Math.PI / 2 - 0.02;

export interface PlayerInput {
  moveX: number;
  moveY: number;
  lookDX: number;
  lookDY: number;
  jump: boolean;
}

type GetBlock = (x: number, y: number, z: number) => number;

export class Player {
  readonly pos = new Vector3(0, 0, 0); // centro de los pies
  readonly vel = new Vector3(0, 0, 0);
  yaw = 0;
  pitch = 0;
  onGround = false;
  inWater = false;

  eye(out = new Vector3()): Vector3 {
    return out.set(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
  }

  /** Dirección de la mirada, normalizada. */
  forward(out = new Vector3()): Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  private hits(get: GetBlock, x = this.pos.x, y = this.pos.y, z = this.pos.z): boolean {
    const x0 = Math.floor(x - PLAYER_HALF_W), x1 = Math.floor(x + PLAYER_HALF_W);
    const y0 = Math.floor(y), y1 = Math.floor(y + PLAYER_HEIGHT - 1e-4);
    const z0 = Math.floor(z - PLAYER_HALF_W), z1 = Math.floor(z + PLAYER_HALF_W);
    for (let yy = y0; yy <= y1; yy++) {
      for (let zz = z0; zz <= z1; zz++) {
        for (let xx = x0; xx <= x1; xx++) {
          if (IS_SOLID[get(xx, yy, zz)] === 1) return true;
        }
      }
    }
    return false;
  }

  private submerged(get: GetBlock): boolean {
    return get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.6), Math.floor(this.pos.z)) === Block.Water;
  }

  update(dt: number, get: GetBlock, input: PlayerInput): void {
    this.yaw += input.lookDX;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + input.lookDY));

    this.inWater = this.submerged(get);

    // --- velocidad horizontal, relativa a hacia dónde mira
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = input.moveX, mz = input.moveY;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const speed = SPEED * (this.inWater ? 0.6 : 1);
    // Base del movimiento, derivada de hacia donde mira la camara:
    //   adelante = (-sin yaw, -cos yaw)      derecha = (cos yaw, -sin yaw)
    //   v = mz * adelante + mx * derecha
    // El signo de Z es facil de equivocar y no lo delata la distancia
    // recorrida, solo la direccion: por eso lo cubre test-world.mjs.
    this.vel.x = (mx * cos - mz * sin) * speed;
    this.vel.z = -(mx * sin + mz * cos) * speed;

    // --- vertical
    if (this.inWater) {
      this.vel.y += -GRAVITY * WATER_DRAG * dt;
      if (input.jump) this.vel.y = SWIM_UP;
      this.vel.y = Math.max(this.vel.y, -4);
    } else {
      if (input.jump && this.onGround) this.vel.y = JUMP_V;
      this.vel.y -= GRAVITY * dt;
      this.vel.y = Math.max(this.vel.y, -MAX_FALL);
    }

    this.moveHorizontal(get, this.vel.x * dt, 0);
    this.moveHorizontal(get, 0, this.vel.z * dt);
    this.moveVertical(get, this.vel.y * dt);
  }

  private moveHorizontal(get: GetBlock, dx: number, dz: number) {
    if (dx === 0 && dz === 0) return;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += dx;
    this.pos.z += dz;
    if (!this.hits(get)) return;

    // Escalón automático: sólo con los pies en el suelo y sólo 1 bloque.
    if (this.onGround) {
      const oy = this.pos.y;
      this.pos.y += STEP_HEIGHT;
      if (!this.hits(get)) return;
      this.pos.y = oy;
    }

    this.pos.x = ox;
    this.pos.z = oz;
    if (dx !== 0) this.vel.x = 0;
    if (dz !== 0) this.vel.z = 0;
  }

  private moveVertical(get: GetBlock, dy: number) {
    if (dy === 0) return;
    const oy = this.pos.y;
    this.pos.y += dy;
    if (!this.hits(get)) {
      // En cuanto el movimiento vertical prospera, sea hacia arriba o hacia
      // abajo, ya no hay suelo bajo los pies. Si sólo se limpiara al caer, un
      // salto mantenido reaplicaría el impulso en cada frame y el jugador
      // saldría disparado.
      this.onGround = false;
      return;
    }
    if (dy < 0) {
      // Aterrizaje pegado al techo del bloque: sin esto el jugador flota una
      // fracción variable según el frametime y el suelo "vibra".
      this.pos.y = Math.floor(this.pos.y) + 1;
      if (this.hits(get)) this.pos.y = oy;
      this.onGround = true;
    } else {
      this.pos.y = oy;
    }
    this.vel.y = 0;
  }

  /** ¿El bloque (x,y,z) chocaría con el jugador? Impide construir encima suyo. */
  overlapsBlock(x: number, y: number, z: number): boolean {
    return this.pos.x + PLAYER_HALF_W > x && this.pos.x - PLAYER_HALF_W < x + 1
      && this.pos.y + PLAYER_HEIGHT > y && this.pos.y < y + 1
      && this.pos.z + PLAYER_HALF_W > z && this.pos.z - PLAYER_HALF_W < z + 1;
  }
}
