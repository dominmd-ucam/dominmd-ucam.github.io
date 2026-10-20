import * as THREE from 'three';
import { Delaunay } from 'd3-delaunay';
import { CLOUD_GLSL } from './toon';

export const WORLD_SIZE = 176;
export const ISLAND_R = 38;
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
export const ISLET: [number, number] = [-48, 29];

/** Punto a una fracción `f` del radio de la costa en el ángulo `a`. */
export function polar(a: number, f: number): [number, number] {
  const r = islandRadius(a) * f;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/* ---------- biomas ----------
   El centro (pueblo, faro, punto de inicio) es pradera abierta. Alrededor, por sectores:
   bosque (al este), bosque retorcido (junto a la cueva, al suroeste), zona seca (oeste), pinar (en el promontorio del faro)
   y un prado de flores (norte, junto al muelle). La cala del sur se queda en playa. */
export type Biome = 'forest' | 'mystic' | 'dry' | 'pine' | 'meadow';
export const BIOMES: { name: Biome; a: number; w: number }[] = [
  { name: 'forest', a: 0.7, w: 0.62 },
  { name: 'mystic', a: 2.5, w: 0.45 },
  { name: 'dry', a: 3.33, w: 0.38 },
  { name: 'pine', a: -2.3, w: 0.55 },
  { name: 'meadow', a: -0.85, w: 0.75 },
];
/** Peso de cada bioma en un punto (0–1; fuera del centro suman ~1). El borde entre sectores se deforma con ruido para que no sea recto. */
export function biomeWeights(x: number, z: number, out: Record<Biome, number>): Record<Biome, number> {
  const a = Math.atan2(z, x) + (fbm(x * 0.06 + 3.1, z * 0.06 - 7.7) - 0.5) * 0.6;
  const f = Math.hypot(x, z) / islandRadius(Math.atan2(z, x));
  const inland = THREE.MathUtils.smoothstep(f, 0.4, 0.52);
  for (const b of BIOMES) out[b.name] = (1 - THREE.MathUtils.smoothstep(Math.abs(angDiff(a, b.a)), b.w - 0.12, b.w + 0.12)) * inland;
  return out;
}

/** Claros rodeados de árboles (centro y radio). Los caminos entran por los huecos. */
export const CLEARINGS: { x: number; z: number; r: number; biome: Biome }[] = [
  { ...xz(polar(0.72, 0.62)), r: 6, biome: 'forest' },
  { ...xz(polar(2.55, 0.6)), r: 5.5, biome: 'mystic' },
  { ...xz(polar(-2.05, 0.64)), r: 4.5, biome: 'pine' },
];
function xz(p: [number, number]) { return { x: p[0], z: p[1] }; }

/** Caminos: polilíneas. Los de piedra se empiedran con las losas del MegaKit; debajo, la tierra se pinta de color camino. */
const RING = 0.62;
const ring: [number, number][] = [];
for (let a = -Math.PI; a <= Math.PI + 1e-6; a += 0.16) ring.push(polar(a, RING));
const PATHS: [number, number][][] = [
  [[6, 13], [8, 9], [4, 4], [0, 0]],          // desde el punto de inicio a la plaza
  [[0, 0], [-7, -6]],                         // al faro
  ring,                                       // la vuelta a la isla, que pasa por los claros
  [[0, 0], polar(0.72, 0.35), polar(0.72, RING)],   // plaza → claro del bosque
  [[0, 0], polar(2.5, 0.35), polar(2.55, RING)],    // plaza → bosque retorcido
  [[0, 0], polar(-0.85, 0.35), polar(-0.85, RING), polar(-0.9, 0.86)], // plaza → prado → muelle
];
export const STONE_PATHS = PATHS;
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
/** Distancia al camino más cercano. */
export function pathDist(x: number, z: number): number {
  let d = 99;
  for (const poly of PATHS) for (let i = 0; i < poly.length - 1; i++) d = Math.min(d, segDist(x, z, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]));
  return d;
}
/** 1 sobre el camino, 0 fuera (con borde suave). */
export function pathMask(x: number, z: number): number {
  return 1 - THREE.MathUtils.smoothstep(pathDist(x, z), 0.45, 1.15);
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
  else h = Math.pow(t, 0.33) * 2.6 - 0.3; // la isla creció: playa más estrecha y más prado
  const k = Math.min(1, Math.max(0, t * 3));
  // colina rocosa del faro (con meseta arriba)
  const hd = ((x - HILL[0]) ** 2 + (z - HILL[1]) ** 2);
  h += 7.2 * Math.exp(-hd / 44) * k;
  h += (fbm(x * 0.12, z * 0.12) - 0.5) * 1.2 * k;
  // islote de arena
  const isd = (x - ISLET[0]) ** 2 + (z - ISLET[1]) ** 2;
  // el islote solo levanta su entorno (con un pequeño arrecife alrededor): si el max se aplicara en todo el mapa, el mar entero tendría el fondo en −0,5 m
  const isW = 1 - THREE.MathUtils.smoothstep(isd, 25, 110);
  h += (Math.max(h, 1.7 * Math.exp(-isd / 22) - 0.5) - h) * isW;
  return h;
}

