import * as THREE from 'three';

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

export function islandRadius(a: number): number {
  return ISLAND_R + 3 * Math.sin(3 * a) + 2 * Math.cos(5 * a + 1);
}

/** Altura del terreno (el nivel del mar es y = 0). */
export function heightAt(x: number, z: number): number {
  const a = Math.atan2(z, x), r = Math.hypot(x, z);
  const t = 1 - r / islandRadius(a);
  let h: number;
  if (t < 0) h = Math.max(HMIN, t * 10 - 0.3);
  else h = Math.pow(t, 0.6) * 2.2 - 0.3;
  const k = Math.min(1, Math.max(0, t * 3));
  h += 5 * Math.exp(-((x + 7) ** 2 + (z + 7) ** 2) / 60) * k;
  h += (fbm(x * 0.12, z * 0.12) - 0.5) * 1.2 * k;
  return h;
}

const C_WET = new THREE.Color('#bfa774');
const C_SAND = new THREE.Color('#f2dfa8');
const C_GRASS = new THREE.Color('#79c55a');
const C_GRASS2 = new THREE.Color('#4a9e50');
const C_ROCK = new THREE.Color('#8e8878');

export function buildTerrain(): THREE.Mesh {
  const seg = 256;
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
    c.lerp(C_GRASS, THREE.MathUtils.smoothstep(h, 0.85, 1.25));
    c.lerp(C_GRASS2, THREE.MathUtils.smoothstep(h, 1.6, 3.2) * 0.8 + n * 0.25);
    c.lerp(C_ROCK, THREE.MathUtils.smoothstep(1 - nor.getY(i), 0.18, 0.4) * (h > 0.6 ? 1 : 0));
    c.multiplyScalar(0.94 + n * 0.12);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
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
