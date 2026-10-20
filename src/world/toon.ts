import * as THREE from 'three';

/**
 * Sombreado "cel" inspirado en Breath of the Wild, aplicado a todos los MeshStandardMaterial a la vez.
 * No hace falta cambiar ningún material: se reescribe el trozo de shader de la luz directa de three.
 *  - la luz del sol pasa de gradiente continuo a dos tonos con un borde suave (conserva algo de gradiente para que no quede plano);
 *  - luz de borde cálida en las siluetas que miran al sol (el brillo lateral típico de BotW);
 *  - el relleno del cielo (luz hemisférica) se queda como está: es lo que tiñe de azul el lado en sombra.
 * Un material puede quitarse la luz de borde con `defines: { TOON_NO_RIM: '' }` (terreno y hierba: vistos de lado se iluminaría todo el suelo).
 * Debe llamarse antes de compilar el primer material.
 */
export function installToon() {
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  const from = 'vec3 irradiance = dotNL * directLight.color;';
  if (!chunk.includes(from)) { console.warn('toon: el shader de three ha cambiado, se usa el sombreado normal'); return; }
  THREE.ShaderChunk.lights_physical_pars_fragment = chunk.replace(from, `
    // dos tonos: casi todo lo iluminado recibe la misma luz y el paso a la sombra es corto
    float toonNL = smoothstep(0.0, 0.08, dotNL) * (0.5 + 0.5 * dotNL);
    vec3 irradiance = toonNL * directLight.color;
    #ifndef TOON_NO_RIM
      float rimV = 1.0 - saturate(dot(geometryNormal, geometryViewDir));
      float rim = smoothstep(0.55, 0.65, rimV) * smoothstep(-0.2, 0.25, dot(geometryNormal, directLight.direction));
      reflectedLight.directDiffuse += directLight.color * material.diffuseColor * rim * 0.7;
    #endif`);
}

/**
 * Sombras de nubes que se deslizan sobre la isla (ruido de valor en 2 octavas). Devuelve 0 al sol y 1 bajo una nube.
 * La comparten el terreno (por píxel) y la hierba (por hoja, en el vertex shader) para que coincidan.
 */
export const CLOUD_GLSL = /* glsl */ `
float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cloudNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), u.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + 1.0), u.x), u.y);
}
float cloudShadow(vec2 xz, float t) {
  vec2 q = xz * 0.045 + vec2(t * 0.022, t * 0.011);
  float n = cloudNoise(q) * 0.65 + cloudNoise(q * 2.3 + 5.1) * 0.35;
  return smoothstep(0.56, 0.66, n);
}`;
