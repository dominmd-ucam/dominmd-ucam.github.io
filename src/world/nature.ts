import * as THREE from 'three';
import { loadGLTF } from '../assets/loader';
import type { Tier } from '../quality';
import { BIOMES, CAVE, CLEARINGS, ISLAND_R, RESERVED, STONE_PATHS, biomeWeights, caveLocal, heightAt, islandRadius, pathDist, polar, type Biome } from './terrain';
import type { Obstacle } from './props';

/*
 * Vegetación, rocas y caminos de piedra con los modelos del Stylized Nature MegaKit (Quaternius, CC0)
 * y los de Sketchfab (CC-BY 4.0, ver CREDITS.md). Prepáralos con scripts/build-nature.mjs.
 *
 * Las posiciones se calculan al construir (deterministas): así los obstáculos existen desde el primer fotograma.
 * Los modelos llegan después; cada material del kit se dibuja con un único BatchedMesh (varias geometrías, una llamada de dibujo,
 * descarte por objeto contra la cámara).
 */

const BASE = `${import.meta.env.BASE_URL}models/nature/`;

type Kit = 'CommonTree_1' | 'CommonTree_2' | 'CommonTree_3' | 'CommonTree_4' | 'CommonTree_5'
  | 'Pine_1' | 'Pine_2' | 'Pine_3' | 'Pine_4' | 'Pine_5' | 'TwistedTree_1' | 'TwistedTree_2' | 'TwistedTree_3'
  | 'DeadTree_1' | 'DeadTree_2' | 'Bush_Common' | 'Bush_Common_Flowers' | 'Rock_Medium_1' | 'Rock_Medium_2' | 'Rock_Medium_3'
  | 'RockPath_Round_Small_1' | 'RockPath_Round_Small_2' | 'RockPath_Round_Small_3' | 'RockPath_Round_Wide' | 'RockPath_Round_Thin'
  | 'Pebble_Round_1' | 'Pebble_Round_2' | 'Pebble_Round_3' | 'Fern_1' | 'Flower_3_Group' | 'Flower_4_Group'
  | 'Mushroom_Common' | 'Mushroom_Laetiporus' | 'Plant_1' | 'Plant_7' | 'Clover_1';

/** Una pieza colocada: modelo, posición, giro, escala (y si inclina con el suelo). */
interface Spot { kit: Kit; x: number; y: number; z: number; rot: number; s: number; tilt?: THREE.Quaternion }

/** Qué crece en cada bioma: árboles (con su escala y separación) y sotobosque (modelo, escala, peso). */
const FLORA: Record<Biome | 'core', {
  trees: Kit[]; treeScale: [number, number]; density: number; gap: number;
  under: [Kit, number, number][]; underDensity: number;
}> = {
  forest: { trees: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'], treeScale: [0.8, 1.1], density: 0.95, gap: 3.0,
    under: [['Bush_Common', 1, 3], ['Fern_1', 0.55, 3], ['Plant_1', 0.75, 2], ['Mushroom_Common', 1, 1.5], ['Bush_Common_Flowers', 0.9, 1], ['Rock_Medium_2', 0.45, 0.6]], underDensity: 0.32 },
  mystic: { trees: ['TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3'], treeScale: [0.72, 0.85], density: 0.8, gap: 7,
    under: [['Fern_1', 0.7, 4], ['Mushroom_Laetiporus', 1, 1.5], ['Mushroom_Common', 1.2, 2], ['Plant_7', 1.4, 2], ['Rock_Medium_1', 0.6, 0.8]], underDensity: 0.4 },
  dry: { trees: ['DeadTree_1', 'DeadTree_2'], treeScale: [0.55, 0.75], density: 0.45, gap: 5,
    under: [['Rock_Medium_1', 0.9, 1.2], ['Rock_Medium_2', 1, 1.2], ['Rock_Medium_3', 0.8, 1], ['Pebble_Round_1', 1.6, 2], ['Pebble_Round_2', 1.6, 2], ['Plant_7', 1.2, 1.4], ['Bush_Common', 0.8, 0.5]], underDensity: 0.22 },
  pine: { trees: ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'], treeScale: [0.75, 1.05], density: 0.9, gap: 3.2,
    under: [['Fern_1', 0.5, 2], ['Rock_Medium_3', 0.6, 1.2], ['Rock_Medium_2', 0.5, 1], ['Mushroom_Common', 1, 1], ['Pebble_Round_3', 1.4, 1.5]], underDensity: 0.22 },
  meadow: { trees: ['CommonTree_5', 'CommonTree_3'], treeScale: [0.75, 0.95], density: 0.08, gap: 7,
    under: [['Flower_3_Group', 0.24, 3], ['Flower_4_Group', 0.21, 3], ['Bush_Common_Flowers', 0.9, 2], ['Clover_1', 0.45, 2], ['Plant_1', 0.6, 1]], underDensity: 0.45 },
  core: { trees: ['CommonTree_2', 'CommonTree_5'], treeScale: [0.8, 0.95], density: 0.045, gap: 8,
    under: [['Flower_3_Group', 0.22, 2], ['Flower_4_Group', 0.19, 2], ['Bush_Common_Flowers', 0.8, 1], ['Bush_Common', 0.8, 1], ['Clover_1', 0.4, 1.5]], underDensity: 0.1 },
};

