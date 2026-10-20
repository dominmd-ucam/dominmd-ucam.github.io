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

/* ---------- objetos interactivos (placeholders) ---------- */
export type ProjectType = 'web' | 'bot' | 'plugin' | 'cli' | 'mobile' | 'device';

export function makeStation(type: ProjectType): { group: THREE.Group; accent: THREE.Color; tick?: (t: number) => void } {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh) => { m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const wood = std('#b07d52'), dark = std('#3a4552');
  let accent = new THREE.Color('#4cc9f0');
  let tick: ((t: number) => void) | undefined;

  if (type === 'web') {
    // mesita con portátil
    const table = add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20), wood)); table.position.y = 0.95;
    const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.95, 10), wood)); leg.position.y = 0.47;
    const base = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.55), std('#cfd6dd', { metalness: 0.4, roughness: 0.4 }))); base.position.set(0, 1.04, 0);
    const scrMat = new THREE.MeshStandardMaterial({ color: '#0b1d33', emissive: '#4cc9f0', emissiveIntensity: 0.9 });
    const scr = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.52, 0.04), scrMat)); scr.position.set(0, 1.32, -0.26); scr.rotation.x = -0.18;
    tick = (t) => { scrMat.emissiveIntensity = 0.75 + Math.sin(t * 3) * 0.15; };
    const umb = add(new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#ff7a59', side: THREE.DoubleSide })));
    umb.position.y = 3.1;
    const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), std('#e8e3d8'))); pole.position.y = 1.95; pole.position.x = 0.85;
    umb.position.x = 0.85;
  } else if (type === 'bot') {
    accent = new THREE.Color('#ff7a59');
    const red = std('#ee5a3c');
    const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), red)); body.scale.set(1.2, 0.7, 1); body.position.y = 0.6;
    for (const s of [-1, 1]) {
      const eyeStalk = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), dark)); eyeStalk.position.set(0.25 * s, 1.2, 0.35);
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), std('#ffffff'))); eye.position.set(0.25 * s, 1.4, 0.35);
      const pupil = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), dark)); pupil.position.set(0.25 * s, 1.4, 0.46);
      const claw = add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), red)); claw.scale.set(1, 0.8, 1.3); claw.position.set(0.95 * s, 0.7, 0.45);
      for (let k = 0; k < 3; k++) {
        const leg = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 4, 6), red));
        leg.position.set(0.7 * s, 0.25, -0.3 + k * 0.3); leg.rotation.z = 0.9 * s;
      }
    }
    const ant = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), dark)); ant.position.set(0, 1.3, -0.2);
    const bulb = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ff7a59', emissiveIntensity: 1.5 })));
    bulb.position.set(0, 1.58, -0.2);
    tick = (t) => { g.rotation.z = Math.sin(t * 2) * 0.03; };
  } else if (type === 'plugin') {
    accent = new THREE.Color('#ffc857');
    const box = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.9), wood)); box.position.y = 0.4;
    const lid = add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.5, 14, 1, false, 0, Math.PI), wood));
    lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.set(0, 0.8, 0);
    lid.scale.set(1, 1, 1);
    const band = std('#c8a24a', { metalness: 0.6, roughness: 0.35 });
    for (const x of [-0.5, 0.5]) { const b = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.86, 0.96), band)); b.position.set(x, 0.42, 0); }
    const lock = add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.1), band)); lock.position.set(0, 0.75, 0.48);
    const gem = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#ffb703', emissiveIntensity: 1.2 })));
    gem.position.y = 1.65;
    tick = (t) => { gem.rotation.y = t * 1.5; gem.position.y = 1.65 + Math.sin(t * 2) * 0.08; };
  } else if (type === 'mobile') {
    accent = new THREE.Color('#ff9ac1');
    const base = add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.35, 10), wood)); base.position.y = 0.18;
    const post = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), dark)); post.position.y = 0.8;
    const phone = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.1, 0.07), std('#1b2430'))); phone.position.y = 1.7; phone.rotation.x = -0.18;
    const scrM = new THREE.MeshStandardMaterial({ color: '#102030', emissive: '#ff9ac1', emissiveIntensity: 0.9 });
    const scr = add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.95, 0.02), scrM)); scr.position.set(0, 1.7, 0.045); scr.rotation.x = -0.18;
    const heart = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshStandardMaterial({ color: '#ff7a8a', emissive: '#ff5a7a', emissiveIntensity: 1.2 }))); heart.position.set(0, 2.55, 0);
    tick = (t) => { heart.rotation.y = t * 1.6; heart.position.y = 2.55 + Math.sin(t * 2.4) * 0.08; scrM.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.2; };
  } else if (type === 'device') {
    accent = new THREE.Color('#ff9a6a');
    const desk = add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.9, 10), wood)); desk.position.y = 0.45;
    const body = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.12), std('#0a0d12'))); body.position.set(0, 1.25, 0); body.rotation.x = -0.12;
    const scrM = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff7a59', emissiveIntensity: 1.1 });
    const scr = add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.5, 0.02), scrM)); scr.position.set(0, 1.25, 0.07); scr.rotation.x = -0.12;
    const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.01), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc857').multiplyScalar(2) }))); bar.position.set(-0.1, 1.28, 0.085); bar.rotation.x = -0.12;
    tick = (t) => { scrM.emissiveIntensity = 0.9 + Math.sin(t * 2.2) * 0.25; bar.scale.x = 0.7 + Math.sin(t * 1.4) * 0.25; };
  } else {
    accent = new THREE.Color('#b388ff');
    const stone = std('#9a9fa8');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), stone)); s.position.set(Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8);
    }
    for (let i = 0; i < 3; i++) {
      const lg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8), std('#6e4a2c')));
      lg.rotation.z = Math.PI / 2; lg.rotation.y = (i / 3) * Math.PI; lg.position.y = 0.15;
    }
    const fireMat = new THREE.MeshBasicMaterial({ color: '#ffb347' });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 8), fireMat); flame.position.y = 0.75; g.add(flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 8), new THREE.MeshBasicMaterial({ color: '#fff3b0' })); core.position.y = 0.65; g.add(core);
    const light = new THREE.PointLight('#ff9d4a', 6, 9, 2); light.position.y = 1; g.add(light);
    tick = (t) => {
      const f = 1 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17) * 0.05;
      flame.scale.set(1 / f, f, 1 / f); core.scale.set(1 / f, f, 1 / f);
      light.intensity = 5 + Math.sin(t * 13) * 1.2;
    };
  }
  return { group: g, accent, tick };
}
