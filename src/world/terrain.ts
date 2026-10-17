import * as THREE from 'three';
import projects from '../data/projects.json';

export const WORLD_SIZE = 128;
const ISLAND_R = 26;
const HMIN = -4;
const HMAX = 4;

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number): number {
  let amp = 0.5, f = 1, s = 0;
  for (let i = 0; i < 4; i++) { s += vnoise(x * f, y * f) * amp; f *= 2; amp *= 0.5; }
  return s;
}

const BAY_A = 1.75;   // cala al sur
const HEAD_A = -2.35; // promontorio rocoso con el faro
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function islandRadius(a: number): number {
  let r = ISLAND_R + 3 * Math.sin(3 * a) + 2 * Math.cos(5 * a + 1);
  r -= 11 * Math.exp(-((angDiff(a, BAY_A) / 0.34) ** 2));
  r += 4 * Math.exp(-((angDiff(a, HEAD_A) / 0.5) ** 2));
  return r;
}

/** Colina del faro. */
export const HILL: [number, number] = [-9, -9];
/** Islote cercano, alcanzable a nado. */
export const ISLET: [number, number] = [-33, 20];

/** Caminos de arena: polilíneas entre el punto de inicio, las estaciones y el faro. */
const PATHS: [number, number][][] = [
  [[6, 13], [8, 9], [4, 4], [0, 0]],   // desde el punto de inicio
  [[0, 0], [-7, -6]],                  // hacia el faro
  ...(projects as unknown as { position: [number, number] }[]).map((p) => [[0, 0], p.position] as [number, number][]), // un camino por proyecto
];
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
/** 1 sobre el camino, 0 fuera (con borde suave). */
export function pathMask(x: number, z: number): number {
  let d = 99;
  for (const poly of PATHS) for (let i = 0; i < poly.length - 1; i++) d = Math.min(d, segDist(x, z, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]));
  return 1 - THREE.MathUtils.smoothstep(d, 0.45, 1.15);
}

/** Muelle: sale de la costa en el ángulo DOCK.a y se adentra DOCK.len metros. */
export const DOCK = { a: -0.9, len: 11, width: 1.7, y: 0.55 };
export function dockStart() { return islandRadius(DOCK.a) - 2.2; }
export function onDock(x: number, z: number): boolean {
  const c = Math.cos(DOCK.a), s = Math.sin(DOCK.a);
  const u = x * c + z * s - dockStart(), v = -x * s + z * c;
  return u >= 0 && u <= DOCK.len && Math.abs(v) <= DOCK.width / 2;
}

/** Altura del terreno (el nivel del mar es y = 0). */
export function heightAt(x: number, z: number): number {
  const a = Math.atan2(z, x), r = Math.hypot(x, z);
  const t = 1 - r / islandRadius(a);
  let h: number;
  if (t < 0) h = Math.max(HMIN, t * 10 - 0.3);
  else h = Math.pow(t, 0.4) * 2.4 - 0.3;
  const k = Math.min(1, Math.max(0, t * 3));
  // colina rocosa del faro (con meseta arriba)
  const hd = ((x - HILL[0]) ** 2 + (z - HILL[1]) ** 2);
  h += 7.2 * Math.exp(-hd / 44) * k;
  h += (fbm(x * 0.12, z * 0.12) - 0.5) * 1.2 * k;
  // islote de arena
  const isd = (x - ISLET[0]) ** 2 + (z - ISLET[1]) ** 2;
  h = Math.max(h, 1.7 * Math.exp(-isd / 22) - 0.5);
  return h;
}

const C_WET = new THREE.Color('#cfae72');
const C_SAND = new THREE.Color('#f1d28b');
const C_GRASS = new THREE.Color('#86d14c');
const C_GRASS_Y = new THREE.Color('#b9dc5a');
const C_GRASS2 = new THREE.Color('#58b448');
const C_ROCK = new THREE.Color('#b98260');
const C_PATH = new THREE.Color('#dfb98a');

export function buildTerrain(): THREE.Mesh {
  const seg = 200;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
    const n = fbm(x * 0.5, z * 0.5);
    c.copy(C_WET).lerp(C_SAND, THREE.MathUtils.smoothstep(h, -0.4, 0.35));
    const patch = fbm(x * 0.07 + 11.3, z * 0.07 - 4.1); // manchas grandes de hierba más amarilla
    c.lerp(C_GRASS.clone().lerp(C_GRASS_Y, THREE.MathUtils.smoothstep(patch, 0.45, 0.65)), THREE.MathUtils.smoothstep(h, 0.85, 1.25));
    c.lerp(C_GRASS2, THREE.MathUtils.smoothstep(h, 1.6, 3.2) * 0.8 + n * 0.25);
    c.lerp(C_ROCK, Math.max(THREE.MathUtils.smoothstep(1 - nor.getY(i), 0.3, 0.5) * (h > 0.6 ? 1 : 0), THREE.MathUtils.smoothstep(h, 5.2, 7.2) * 0.8));
    c.lerp(C_PATH, pathMask(x, z) * THREE.MathUtils.smoothstep(h, 0.6, 1.1) * 0.9);
    c.multiplyScalar(0.94 + n * 0.12);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float under = smoothstep(0.15, -0.3, vWPos.y) * (1.0 - smoothstep(-0.7, -2.6, vWPos.y));
        float ca = sin(vWPos.x * 1.9 + uTime * 1.1) + sin(vWPos.z * 2.1 - uTime * 0.9) + sin((vWPos.x + vWPos.z) * 1.3 + uTime * 0.7);
        diffuseColor.rgb += vec3(0.45, 0.8, 0.75) * pow(1.0 - abs(ca) / 3.0, 6.0) * under * 0.3;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.uTime = uTime;
  return mesh;
}

/** Mapa de alturas de 8 bits para que el shader del agua pinte espuma y profundidad. */
export function buildHeightTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1) - 0.5) * WORLD_SIZE;
      const z = (j / (size - 1) - 0.5) * WORLD_SIZE;
      const n = (THREE.MathUtils.clamp(heightAt(x, z), HMIN, HMAX) - HMIN) / (HMAX - HMIN);
      data[j * size + i] = Math.round(n * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
export const HEIGHT_RANGE: [number, number] = [HMIN, HMAX];