/** Radio del obstáculo por modelo (a escala 1). Lo que no aparece se atraviesa (arbustos, flores, helechos, setas…): las plantas se apartan al pasar. */
const SOLID: Partial<Record<Kit, number>> = {
  CommonTree_1: 0.55, CommonTree_2: 0.55, CommonTree_3: 0.55, CommonTree_4: 0.55, CommonTree_5: 0.55,
  Pine_1: 0.6, Pine_2: 0.6, Pine_3: 0.6, Pine_4: 0.6, Pine_5: 0.6, TwistedTree_1: 1.4, TwistedTree_2: 1.4, TwistedTree_3: 1.4,
  DeadTree_1: 0.7, DeadTree_2: 0.7, Rock_Medium_1: 1.3, Rock_Medium_2: 1.2, Rock_Medium_3: 1.2,
};
/** Copa de cada árbol (a escala 1): altura de la base y radio, para que la cámara no se meta dentro. */
const CANOPY: Partial<Record<Kit, [number, number, number]>> = {};
for (const k of ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'] as Kit[]) CANOPY[k] = [2.6, 8.5, 2.3];
for (const k of ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'] as Kit[]) CANOPY[k] = [1.5, 9, 2.6];
for (const k of ['TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3'] as Kit[]) CANOPY[k] = [7, 17, 5.5];

const PATH_TILES: Kit[] = ['RockPath_Round_Small_1', 'RockPath_Round_Small_2', 'RockPath_Round_Small_3', 'RockPath_Round_Thin', 'RockPath_Round_Small_2', 'RockPath_Round_Wide'];

const FAR_SMALL = 45;
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const lerp = THREE.MathUtils.lerp;

/** Normal del terreno (diferencias finitas). */
function groundNormal(x: number, z: number, out = new THREE.Vector3()) {
  const e = 0.5;
  return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}

/** Calcula dónde va cada cosa. No necesita los modelos. */
function plan(obstacles: Obstacle[], tier: Tier) {
  const rand = rng(424242);
  const spots: Spot[] = [];
  const trees: Spot[] = [];
  const amount = tier === 'low' ? 0.5 : tier === 'med' ? 0.8 : 1;
  const treeAmount = tier === 'low' ? 0.7 : 1;
  const w = {} as Record<Biome, number>;
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  const blocked = (x: number, z: number, pad: number) => obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + pad);
  // plaza, punto de inicio y explanadas que deben quedar despejadas
  const OPEN: [number, number, number][] = [[0, 0, 7], [6, 12, 7], [-7, -6, 4], ...RESERVED]; // + parcelas, cofre, boca de la cueva y vallas
  const open = (x: number, z: number) => OPEN.some(([ox, oz, r]) => Math.hypot(x - ox, z - oz) < r);
  const pickBiome = (x: number, z: number): Biome | 'core' => {
    biomeWeights(x, z, w);
    let sum = 0; for (const b of BIOMES) sum += w[b.name];
    let r = rand() * Math.max(1, sum);
    for (const b of BIOMES) { r -= w[b.name]; if (r < 0) return b.name; }
    return 'core';
  };
  const ext = ISLAND_R * 1.3;

  // ---------- árboles ----------
  const tStep = 2.0;
  for (let gz = -ext; gz < ext; gz += tStep) for (let gx = -ext; gx < ext; gx += tStep) {
    const x = gx + (rand() - 0.5) * tStep, z = gz + (rand() - 0.5) * tStep, h = heightAt(x, z);
    if (h < 1.25 || h > 12 || open(x, z)) continue;
    if (groundNormal(x, z, n).y < 0.82) continue;
    if (pathDist(x, z) < 2.3) continue;
    // claros: dentro, nada; en el borde, una pared de árboles
    let wall: Biome | null = null, inside = false;
    for (const c of CLEARINGS) {
      const d = Math.hypot(x - c.x, z - c.z) - c.r;
      if (d < 0) inside = true; else if (d < 3.2) wall = c.biome;
    }
    if (inside) continue;
    const b = wall ?? pickBiome(x, z), f = FLORA[b];
    if (rand() > (wall ? 0.95 : f.density * treeAmount)) continue;
    if (blocked(x, z, 1.6)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < f.gap * (wall ? 0.75 : 1))) continue;
    const kit = f.trees[Math.floor(rand() * f.trees.length)];
    const s = lerp(f.treeScale[0], f.treeScale[1], rand());
    const t: Spot = { kit, x, y: h - 0.15, z, rot: rand() * Math.PI * 2, s };
    trees.push(t); spots.push(t);
  }
  for (const t of trees) obstacles.push({ x: t.x, z: t.z, r: (SOLID[t.kit] ?? 0.5) * t.s });

  // ---------- caminos de piedra ----------
  for (const poly of STONE_PATHS) {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
      const len = Math.hypot(bx - ax, bz - az), dir = Math.atan2(bx - ax, bz - az);
      for (let d = 0; d < len; d += 1.25 + rand() * 0.25) {
        const k = d / len, side = (rand() - 0.5) * 0.5;
        const x = lerp(ax, bx, k) + Math.cos(dir) * side, z = lerp(az, bz, k) - Math.sin(dir) * side, h = heightAt(x, z);
        if (h < 0.9 || open(x, z) && Math.hypot(x, z) < 2.5) continue;
        if (blocked(x, z, -0.2)) continue;
        if (spots.some((p) => p.kit.startsWith('RockPath') && Math.hypot(p.x - x, p.z - z) < 1.0)) continue;
        const tilt = new THREE.Quaternion().setFromUnitVectors(up, groundNormal(x, z, n));
        spots.push({ kit: PATH_TILES[Math.floor(rand() * PATH_TILES.length)], x, y: h - 0.04, z, rot: dir + (rand() - 0.5) * 0.8, s: 0.85 + rand() * 0.3, tilt });
        // guijarros sueltos a los lados
        if (rand() < 0.25) {
          const o = (rand() < 0.5 ? -1 : 1) * (1.1 + rand() * 0.5), px = x + Math.cos(dir) * o, pz = z - Math.sin(dir) * o;
          spots.push({ kit: (['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3'] as Kit[])[Math.floor(rand() * 3)], x: px, y: heightAt(px, pz) - 0.02, z: pz, rot: rand() * 6.28, s: 1 + rand() * 0.8 });
        }
      }
    }
  }

  // ---------- sotobosque, flores y rocas ----------
  const uStep = 1.7;
  for (let gz = -ext; gz < ext; gz += uStep) for (let gx = -ext; gx < ext; gx += uStep) {
    const x = gx + (rand() - 0.5) * uStep, z = gz + (rand() - 0.5) * uStep, h = heightAt(x, z);
    if (h < 1.15 || h > 12 || open(x, z) || pathDist(x, z) < 1.2) continue;
    const b = pickBiome(x, z), f = FLORA[b];
    // junto a los claros crece más (setas y helechos alrededor del tocón)
    const nearClear = CLEARINGS.some((c) => Math.abs(Math.hypot(x - c.x, z - c.z) - c.r) < 2.5);
    if (rand() > f.underDensity * amount * 1.3 * (nearClear ? 1.8 : 1)) continue;
    let total = 0; for (const u of f.under) total += u[2];
    let r = rand() * total, pick = f.under[0];
    for (const u of f.under) { r -= u[2]; if (r < 0) { pick = u; break; } }
    const [kit, sc] = pick, s = sc * (0.8 + rand() * 0.45), solid = SOLID[kit];
    if (blocked(x, z, solid ? 0.6 : 0.2)) continue;
    const isRock = kit.startsWith('Rock');
    spots.push({ kit, x, y: h - (isRock ? 0.25 * s : 0.03), z, rot: rand() * 6.28, s, tilt: isRock ? undefined : new THREE.Quaternion().setFromUnitVectors(up, groundNormal(x, z, n).lerp(up, 0.5).normalize()) });
    if (solid) obstacles.push({ x, z, r: solid * s * 0.8 });
  }
  return { spots, trees };
}

