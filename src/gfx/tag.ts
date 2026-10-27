import type * as THREE from 'three';

/** Uniforme compartido con el shader: el mismo objeto `{ value }` sirve para WebGL (onBeforeCompile) y para WebGPU (TSL). */
export type U<T = unknown> = { value: T };

/**
 * Datos que necesita la versión TSL (WebGPU) de un material con shader propio.
 * WebGPU ignora `onBeforeCompile`, `ShaderChunk` y `ShaderMaterial`: cada material con GLSL propio lleva esta etiqueta
 * y `gfx/tsl.ts` reconstruye el mismo efecto con nodos. El motor WebGL no la usa.
 * Va como propiedad del material (no en userData) porque three copia las propiedades al convertirlo en NodeMaterial.
 */
export interface TslTag {
  kind: 'grass' | 'terrain' | 'stone' | 'foliage' | 'flock' | 'fish' | 'vines' | 'water' | 'sky';
  u: Record<string, U>;
  /** constantes de cada variante (amplitud del viento, tinte…) */
  k?: Record<string, number | boolean>;
}

export function tagTsl(m: THREE.Material, kind: TslTag['kind'], u: TslTag['u'] = {}, k?: TslTag['k']) {
  (m as THREE.Material & { tsl?: TslTag }).tsl = { kind, u, k };
}

export function getTsl(m: unknown): TslTag | undefined {
  return (m as { tsl?: TslTag }).tsl;
}
