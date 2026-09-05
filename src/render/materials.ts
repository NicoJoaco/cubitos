/**
 * Material de voxels: un único ShaderMaterial para todos los chunks, con
 * sampler2DArray. Una sola textura ligada y un solo programa => el cambio de
 * estado entre chunks es casi nulo y las draw calls quedan baratas.
 */
import {
  Color, DataArrayTexture, DoubleSide, FrontSide, GLSL3, ShaderMaterial, Vector3,
} from 'three';
import { SKY_INT } from '../theme.ts';

const VERT = /* glsl */ `
in float layer;
in float shade;

out vec2 vUv;
out float vLayer;
out float vShade;
out float vFogDepth;

void main() {
  vUv = uv;
  vLayer = layer;
  vShade = shade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision mediump float;
precision mediump sampler2DArray;

uniform sampler2DArray uMap;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSunDir;

in vec2 vUv;
in float vLayer;
in float vShade;
in float vFogDepth;

out vec4 fragColor;

void main() {
  vec4 texel = texture(uMap, vec3(vUv, vLayer));
  if (texel.a < 0.04) discard;

  vec3 color = texel.rgb * vShade;

  // Niebla lineal del color del cielo: oculta el borde del mundo y es lo que
  // permite bajar la distancia de render sin que se note un corte duro.
  float f = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  color = mix(color, uFogColor, f);

  fragColor = vec4(color, texel.a);
}
`;

export interface VoxelMaterial extends ShaderMaterial {
  setFog(near: number, far: number): void;
}

export function createVoxelMaterial(map: DataArrayTexture, translucent: boolean): VoxelMaterial {
  const mat = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uMap: { value: map },
      // El color de niebla ES el del cielo: el horizonte no tiene costura.
      uFogColor: { value: new Color(SKY_INT) },
      uFogNear: { value: 20 },
      uFogFar: { value: 56 },
      uSunDir: { value: new Vector3(0.4, 1, 0.25).normalize() },
    },
    transparent: translucent,
    depthWrite: !translucent,
    // El agua se ve desde arriba y desde abajo; lo opaco nunca desde dentro.
    side: translucent ? DoubleSide : FrontSide,
  }) as VoxelMaterial;

  mat.setFog = (near: number, far: number) => {
    mat.uniforms.uFogNear!.value = near;
    mat.uniforms.uFogFar!.value = far;
  };
  return mat;
}