/** Lee un modelo de Sketchfab: lo centra, lo apoya en y = 0 y lo escala a `size` metros (lo más largo en horizontal). */
async function sketchfab(name: string, size: number, tier: Tier): Promise<THREE.Group | null> {
  try {
    const g = (await loadGLTF(`${BASE}${name}.glb`)).scene;
    const box = new THREE.Box3().setFromObject(g), dim = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const k = size / Math.max(dim.x, dim.z);
    const holder = new THREE.Group(), inner = new THREE.Group();
    inner.add(g); inner.scale.setScalar(k); inner.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    holder.add(inner);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = tier !== 'low'; m.receiveShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.metalness = 0; mat.roughness = 0.9;
      if (mat.transparent && mat.alphaTest === 0) { mat.transparent = false; mat.alphaTest = 0.4; }
    });
    return holder;
  } catch (e) {
    console.warn('naturaleza: falta', name, e);
    return null;
  }
}

/** Prepara las geometrías de un modelo del kit: atributos en float (posición, normal, uv, color RGBA), una por material. */
function kitParts(root: THREE.Object3D): Map<string, THREE.BufferGeometry> {
  const out = new Map<string, THREE.BufferGeometry[]>();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.geometry, n = src.attributes.position.count;
    const g = new THREE.BufferGeometry();
    const copy = (name: string, size: number, fill: number[]) => {
      const a = src.getAttribute(name), arr = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = a ? (k < a.itemSize ? a.getComponent(i, k) : 1) : fill[k];
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    };
    copy('position', 3, [0, 0, 0]); copy('normal', 3, [0, 1, 0]); copy('uv', 2, [0, 0]); copy('color', 4, [1, 1, 1, 1]);
    g.setIndex(src.index ? Array.from(src.index.array) : null);
    g.applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld));
    const name = (m.material as THREE.Material).name;
    if (/Lea/.test(name)) roundNormals(g);
    const list = out.get(name) ?? []; list.push(g); out.set(name, list);
  });
  const merged = new Map<string, THREE.BufferGeometry>();
  for (const [k, list] of out) merged.set(k, list.length === 1 ? list[0] : mergeList(list));
  return merged;
}
function mergeList(list: THREE.BufferGeometry[]) {
  // pocas piezas por modelo: fusión mínima a mano (mismos atributos)
  const names = ['position', 'normal', 'uv', 'color'], g = new THREE.BufferGeometry();
  let verts = 0; const idx: number[] = [];
  for (const p of list) { const ix = p.index!.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + verts); verts += p.attributes.position.count; }
  for (const n of names) {
    const size = list[0].getAttribute(n).itemSize, arr = new Float32Array(verts * size);
    let off = 0; for (const p of list) { arr.set(p.getAttribute(n).array as Float32Array, off); off += p.getAttribute(n).array.length; }
    g.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  g.setIndex(idx);
  return g;
}
/** Hojas: normales "de esfera" desde el centro de la copa en vez de las de cada tarjeta, para que la copa se ilumine como un volumen blando (BotW). */
function roundNormals(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3()), size = g.boundingBox!.getSize(new THREE.Vector3());
  const p = g.attributes.position as THREE.BufferAttribute, nr = g.attributes.normal as THREE.BufferAttribute, v = new THREE.Vector3(), o = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set((p.getX(i) - c.x) / size.x, (p.getY(i) - c.y) / size.y * 0.8 + 0.25, (p.getZ(i) - c.z) / size.z).normalize();
    o.set(nr.getX(i), nr.getY(i), nr.getZ(i));
    v.lerp(o, 0.2).normalize();
    nr.setXYZ(i, v.x, v.y, v.z);
  }
}

