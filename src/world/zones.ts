import * as THREE from 'three';
import { CAVE, CHEST, DEAD_ENDS, PLOTS, caveFloorY, heightAt, type Plot } from './terrain';
import type { Obstacle } from './props';
import { batchStatic } from './batch';
import { stoneGeometry, stoneMaterial } from './stone';

/*
 * Zonas reservadas (src/data/zones.json): de momento solo decorado, sin funcionalidad.
 * - parcelas para proyectos (estacas y cuerda) y parcelas de puzle en lo alto de las mesetas (círculo de losas)
 * - cofre medio enterrado en la arena
 * - senderos sin salida, que acaban en una valla
 * - el interior de la cueva de la meseta del suroeste (la entrada la pone diorama.ts)
 */

const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });
function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  parent.add(o);
  return o;
}
function hash(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function smooth(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

const UP = new THREE.Vector3(0, 1, 0);
const WOOD = mat('#b9824f'), WOOD_D = mat('#7d4a2a'), ROPE = mat('#e6cf98');

/** Parcela de proyecto: estacas alrededor unidas por una cuerda y un cartel en blanco junto a la entrada. */
function projectPlot(root: THREE.Object3D, p: Plot, obstacles: Obstacle[]) {
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z); root.add(g);
  const n = 10, gate = Math.atan2(-p.z, -p.x); // la entrada mira hacia el centro de la isla, por donde llega el sendero
  const post = new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = gate + 0.45 + (i / n) * (Math.PI * 2 - 0.9); // hueco de entrada
    const x = Math.cos(a) * p.r, z = Math.sin(a) * p.r, y = heightAt(p.x + x, p.z + z);
    add(g, post, WOOD, x, y + 0.4, z).rotation.z = (hash(i, p.x) - 0.5) * 0.12;
    pts.push(new THREE.Vector3(x, y + 0.65, z));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
    const rope = add(g, new THREE.CylinderGeometry(0.018, 0.018, len, 4), ROPE, (a.x + b.x) / 2, (a.y + b.y) / 2 - 0.05, (a.z + b.z) / 2);
    rope.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); rope.castShadow = false;
  }
  // cartel vacío a un lado de la entrada
  const sx = Math.cos(gate + 0.75) * (p.r + 0.5), sz = Math.sin(gate + 0.75) * (p.r + 0.5), sy = heightAt(p.x + sx, p.z + sz);
  add(g, new THREE.CylinderGeometry(0.06, 0.07, 1.3, 6), WOOD_D, sx, sy + 0.65, sz);
  const board = add(g, new THREE.BoxGeometry(0.9, 0.55, 0.06), WOOD, sx, sy + 1.25, sz);
  board.rotation.y = Math.atan2(-sx, -sz) + Math.PI; // de cara al sendero
  obstacles.push({ x: p.x + sx, z: p.z + sz, r: 0.3 });
}

/** Parcela de puzle (en las mesetas): un círculo de losas y un pedestal de piedra en el centro, vacío. */
function puzzlePlot(root: THREE.Object3D, p: Plot, obstacles: Obstacle[]) {
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z); root.add(g);
  const slab = stoneMaterial('#cbb9a2', 0.4), dark = stoneMaterial('#9d8b79', 0.6);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, x = Math.cos(a) * p.r, z = Math.sin(a) * p.r;
    const s = add(g, stoneGeometry(0.55, i * 3.1 + p.x, 0.25, 2), slab, x, heightAt(p.x + x, p.z + z) - 0.05, z);
    s.rotation.y = a; s.castShadow = false;
  }
  const y = heightAt(p.x, p.z);
  add(g, new THREE.CylinderGeometry(0.55, 0.7, 0.9, 8), dark, 0, y + 0.4, 0);
  add(g, new THREE.CylinderGeometry(0.7, 0.6, 0.12, 8), slab, 0, y + 0.9, 0);
  obstacles.push({ x: p.x, z: p.z, r: 0.75 });
}

