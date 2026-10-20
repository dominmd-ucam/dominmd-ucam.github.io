import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE3_GLSL } from './toon';

/* Rocas estilo BotW: forma redondeada con normales suaves (en vez de caras planas) y un material que pinta
   vetas horizontales, musgo en lo que mira arriba y un borde de sombra irregular, como de pincel. Todo sale del shader: sin texturas. */

function hash(x: number, y: number, z: number) { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); }
function noise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t), fx = s(x - xi), fy = s(y - yi), fz = s(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy), l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
function fbm(x: number, y: number, z: number) { let a = 0.5, s = 0; for (let i = 0; i < 4; i++) { s += a * noise(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s; }

/**
 * Deforma una geometría a lo largo de su normal con ruido suave y la deja con normales suaves.
 * `amount` es la fracción de `size` que puede entrar o salir. Funde antes los vértices repetidos para no abrir grietas.
 */
export function roughen(g: THREE.BufferGeometry, size: number, amount: number, seed = 0): THREE.BufferGeometry {
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  const p = m.attributes.position as THREE.BufferAttribute, n = m.attributes.normal as THREE.BufferAttribute, f = 1.3 / size;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = ((fbm(x * f + seed, y * f, z * f) - 0.5) * amount + (noise(x * f * 3.5 + seed, y * f * 3.5, z * f * 3.5) - 0.5) * amount * 0.15) * size;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  m.computeVertexNormals();
  return m;
}

/** Roca redondeada de radio `r`, achatada en vertical por `sy`, con la base plana para que asiente en el suelo. */
export function stoneGeometry(r: number, seed: number, sy = 1, detail = 3): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-4), p = m.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (fbm(x * 1.3 + seed, y * 1.3, z * 1.3) - 0.5) * 0.7 + (noise(x * 4 + seed, y * 4, z * 4) - 0.5) * 0.08;
    let py = y * k;
    if (py < -0.45) py = -0.45 - (py + 0.45) * 0.15;     // base casi plana
    if (py > 0.7) py = 0.7 + (py - 0.7) * 0.55;          // cima algo aplanada, donde agarra el musgo
    p.setXYZ(i, x * k * r, py * r * sy, z * k * r);
  }
  m.computeVertexNormals();
  return m;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Material de roca compartido por color (las rocas iguales se siguen fusionando en una sola malla).
 * `moss` es la cantidad de musgo: 0 sin musgo, 1 normal.
 */
export function stoneMaterial(color: string, moss = 1, mossColor = '#6aa63f'): THREE.MeshStandardMaterial {
  const key = `${color}|${moss}|${mossColor}`;
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const uMoss = { value: new THREE.Color(mossColor) }, uMossAmt = { value: moss };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMoss = uMoss; sh.uniforms.uMossAmt = uMossAmt;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStoneW;\nvarying vec3 vStoneN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vStoneW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vStoneN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vStoneW;\nvarying vec3 vStoneN;\nuniform vec3 uMoss;\nuniform float uMossAmt;\n${NOISE3_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // vetas horizontales, deformadas para que no parezcan regla
        diffuseColor.rgb *= 0.9 + 0.1 * step(0.5, fract(vStoneW.y * 1.5 + fbm3(vStoneW * 0.7) * 1.6));
        // musgo en las caras que miran arriba, con borde irregular
        float moss = smoothstep(0.52, 0.64, normalize(vStoneN).y + (fbm3(vStoneW * 1.3) - 0.5) * 0.7) * uMossAmt;
        diffuseColor.rgb = mix(diffuseColor.rgb, uMoss * (0.88 + 0.24 * n3(vStoneW * 4.0)), moss);
        // borde de la sombra como una pincelada (ver toonEdge en toon.ts)
        toonEdge = (fbm3(vStoneW * 1.6) - 0.5) * 0.5;`);
  };
  cache.set(key, m);
  return m;
}