/**
 * Viento en hojas y flores (la fase sale de la posición de cada instancia), alfa 0 para que el contorno no las recorra,
 * y las plantas bajas (lo que queda por debajo de 1,6 m sobre su base: arbustos, helechos, flores) se apartan al paso del personaje, como la hierba.
 */
function patchFoliage(m: THREE.MeshStandardMaterial, uTime: { value: number }, uAlpha: { value: number }, uPlayer: { value: THREE.Vector3 }, amp: number, tint?: THREE.Color) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uAlpha = uAlpha; sh.uniforms.uPlayer = uPlayer; sh.uniforms.uTint = { value: tint ?? new THREE.Color(1, 1, 1) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uPlayer;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_BATCHING
          vec3 ip = batchingMatrix[3].xyz;
          mat3 instRot = mat3(batchingMatrix);
        #else
          vec3 ip = vec3(0.0);
          mat3 instRot = mat3(1.0);
        #endif
        float bend = max(position.y, 0.0) * ${amp.toFixed(3)};
        transformed.x += sin(uTime * 1.1 + ip.x * 0.6 + ip.z * 0.4 + position.y * 0.5) * bend;
        transformed.z += cos(uTime * 0.8 + ip.z * 0.5 + position.x * 0.7) * bend * 0.7;
        // empuje: en el mundo, desde el personaje hacia fuera; más fuerte arriba y nulo en la raíz y por encima de 1,6 m
        vec3 wp = ip + instRot * transformed;
        vec2 dp = wp.xz - uPlayer.xz;
        float dist = length(dp);
        float hy = wp.y - ip.y;
        float push = (1.0 - smoothstep(0.25, 1.1, dist)) * smoothstep(0.0, 0.5, hy) * (1.0 - smoothstep(1.2, 1.6, hy)) * step(abs(uPlayer.y - ip.y), 1.5);
        vec2 off = dp / max(dist, 0.001) * push * 0.55;
        vec3 w = vec3(off.x, -push * 0.15, off.y);
        transformed += vec3(dot(instRot[0], w) / dot(instRot[0], instRot[0]), dot(instRot[1], w) / dot(instRot[1], instRot[1]), dot(instRot[2], w) / dot(instRot[2], instRot[2]));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAlpha;\nuniform vec3 uTint;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = uAlpha;');
    // hojas que vienen rojas en el kit: se repintan en verde conservando el dibujo (su luminosidad)
    if (tint) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = uTint * (0.45 + 1.6 * dot(diffuseColor.rgb, vec3(0.5, 0.35, 0.15)));`);
  };
  m.customProgramCacheKey = () => `foliage${amp}${tint ? 't' : ''}`;
}

/** Un modelo de Sketchfab ya colocado: centro, altura de apoyo, giro (su eje largo apunta a (sin rot, cos rot)) e inclinación a lo largo de ese eje. */
interface Prop { name: string; size: number; long: boolean; x: number; y: number; z: number; rot: number; tilt: number }

/**
 * Coloca los modelos de Sketchfab en el borde de los claros, donde más lejos queden de los caminos (antes estaban en el centro,
 * justo encima del camino). El tronco caído va tangente al claro. Se apoyan por el punto más bajo de su huella (o se inclinan
 * siguiendo la pendiente, el tronco) para que no quede ningún extremo flotando.
 */
function placeProps(obstacles: Obstacle[]): Prop[] {
  const [forest, mystic] = CLEARINGS;
  const want: [string, number, boolean, typeof forest][] = [
    // nombre, tamaño (m), alargado, claro
    ['fallen-tree', 7.5, true, forest],
    ['mossy-stump', 2.6, false, forest],
    ['tree-stump', 3, false, mystic],
  ];
  const out: Prop[] = [];
  for (const [name, size, long, c] of want) {
    let best: Prop | null = null, bestScore = -1;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
      for (const f of long ? [0.85, 1.0, 1.15] : [0.55, 0.7, 0.85]) {
        const x = c.x + Math.cos(a) * c.r * f, z = c.z + Math.sin(a) * c.r * f;
        const rot = long ? -a : a;
        const ax = Math.sin(rot), az = Math.cos(rot), half = long ? size / 2 : size * 0.4;
        let score = 99, lo = 99, h0 = 0, h1 = 0;
        for (let t = -half; t <= half + 1e-6; t += half / 4) {
          const px = x + ax * t, pz = z + az * t;
          score = Math.min(score, pathDist(px, pz));
          lo = Math.min(lo, heightAt(px, pz));
          if (t === -half) h0 = heightAt(px, pz);
          h1 = heightAt(px, pz);
        }
        if (lo < 1.25) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (o.size + size) * 0.45)) continue;
        if (score > bestScore) {
          bestScore = score;
          best = long
            ? { name, size, long, x, z, rot, y: (h0 + h1) / 2 - 0.12, tilt: -Math.atan2(h1 - h0, size) }
            : { name, size, long, x, z, rot, y: lo - 0.06, tilt: 0 };
        }
      }
    }
    if (!best) continue;
    out.push(best);
    if (long) for (const k of [-2.4, 0, 2.4]) obstacles.push({ x: best.x + Math.sin(best.rot) * k, z: best.z + Math.cos(best.rot) * k, r: 0.7 });
    else obstacles.push({ x: best.x, z: best.z, r: size * 0.36 });
  }
  return out;
}

/** Helechos, setas y plantas alrededor de la base de los modelos de Sketchfab y junto a la cueva y el barco (tapan el contacto con el suelo). */
function undergrowth(props: Prop[], obstacles: Obstacle[]): Spot[] {
  const rand = rng(777), out: Spot[] = [], up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  const add = (kit: Kit, x: number, z: number, s: number) => {
    const h = heightAt(x, z);
    if (h < 1.1 || pathDist(x, z) < 1.1) return;
    out.push({ kit, x, y: h - 0.03, z, rot: rand() * 6.28, s, tilt: new THREE.Quaternion().setFromUnitVectors(up, groundNormal(x, z, n).lerp(up, 0.5).normalize()) });
  };
  const KITS: [Kit, number][] = [['Fern_1', 0.5], ['Fern_1', 0.42], ['Plant_1', 0.6], ['Mushroom_Common', 0.9], ['Plant_7', 1.1]];
  for (const p of props) {
    const k = p.long ? 9 : 6;
    for (let i = 0; i < k; i++) {
      const [kit, sc] = KITS[Math.floor(rand() * KITS.length)];
      if (p.long) {
        const t = (rand() - 0.5) * p.size * 0.9, side = (rand() < 0.5 ? -1 : 1) * (0.55 + rand() * 0.5);
        add(kit, p.x + Math.sin(p.rot) * t + Math.cos(p.rot) * side, p.z + Math.cos(p.rot) * t - Math.sin(p.rot) * side, sc * (0.8 + rand() * 0.4));
      } else {
        const a = rand() * 6.28, r = p.size * (0.38 + rand() * 0.2);
        add(kit, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, sc * (0.8 + rand() * 0.4));
      }
    }
  }
  // junto a la cueva y al barco varado (antes había helechos rígidos sin viento)
  const caveA = Math.atan2(CAVE.z, CAVE.x), caveF = Math.hypot(CAVE.x, CAVE.z) / islandRadius(caveA) + 0.02;
  for (const [a, f] of [[caveA, caveF], [1.38, 0.9]]) {
    for (let i = 0; i < 26; i++) {
      const aa = a + (rand() - 0.5) * 0.6, rr = f + (rand() - 0.5) * 0.14;
      const [x, z] = polar(aa, rr);
      if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
      const [cs, cv] = caveLocal(x, z);
      if (cs > -3 && cs < CAVE.notch + 1 && Math.abs(cv) < CAVE.w + 0.8) continue; // la entrada queda libre
      const [kit, sc] = KITS[Math.floor(rand() * 3)];
      add(kit, x, z, sc * (0.8 + rand() * 0.5));
    }
  }
  return out;
}

export interface Nature {
  /** `player`: posición del personaje, para que las plantas se aparten a su paso */
  update(t: number, player?: THREE.Vector3): void;
  /** ¿está el punto (la cámara) dentro de alguna copa? */
  blocks(p: THREE.Vector3): boolean;
  setInkMask(on: boolean): void;
  ready: Promise<void>;
  /** dónde quedaron los modelos de Sketchfab (para depurar) */
  props: readonly Prop[];
}

export function buildNature(scene: THREE.Scene, obstacles: Obstacle[], tier: Tier, mobile = false): Nature {
  // los modelos de Sketchfab van antes que los árboles (así no se plantan encima) y fuera de los caminos
  const props = placeProps(obstacles);
  const { spots, trees } = plan(obstacles, tier);
  spots.push(...undergrowth(props, obstacles));
  const uTime = { value: 0 }, uAlpha = { value: 1 }, uPlayer = { value: new THREE.Vector3(0, -99, 0) };
  const floats: { o: THREE.Object3D; y: number; ph: number }[] = [];
  /** copa real de cada modelo (de las hojas): centro en xz, radio y alturas; sustituye a CANOPY cuando llegan los modelos */
  const crowns = new Map<Kit, { x: number; z: number; r: number; y0: number; y1: number }>();
  /** plantas pequeñas que se ocultan lejos del jugador (con la isla de 70 m serían miles de instancias diminutas) */
  const small: { bm: THREE.BatchedMesh; id: number; x: number; z: number }[] = [];
  const treeSet = new Set<Spot>(trees);
  const isSmall = (sp: Spot) => !treeSet.has(sp) && !/^Rock(_|Path)/.test(sp.kit);
  let frame = 0;

  const ready = (async () => {
    const gltf = await loadGLTF(`${BASE}megakit.glb`);
    // geometrías por modelo y material
    const parts = new Map<Kit, Map<string, THREE.BufferGeometry>>();
    const mats = new Map<string, THREE.MeshStandardMaterial>();
    for (const node of gltf.scene.children) {
      const kp = kitParts(node);
      parts.set(node.name as Kit, kp);
      for (const [mn, g] of kp) if (/Lea/.test(mn) && CANOPY[node.name as Kit]) {
        g.computeBoundingBox();
        const b = g.boundingBox!;
        crowns.set(node.name as Kit, { x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2, r: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.4, y0: b.min.y + (b.max.y - b.min.y) * 0.2, y1: b.max.y });
      }
      node.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const mt = m.material as THREE.MeshStandardMaterial; mats.set(mt.name, mt); } });
    }
    // un BatchedMesh por material
    const byMat = new Map<string, { verts: number; idx: number; count: number; geos: Map<Kit, number> }>();
    for (const sp of spots) for (const [mat, g] of parts.get(sp.kit) ?? []) {
      let e = byMat.get(mat);
      if (!e) { e = { verts: 0, idx: 0, count: 0, geos: new Map() }; byMat.set(mat, e); }
      e.count++;
      if (!e.geos.has(sp.kit)) { e.geos.set(sp.kit, -1); e.verts += g.attributes.position.count; e.idx += g.index!.count; }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [name, e] of byMat) {
      const src = mats.get(name)!;
      const mat = src.clone();
      mat.vertexColors = true; mat.metalness = 0; mat.roughness = 0.9;
      // la piedra del kit es gris oscura: más clara y cálida, como la de los caminos de BotW
      if (/Rock/.test(name)) mat.color.setRGB(1.45, 1.38, 1.25);
      if (/DeadTree/.test(name)) mat.color.setRGB(1.7, 1.55, 1.4);
      const foliage = /Lea|Flower/.test(name);
      if (foliage) { mat.side = THREE.DoubleSide; mat.alphaTest = Math.max(mat.alphaTest, 0.45); patchFoliage(mat, uTime, uAlpha, uPlayer, /Flower/.test(name) ? 0.05 : /Pine/.test(name) ? 0.012 : 0.02, /Twisted/.test(name) ? new THREE.Color('#2f8a55') : undefined); }
      const bm = new THREE.BatchedMesh(e.count, e.verts, e.idx, mat);
      for (const kit of e.geos.keys()) e.geos.set(kit, bm.addGeometry(parts.get(kit)!.get(name)!));
      for (const sp of spots) {
        const gid = e.geos.get(sp.kit);
        if (gid === undefined) continue;
        qy.setFromAxisAngle(up, sp.rot);
        q.copy(sp.tilt ?? q.identity()).multiply(qy);
        m4.compose(pos.set(sp.x, sp.y, sp.z), q, scl.setScalar(sp.s));
        const id = bm.addInstance(gid);
        bm.setMatrixAt(id, m4);
        if (isSmall(sp)) small.push({ bm, id, x: sp.x, z: sp.z });
      }
      // las losas, guijarros y flores no proyectan sombra (no se notaría y la pasada de sombras es cara)
      // en móvil solo los árboles y arbustos (corteza y copas): setas y rocas sueltas apenas se notan y cada material es otra llamada en la pasada de sombras
      bm.castShadow = tier !== 'low' && !/PathRocks|Flower/.test(name) && !(/^Leaves$/.test(name)) && (!mobile || /^(Bark|Leaves)_/.test(name));
      bm.receiveShadow = true;
      bm.name = `nature:${name}`;
      scene.add(bm);
    }

    // Sketchfab
    for (const pr of props) {
      const g = await sketchfab(pr.name, pr.size, tier);
      if (!g) continue;
      g.position.set(pr.x, pr.y, pr.z); g.rotation.set(pr.tilt, pr.rot, 0, 'YXZ');
      scene.add(g);
    }
    if (tier !== 'low') {
      const isle = await sketchfab('floating-island', 15, tier);
      if (isle) {
        const [ix, iz] = polar(0.95, 1.55);
        isle.position.set(ix, 24, iz); isle.rotation.y = -0.6;
        isle.traverse((o) => { o.castShadow = false; });
        scene.add(isle);
        floats.push({ o: isle, y: 24, ph: 0 });
      }
    }
  })().catch((e) => console.warn('naturaleza: no se pudo cargar el MegaKit', e));

  return {
    ready,
    props,
    update: (t, player) => {
      uTime.value = t;
      if (player) {
        uPlayer.value.copy(player);
        if (frame++ % 30 === 0) for (const p of small) p.bm.setVisibleAt(p.id, Math.hypot(p.x - player.x, p.z - player.z) < FAR_SMALL);
      }
      for (const f of floats) { f.o.position.y = f.y + Math.sin(t * 0.35 + f.ph) * 0.6; f.o.rotation.y += 0.0004; }
    },
    setInkMask: (on) => { uAlpha.value = on ? 0 : 1; },
    blocks: (p) => {
      for (const t of trees) {
        const k = crowns.get(t.kit);
        if (k) {
          // el centro de la copa gira con el árbol (los retorcidos la tienen muy desplazada del tronco)
          const cs = Math.cos(t.rot), sn = Math.sin(t.rot);
          const cx = t.x + (k.x * cs + k.z * sn) * t.s, cz = t.z + (-k.x * sn + k.z * cs) * t.s;
          if (p.y > t.y + k.y0 * t.s && p.y < t.y + k.y1 * t.s && Math.hypot(p.x - cx, p.z - cz) < k.r * t.s) return true;
          continue;
        }
        const c = CANOPY[t.kit];
        if (!c) continue;
        if (p.y > t.y + c[0] * t.s && p.y < t.y + c[1] * t.s && Math.hypot(p.x - t.x, p.z - t.z) < c[2] * t.s) return true;
      }
      return false;
    },
  };
}
