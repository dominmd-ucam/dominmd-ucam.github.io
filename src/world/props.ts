import * as THREE from 'three';
import { heightAt, islandRadius, pathMask } from './terrain';
import { batchStatic } from './batch';

export interface Obstacle { x: number; z: number; r: number }

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------- palmeras ---------- */
const leafGeo = (() => {
  const g = new THREE.PlaneGeometry(1, 1, 4, 10);
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
})();
const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, flatShading: true });
const trunkMat = std('#b97a4a', { flatShading: true });
const cocoMat = std('#5b3b22');

export interface Palm { group: THREE.Group; crown: THREE.Group; phase: number }

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
  // tronco escalonado: anillos de cono apilados siguiendo la curva
  const trunk = new THREE.Group();
  group.add(trunk);
  const rings = 11, up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < rings; i++) {
    const a = curve.getPoint(i / rings), b = curve.getPoint((i + 1) / rings), v = b.clone().sub(a);
    const rb = 0.36 - i * 0.016, rt = rb - 0.03;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, v.length() * 1.18, 7), trunkMat);
    seg.position.copy(a).add(b).multiplyScalar(0.5);
    seg.quaternion.setFromUnitVectors(up, v.normalize());
    seg.rotateY(i * 0.7);
    seg.castShadow = true;
    trunk.add(seg);
  }
  const crown = new THREE.Group();
  crown.position.copy(pts[pts.length - 1]);
  group.add(crown);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.rotation.y = (i / n) * Math.PI * 2 + rnd() * 0.3;
    leaf.rotation.x = -0.15 + rnd() * 0.3;
    leaf.scale.setScalar(0.85 + rnd() * 0.3);
    leaf.castShadow = true;
    crown.add(leaf);
  }
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), cocoMat);
    const a = (i / 3) * Math.PI * 2;
    c.position.set(Math.cos(a) * 0.25, -0.25, Math.sin(a) * 0.25);
    c.castShadow = true;
    crown.add(c);
  }
  // fusionamos tronco y copa por separado: 3 llamadas de dibujo por palmera en vez de ~25 (la copa se mece como grupo)
  batchStatic(trunk);
  batchStatic(crown);
  group.userData.dynamic = true;
  return { group, crown, phase: rnd() * 6 };
}

export function buildScenery(scene: THREE.Object3D) {
  const rnd = rand(7);
  const palms: Palm[] = [];
  const obstacles: Obstacle[] = [];
  const spots: [number, number][] = [
    [0.3, 0.7], [0.8, 0.8], [1.5, 0.74], [2.0, 0.6], [2.8, 0.76], [3.5, 0.62],
    [4.2, 0.78], [4.9, 0.66], [5.6, 0.7], [0.1, 0.3], [2.4, 0.42], [4.1, 0.38],
  ];
  for (const [a, f] of spots) {
    const r = islandRadius(a) * f;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 0.7) continue;
    const p = makePalm(x, z, 0.85 + rnd() * 0.4, rnd);
    scene.add(p.group); palms.push(p);
    obstacles.push({ x, z, r: 0.55 });
  }

  // rocas
  const rockMats = [std('#c9795a', { flatShading: true }), std('#b86a4f', { flatShading: true }), std('#a7adb4', { flatShading: true })];
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2, f = i < 12 ? 0.9 + rnd() * 0.2 : 0.3 + rnd() * 0.55;
    const r = islandRadius(a) * f, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < -0.8 || h > 3.4) continue;
    const s = 0.35 + rnd() * 0.8;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), rockMats[i % 3]);
    const q = m.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < q.count; k++) {
      // el desplazamiento depende de la posición (no del índice) para no abrir grietas en las costuras
      const j = 1 + Math.sin(q.getX(k) * 91.7 + q.getY(k) * 47.3 + q.getZ(k) * 63.1 + i) * 0.16;
      q.setXYZ(k, q.getX(k) * j, q.getY(k) * j, q.getZ(k) * j);
    }
    m.geometry.computeVertexNormals();
    m.position.set(x, Math.max(h, -0.6) + s * 0.25, z);
    m.scale.y = 0.7; m.rotation.y = rnd() * 6;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if (s > 0.55) obstacles.push({ x, z, r: s * 0.9 });
  }

  // arbustos y flores
  const bushMats = [std('#4fb866'), std('#3ca457'), std('#63c874')];
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, r = islandRadius(a) * (0.3 + rnd() * 0.35);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
    if (h < 0.9) continue;
    const s = 0.5 + rnd() * 0.5;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 2), bushMats[i % 3]);
    m.position.set(x, h + s * 0.4, z); m.scale.y = 0.75;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    obstacles.push({ x, z, r: s * 0.8 });
  }
  // flores: 2 mallas instanciadas (tallos y flores) en vez de ~140 mallas sueltas
  const petalColors = ['#ff7a59', '#ffc857', '#ff9ac1', '#ffffff'].map((c) => new THREE.Color(c));
  const spots2: { x: number; z: number; h: number; i: number }[] = [];
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, r = islandRadius(a) * (0.2 + rnd() * 0.6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
    if (h < 1.0 || pathMask(x, z) > 0.2) continue;
    spots2.push({ x, z, h, i });
  }
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4).translate(0, 0.15, 0), std('#3a9a4a'), spots2.length);
  const blooms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 1).translate(0, 0.32, 0), std('#ffffff'), spots2.length);
  const fm = new THREE.Matrix4();
  spots2.forEach((f, k) => {
    fm.makeTranslation(f.x, f.h, f.z);
    stems.setMatrixAt(k, fm); blooms.setMatrixAt(k, fm); blooms.setColorAt(k, petalColors[f.i % 4]);
  });
  scene.add(stems, blooms);
  return { palms, obstacles };
}

/* ---------- objetos interactivos (placeholders) ---------- */
export type ProjectType = 'web' | 'bot' | 'plugin' | 'cli';

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
