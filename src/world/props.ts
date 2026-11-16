import * as THREE from 'three';
import { heightAt, islandRadius } from './terrain';
import { batchStatic } from './batch';

export interface Obstacle { x: number; z: number; r: number }

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------- palmeras ---------- */
/** Hoja arqueada; `sx` y `sy` son las subdivisiones (el nivel lejano usa muchas menos). */
function makeLeafGeo(sx: number, sy: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, sx, sy);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const dark = new THREE.Color('#2fae4a'), light = new THREE.Color('#8fe86a'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const u = p.getY(i) + 0.5; // 0 base → 1 punta
    const w = p.getX(i);
    const width = Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.55 + 0.04;
    const x = w * width * 1.6;
    const len = u * 3.6;
    // hoja arqueada: sube y cae con el peso; el centro se pliega en V
    const y = u * 0.9 - u * u * 1.9 - Math.abs(x) * 0.35;
    p.setXYZ(i, x, y, len);
    c.copy(dark).lerp(light, u * 0.7 + Math.abs(w) * 0.2);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const leafGeoHi = makeLeafGeo(4, 10), leafGeoLo = makeLeafGeo(2, 4);
const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, flatShading: true });
const trunkMat = std('#b97a4a', { flatShading: true });
const cocoMat = std('#5b3b22');

/** Palmera con dos niveles de detalle (cerca ≈1.600 triángulos, lejos ≈330): `setFar` alterna cuál se dibuja. */
export interface Palm { group: THREE.Group; crown: THREE.Group; phase: number; far: boolean; setFar(far: boolean): void }

export function makePalm(x: number, z: number, scale: number, rnd: () => number): Palm {
  const group = new THREE.Group();
  group.position.set(x, heightAt(x, z) - 0.15, z);
  group.scale.setScalar(scale);
  const dir = rnd() * Math.PI * 2, lean = 0.9 + rnd() * 1.4, H = 5.2 + rnd() * 1.4;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    pts.push(new THREE.Vector3(Math.cos(dir) * lean * u * u, u * H, Math.sin(dir) * lean * u * u));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const up = new THREE.Vector3(0, 1, 0);
  // tronco escalonado: anillos de cono apilados siguiendo la curva (el nivel lejano usa menos anillos y menos lados)
  const buildTrunk = (rings: number, radial: number) => {
    const trunk = new THREE.Group();
    group.add(trunk);
    for (let i = 0; i < rings; i++) {
      const a = curve.getPoint(i / rings), b = curve.getPoint((i + 1) / rings), v = b.clone().sub(a);
      const rb = 0.36 - (i / rings) * 0.176, rt = rb - 0.03;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, v.length() * 1.18, radial), trunkMat);
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(up, v.normalize());
      seg.rotateY(i * 0.7);
      seg.castShadow = true;
      trunk.add(seg);
    }
    return trunk;
  };
  const crown = new THREE.Group();
  crown.position.copy(pts[pts.length - 1]);
  group.add(crown);
  // los parámetros de cada hoja se sortean una vez: los dos niveles son la misma palmera
  const n = 10;
  const leaves = Array.from({ length: n }, (_, i) => ({ ry: (i / n) * Math.PI * 2 + rnd() * 0.3, rx: -0.15 + rnd() * 0.3, s: 0.85 + rnd() * 0.3 }));
  const buildCrown = (geo: THREE.BufferGeometry, coconuts: boolean) => {
    const g = new THREE.Group();
    crown.add(g);
    for (const l of leaves) {
      const leaf = new THREE.Mesh(geo, leafMat);
      leaf.rotation.y = l.ry; leaf.rotation.x = l.rx; leaf.scale.setScalar(l.s);
      leaf.castShadow = true;
      g.add(leaf);
    }
    if (coconuts) {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), cocoMat);
        const a = (i / 3) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.25, -0.25, Math.sin(a) * 0.25);
        c.castShadow = true;
        g.add(c);
      }
    }
    return g;
  };
  const trunkHi = buildTrunk(11, 7), trunkLo = buildTrunk(5, 5);
  const crownHi = buildCrown(leafGeoHi, true), crownLo = buildCrown(leafGeoLo, false);
  // fusionamos cada parte por separado: pocas llamadas de dibujo por palmera (la copa se mece como grupo)
  for (const g of [trunkHi, trunkLo, crownHi, crownLo]) batchStatic(g);
  group.userData.dynamic = true;
  const palm: Palm = {
    group, crown, phase: rnd() * 6, far: false,
    setFar(far) {
      palm.far = far;
      trunkHi.visible = crownHi.visible = !far;
      trunkLo.visible = crownLo.visible = far;
    },
  };
  palm.setFar(false);
  return palm;
}

export function buildScenery(scene: THREE.Object3D) {
  const rnd = rand(7);
  const palms: Palm[] = [];
  const obstacles: Obstacle[] = [];
  const spots: [number, number][] = [
    // en la franja de playa (dentro, los bosques del MegaKit) y un par junto a la plaza
    [0.3, 0.84], [0.8, 0.86], [1.5, 0.8], [2.0, 0.78], [2.8, 0.85], [3.5, 0.83],
    [4.2, 0.86], [4.9, 0.84], [5.6, 0.85], [1.2, 0.82], [0.1, 0.3], [4.1, 0.34],
    // la isla de 105 m tiene el doble de costa: más palmeras en la playa
    [0.55, 0.88], [1.05, 0.9], [1.75, 0.86], [2.35, 0.87], [3.15, 0.88], [3.85, 0.87], [4.55, 0.9], [5.25, 0.88], [5.95, 0.87],
  ];
  for (const [a, f] of spots) {
    const r = islandRadius(a) * f;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 0.7) continue;
    const p = makePalm(x, z, 0.85 + rnd() * 0.4, rnd);
    scene.add(p.group); palms.push(p);
    obstacles.push({ x, z, r: 0.55 });
  }

  // flores, arbustos y rocas: ahora los pone nature.ts con el Stylized Nature MegaKit
  return { palms, obstacles };
}

export type ProjectType = 'web' | 'bot' | 'plugin' | 'cli' | 'mobile' | 'device';