const C_WET = new THREE.Color('#cfae72');
const C_SAND = new THREE.Color('#f1d28b');
const C_GRASS = new THREE.Color('#86d14c');
const C_GRASS_Y = new THREE.Color('#b9dc5a');
const C_GRASS2 = new THREE.Color('#58b448');
const C_ROCK = new THREE.Color('#b98260');
const C_PATH = new THREE.Color('#b99a6e');

/**
 * Color del suelo en un punto (`ny` = componente vertical de la normal). Lo usa el terreno por vértice
 * y la hierba para que cada hoja tenga el color del suelo donde crece y se funda con él (como en BotW).
 */
export function groundColor(x: number, z: number, h: number, ny: number, c: THREE.Color): THREE.Color {
  const n = fbm(x * 0.5, z * 0.5);
  c.copy(C_WET).lerp(C_SAND, THREE.MathUtils.smoothstep(h, -0.4, 0.35));
  const patch = fbm(x * 0.07 + 11.3, z * 0.07 - 4.1); // manchas grandes de hierba más amarilla
  c.lerp(tmpC.copy(C_GRASS).lerp(C_GRASS_Y, THREE.MathUtils.smoothstep(patch, 0.45, 0.65)), THREE.MathUtils.smoothstep(h, 0.85, 1.25));
  c.lerp(C_GRASS2, THREE.MathUtils.smoothstep(h, 1.6, 3.2) * 0.8 + n * 0.25);
  c.lerp(C_ROCK, Math.max(THREE.MathUtils.smoothstep(1 - ny, 0.3, 0.5) * (h > 0.6 ? 1 : 0), THREE.MathUtils.smoothstep(h, 5.2, 7.2) * 0.8));
  // tinte de cada bioma sobre la hierba
  const land = THREE.MathUtils.smoothstep(h, 0.9, 1.4);
  biomeWeights(x, z, bw);
  c.lerp(C_FOREST, bw.forest * 0.55 * land).lerp(C_MYSTIC, bw.mystic * 0.6 * land).lerp(C_DRY, bw.dry * 0.65 * land)
    .lerp(C_PINE, bw.pine * 0.5 * land).lerp(C_MEADOW, bw.meadow * 0.35 * land);
  c.lerp(C_PATH, pathMask(x, z) * THREE.MathUtils.smoothstep(h, 0.6, 1.1) * 0.9);
  return c.multiplyScalar(0.94 + n * 0.12);
}
const tmpC = new THREE.Color();
const bw = {} as Record<Biome, number>;
const C_FOREST = new THREE.Color('#4f9a3a');
const C_MYSTIC = new THREE.Color('#3f9c78');
const C_DRY = new THREE.Color('#c9b061');
const C_PINE = new THREE.Color('#477f3a');
const C_MEADOW = new THREE.Color('#a8dc4e');