/** Cofre medio enterrado en la arena, con la tapa entreabierta y un montoncito de arena delante. */
function chest(root: THREE.Object3D, obstacles: Obstacle[]) {
  const g = new THREE.Group(), y = heightAt(CHEST.x, CHEST.z);
  g.position.set(CHEST.x, y - 0.32, CHEST.z);
  g.rotation.set(0.18, Math.atan2(-CHEST.x, -CHEST.z) + 0.4, -0.12, 'YXZ'); // inclinado, mirando hacia tierra
  const metal = mat('#c9a14a', { metalness: 0.5, roughness: 0.45 });
  add(g, new THREE.BoxGeometry(1.1, 0.6, 0.7), WOOD_D, 0, 0.3, 0);
  for (const x of [-0.42, 0.42]) add(g, new THREE.BoxGeometry(0.08, 0.62, 0.72), metal, x, 0.3, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.35); lid.rotation.x = -0.35; g.add(lid);
  const top = new THREE.CylinderGeometry(0.35, 0.35, 1.1, 10, 1, false, 0, Math.PI); top.rotateZ(Math.PI / 2);
  add(lid, top, WOOD, 0, 0, 0.35);
  add(lid, new THREE.BoxGeometry(0.16, 0.18, 0.06), metal, 0, -0.02, 0.72);
  root.add(g);
  // arena amontonada alrededor (oculta la base)
  const sand = mat('#ecc985', { flatShading: false });
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3, r = 0.55 + hash(i, 2) * 0.3;
    const m = add(root, new THREE.SphereGeometry(0.5 + hash(i, 5) * 0.25, 9, 6), sand, CHEST.x + Math.cos(a) * r, y - 0.22, CHEST.z + Math.sin(a) * r);
    m.scale.y = 0.4; m.castShadow = false;
  }
  obstacles.push({ x: CHEST.x, z: CHEST.z, r: 0.8 });
}

/** Valla al final de un sendero sin salida. */
function fence(root: THREE.Object3D, d: { x: number; z: number; dir: number }, obstacles: Obstacle[]) {
  const g = new THREE.Group(); g.position.set(d.x, 0, d.z); g.rotation.y = d.dir; root.add(g);
  for (const x of [-1.1, 0, 1.1]) {
    const y = heightAt(d.x + Math.cos(d.dir) * x, d.z - Math.sin(d.dir) * x);
    add(g, new THREE.CylinderGeometry(0.07, 0.08, 1.1, 6), WOOD_D, x, y + 0.5, 0);
  }
  const y = heightAt(d.x, d.z);
  add(g, new THREE.BoxGeometry(2.5, 0.12, 0.06), WOOD, 0, y + 0.85, 0.08).rotation.z = 0.04;
  add(g, new THREE.BoxGeometry(2.4, 0.12, 0.06), WOOD, 0, y + 0.45, 0.08).rotation.z = -0.05;
  for (const x of [-1.1, 0, 1.1]) obstacles.push({ x: d.x + Math.cos(d.dir) * x, z: d.z - Math.sin(d.dir) * x, r: 0.35 });
}

/**
 * Interior de la cueva: un tubo con sección de arco que se ensancha en una sala al fondo y se cierra en cúpula.
 * Las caras se ven por los dos lados (el arco asoma un poco por la pared de la meseta, como un saliente de roca).
 * Se oscurece hacia el fondo; unas setas y cristales que brillan dan la luz.
 */
function caveInterior(root: THREE.Object3D, tier: string) {
  const S0 = CAVE.s0, { s: SC, r: RR } = CAVE.room, R = RR + 0.4, S1 = SC + R, W0 = CAVE.w + 0.35;
  const half = (s: number) => {
    const room = Math.sqrt(Math.max(0, R * R - (s - SC) ** 2));
    return s < SC ? Math.max(W0, room) : room;
  };
  const height = (s: number) => (s < SC ? Math.max(CAVE.h, half(s) * 0.95) : Math.max(0.05, half(s) * 0.95));
  const steps = Math.ceil((S1 - S0) / 0.32), seg = 16;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const rock = new THREE.Color('#8c7a6a'), floorC = new THREE.Color('#6b5643'), c = new THREE.Color();
  const toWorld = (s: number, v: number, y: number) => [CAVE.x + CAVE.dx * s - CAVE.dz * v, y, CAVE.z + CAVE.dz * s + CAVE.dx * v];
  // pared y techo: sección de arco (θ de 0 a π) más dos filas de suelo hacia el centro
  const cols = seg + 1 + 4;
  for (let i = 0; i <= steps; i++) {
    const s = Math.min(S1 - 0.02, S0 + i * 0.32), w = half(s), h = height(s), f = caveFloorY(s);
    const dark = THREE.MathUtils.lerp(0.85, 0.32, THREE.MathUtils.smoothstep(s, S0, SC));
    const ring: [number, number, number, THREE.Color][] = [];
    ring.push([-w * 0.5, f - 0.02, 0, floorC], [-w * 0.95, f - 0.01, 0, floorC]);
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * Math.PI, n = 1 + (smooth(s * 0.9, k * 0.7) - 0.5) * 0.28;
      const v = -Math.cos(th) * w * n, y = f + Math.sin(th) * h * (0.92 + (n - 1) * 0.6) - 0.15 * (1 - Math.sin(th));
      ring.push([v, y, 0, rock]);
    }
    ring.push([w * 0.95, f - 0.01, 0, floorC], [w * 0.5, f - 0.02, 0, floorC]);
    for (const [v, y, , base] of ring) {
      pos.push(...toWorld(s, v, y));
      c.copy(base).multiplyScalar(dark * (0.85 + hash(s * 3.1, v * 2.3) * 0.3));
      col.push(c.r, c.g, c.b);
    }
  }
  // suelo central (franja entre las dos filas de suelo de cada lado)
  for (let i = 0; i < steps; i++) {
    const a = i * cols, b = (i + 1) * cols;
    for (let k = 0; k < cols - 1; k++) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
    idx.push(a, a + cols - 1, b, b, a + cols - 1, b + cols - 1); // cierra el suelo por el centro
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const walls = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }));
  walls.castShadow = tier !== 'low'; walls.receiveShadow = true;
  walls.name = 'cave';
  root.add(walls);

  // setas y cristales que brillan (con bloom en calidad media y alta)
  const glowMush = mat('#7ff0e0', { emissive: '#3fd8c8', emissiveIntensity: 1.6, flatShading: false });
  const glowCrys = mat('#c9a2ff', { emissive: '#9a6cff', emissiveIntensity: 1.8 });
  const stem = mat('#e8e0cf', { flatShading: false });
  const at = (s: number, v: number, dy = 0) => { const [x, , z] = toWorld(s, v, 0); return new THREE.Vector3(x, caveFloorY(s) + dy, z); };
  const mush = [[4.2, -1.45], [4.6, -1.3], [6.4, 1.45], [7.9, -1.5], [9.6, 2.3], [10.2, -2.6], [12.6, 2.2], [13.1, -1.9], [11.4, 2.8]];
  for (const [s, v] of mush) {
    const p = at(s, v), k = 0.7 + hash(s, v) * 0.6;
    add(root, new THREE.CylinderGeometry(0.035 * k, 0.05 * k, 0.28 * k, 6), stem, p.x, p.y + 0.14 * k, p.z);
    const cap = add(root, new THREE.SphereGeometry(0.16 * k, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), glowMush, p.x, p.y + 0.27 * k, p.z);
    cap.scale.y = 0.7; cap.castShadow = false;
  }
  const crys = [[8.6, 1.7, 0.6], [11, -2.9, 1.2], [13.6, 0.4, 1.6], [12.2, 2.6, 0.5], [5.4, -1.75, 1.4]];
  for (const [s, v, y] of crys) {
    const p = at(s, v, y), k = 0.6 + hash(v, s) * 0.7;
    const m = add(root, new THREE.OctahedronGeometry(0.22 * k, 0), glowCrys, p.x, p.y, p.z);
    m.scale.y = 2.2; m.rotation.set(hash(s, 1) - 0.5, hash(s, 2) * 3, (hash(s, 3) - 0.5) * 1.2); m.castShadow = false;
  }
  // pedestal vacío en el centro de la sala (reservado)
  const ped = at(SC, 0), stone = stoneMaterial('#8f7d6e', 0.3);
  add(root, new THREE.CylinderGeometry(0.45, 0.6, 0.75, 8), stone, ped.x, ped.y + 0.37, ped.z);
  add(root, new THREE.CylinderGeometry(0.58, 0.5, 0.1, 8), stone, ped.x, ped.y + 0.78, ped.z);
}

export function buildZones(scene: THREE.Scene, tier: string): { obstacles: Obstacle[] } {
  const obstacles: Obstacle[] = [];
  const root = new THREE.Group(); root.name = 'zones';
  for (const p of PLOTS) (p.kind === 'puzzle' ? puzzlePlot : projectPlot)(root, p, obstacles);
  chest(root, obstacles);
  for (const d of DEAD_ENDS) fence(root, d, obstacles);
  caveInterior(root, tier); // sin obstáculos dentro: serían paredes invisibles para quien camina por encima de la meseta
  batchStatic(root, 24);
  scene.add(root);
  return { obstacles };
}