/**
 * Cuánto detalle necesita cada punto del mapa (0 = llano y sin interés, 1 = máximo).
 * Los triángulos deben ir donde hacen falta: costa y orilla, pendientes, la transición arena→hierba y los caminos
 * (el color de los caminos se pinta por vértice). El fondo marino llano y lejano casi no necesita ninguno.
 */
function importance(x: number, z: number): number {
  const h = heightAt(x, z), e = 0.8;
  const slope = Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  const shore = 1 - THREE.MathUtils.smoothstep(Math.abs(h), 0.15, 1.3);          // orilla: espuma, arena mojada
  const grassLine = 1 - THREE.MathUtils.smoothstep(Math.abs(h - 1.05), 0.15, 0.5); // paso de arena a hierba
  const path = THREE.MathUtils.smoothstep(pathMask(x, z), 0.02, 0.3);
  const land = h > 0.5 ? 0.18 : 0; // el interior de la isla tiene algo de detalle para el relieve suave
  return Math.min(1, Math.max(shore, grassLine, path, Math.min(1, slope * 3), land));
}
const R_MIN = 0.7, R_MAX = 8.5;

/** Reparto de puntos "como una multitud": cada uno guarda su distancia según la importancia del lugar (disco de Poisson variable). */
function samplePoints(): [number, number][] {
  const half = WORLD_SIZE / 2;
  let seed = 90210;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const cand: { x: number; z: number; r: number }[] = [];
  const step = 0.6;
  for (let gz = -half + step; gz < half - step; gz += step) {
    for (let gx = -half + step; gx < half - step; gx += step) {
      const x = gx + (rnd() - 0.5) * step, z = gz + (rnd() - 0.5) * step;
      cand.push({ x, z, r: THREE.MathUtils.lerp(R_MAX, R_MIN, importance(x, z)) });
    }
  }
  cand.sort((a, b) => a.r - b.r); // primero las zonas de más detalle
  const cell = R_MIN, cols = Math.ceil(WORLD_SIZE / cell) + 1;
  const grid = new Map<number, { x: number; z: number; r: number }[]>();
  const key = (cx: number, cz: number) => cz * cols + cx;
  const pts: [number, number][] = [];
  for (const c of cand) {
    const cx = Math.floor((c.x + half) / cell), cz = Math.floor((c.z + half) / cell), reach = Math.ceil(c.r / cell);
    let ok = true;
    for (let dz = -reach; dz <= reach && ok; dz++) {
      for (let dx = -reach; dx <= reach && ok; dx++) {
        const list = grid.get(key(cx + dx, cz + dz));
        if (!list) continue;
        for (const o of list) if (Math.hypot(o.x - c.x, o.z - c.z) < (c.r + o.r) / 2) { ok = false; break; } // transición gradual entre zonas densas y dispersas
      }
    }
    if (!ok) continue;
    const k = key(cx, cz);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(c);
    pts.push([c.x, c.z]);
  }
  return pts;
}

/** Malla del terreno: Delaunay (los triángulos más "gordos" posibles) sobre puntos de densidad variable, con relajación de Lloyd. */
function terrainGeometry(): THREE.BufferGeometry {
  const half = WORLD_SIZE / 2;
  const fixed: [number, number][] = [];
  for (let t = -half; t <= half; t += 6.4) { fixed.push([t, -half], [t, half], [-half, t], [half, t]); }
  const interior = samplePoints();
  const pts = [...fixed, ...interior];
  const nFixed = fixed.length;
  // relajación de Lloyd suave: separa cada punto de sus vecinos sin borrar el gradiente de densidad
  for (let it = 0; it < 2; it++) {
    const vor = Delaunay.from(pts).voronoi([-half, -half, half, half]);
    for (let i = nFixed; i < pts.length; i++) {
      const poly = vor.cellPolygon(i);
      if (!poly) continue;
      let cx = 0, cz = 0, a = 0;
      for (let k = 0; k < poly.length - 1; k++) {
        const [x0, z0] = poly[k], [x1, z1] = poly[k + 1], cr = x0 * z1 - x1 * z0;
        a += cr; cx += (x0 + x1) * cr; cz += (z0 + z1) * cr;
      }
      if (Math.abs(a) < 1e-6) continue;
      const mx = cx / (3 * a), mz = cz / (3 * a);
      pts[i] = [pts[i][0] + (mx - pts[i][0]) * 0.45, pts[i][1] + (mz - pts[i][1]) * 0.45];
    }
  }
  const tri = Delaunay.from(pts).triangles;
  const position = new Float32Array(pts.length * 3);
  pts.forEach(([x, z], i) => { position[i * 3] = x; position[i * 3 + 1] = heightAt(x, z); position[i * 3 + 2] = z; });
  const index = new Uint32Array(tri.length);
  for (let i = 0; i < tri.length; i += 3) {
    const a = tri[i], b = tri[i + 1], c = tri[i + 2];
    // orientación hacia arriba (+Y): si el triángulo sale al revés, se invierte
    const cross = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
    if (cross > 0) { index[i] = a; index[i + 1] = c; index[i + 2] = b; } else { index[i] = a; index[i + 1] = b; index[i + 2] = c; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

export function buildTerrain(): THREE.Mesh {
  const geo = terrainGeometry();
  geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    groundColor(pos.getX(i), pos.getZ(i), pos.getY(i), nor.getY(i), c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  mat.defines = { TOON_NO_RIM: '' }; // visto de lado, el suelo entero se encendería con la luz de borde
  const uTime = { value: 0 };
  const uCaus = { value: 0.55 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uCaus = uCaus;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uTime;
uniform float uCaus;
// Ruido de Worley: distancia al punto más cercano (F1) y al segundo (F2). Donde F2 - F1 ≈ 0 estás en un borde de Voronoi.
vec2 hash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
vec2 worley(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = 0.5 + 0.5 * sin(uTime * 0.55 + 6.2831 * hash2(i + g)); // los puntos bailan: la red se deforma
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2);
}
float causticNet(vec2 p) { vec2 w = worley(p); return 1.0 - smoothstep(0.0, 0.17, w.y - w.x); } // líneas finas brillantes alrededor de parches oscuros
${CLOUD_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Cáusticas = la luz del sol enfocada por las ondas. No se simula la luz: se dibujan los bordes de Voronoi.
        // Dos redes que se deslizan una sobre otra no se repiten; se desvanecen con la profundidad y junto a la orilla.
        float depthFade = smoothstep(-0.12, -0.55, vWPos.y) * (1.0 - smoothstep(-1.4, -3.4, vWPos.y));
        float net1 = causticNet(vWPos.xz * 0.42 + vec2(uTime * 0.05, 0.0));
        float net2 = causticNet(vWPos.xz * 0.63 + vec2(7.3, -uTime * 0.045));
        float caus = (net1 + net2) * 0.5 * (0.55 + 0.9 * net1 * net2);
        diffuseColor.rgb += vec3(0.50, 0.85, 0.80) * caus * depthFade * uCaus;
        // sombras de nubes en tierra firme (bajo el agua no se notarían)
        diffuseColor.rgb *= 1.0 - 0.2 * cloudShadow(vWPos.xz, uTime) * smoothstep(-0.2, 0.3, vWPos.y);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.uTime = uTime;
  mesh.userData.uCaus = uCaus;
  return mesh;
}

/** Mapa de alturas de 8 bits para que el shader del agua pinte espuma y profundidad. */
export function buildHeightTexture(size = 352): THREE.DataTexture {
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
