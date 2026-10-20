import * as THREE from 'three';
import { heightAt, islandRadius } from './terrain';
import type { Obstacle } from './props';
import { waveHeight } from './water';
import { batchStatic } from './batch';
import { stoneGeometry, stoneMaterial } from './stone';

const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  parent.add(o);
  return o;
}
const rock = (r: number, seed: number, sy = 1) => stoneGeometry(r, seed, sy);
const world = (g: THREE.Object3D, lx: number, lz: number) => { g.updateMatrixWorld(true); const v = g.localToWorld(new THREE.Vector3(lx, 0, lz)); return { x: v.x, z: v.z }; };

/* ---------- casco del barco varado ---------- */
const L = 9.5, BEAM = 1.9, DEPTH = 1.5, S_MIN = -0.5;
const widthAt = (s: number) => (s > 0 ? Math.pow(1 - Math.pow(s, 2.2), 0.6) : 1 - Math.pow(-s, 6) * 0.15);
const liftAt = (s: number) => 1.5 * Math.pow(Math.abs(s), 3) * (s > 0 ? 1 : 0.5);

function hullGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, 1, 18, 14, true, Math.PI, Math.PI);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color('#b5603a'), b = new THREE.Color('#9a4a2c');
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const s = THREE.MathUtils.lerp(S_MIN, 1, py + 0.5); // posición a lo largo del barco
    const w = Math.max(widthAt(s), 0.02);
    pos.setXYZ(i, s * (L / 2), px * DEPTH * Math.pow(w, 0.6) + liftAt(s), pz * BEAM * w);
    const ring = Math.round((Math.atan2(px, pz) + Math.PI) / (Math.PI / 18));
    (ring % 2 ? a : b).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export interface Diorama {
  update(t: number): void;
  obstacles: Obstacle[];
}

export function buildDiorama(scene: THREE.Object3D): Diorama {
  const obstacles: Obstacle[] = [];
  const ticks: ((t: number) => void)[] = [];
  const WOOD = mat('#d08c5a'), WOOD_D = mat('#7d3d26'), WOOD_L = mat('#e0a572');
  const GREY = stoneMaterial('#b3a08c'), GREY_D = stoneMaterial('#8f7d6e');

  /* ---------- barco varado ---------- */
  {
    const a = 1.38, r = islandRadius(a) * 0.93;
    const ship = new THREE.Group();
    ship.position.set(Math.cos(a) * r, heightAt(Math.cos(a) * r, Math.sin(a) * r) + 0.7, Math.sin(a) * r);
    ship.rotation.set(0.12, -a + 0.25, 0.1, 'YXZ'); // proa hacia el mar, escorado
    const hull = new THREE.Mesh(hullGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
    hull.castShadow = hull.receiveShadow = true;
    ship.add(hull);

    // cubierta
    for (let k = 0; k < 15; k++) {
      const s = S_MIN + 0.04 + k * 0.095;
      if (s > 0.95 || (k === 3 || k === 4)) continue; // huecos rotos
      const w = Math.max(widthAt(s), 0.05);
      add(ship, new THREE.BoxGeometry(0.62, 0.08, 2 * BEAM * w * 0.93), k % 2 ? WOOD : WOOD_L, s * (L / 2), -0.15 + liftAt(s) * 0.8, 0);
    }
    // costillas al aire en la popa rota
    [-2.9, -3.5, -4.1].forEach((x, i) => {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.1, 0); pivot.rotation.y = Math.PI / 2;
      const rib = add(pivot, new THREE.TorusGeometry(1, 0.07, 5, 12, Math.PI), WOOD_D);
      rib.rotation.z = Math.PI; rib.scale.set(BEAM * (1 - i * 0.07), DEPTH * (1 - i * 0.12), 1);
      ship.add(pivot);
    });
    // barandilla con huecos
    for (let k = 0; k < 11; k++) {
      const s = -0.4 + k * 0.13;
      if (s > 0.9) break;
      const w = widthAt(s);
      for (const side of [-1, 1]) {
        if (side === 1 && (k === 4 || k === 5)) continue;
        add(ship, new THREE.CylinderGeometry(0.04, 0.05, 0.8, 5), WOOD_D, s * (L / 2), 0.35 + liftAt(s) + 0.45, side * BEAM * w * 0.97);
      }
    }
    for (const side of [-1, 1]) {
      const rail = add(ship, new THREE.BoxGeometry(L * 0.7, 0.07, 0.09), WOOD_D, L * 0.12, 1.2 + liftAt(0.2) * 0.6, side * BEAM * 0.95);
      rail.rotation.z = 0.06;
      if (side === 1) rail.scale.x = 0.55;
    }
    // palo roto con vela rasgada
    const mast = add(ship, new THREE.CylinderGeometry(0.09, 0.14, 4.6, 7), WOOD_D, 0.4, 2.6, 0.2);
    mast.rotation.z = -0.38; mast.rotation.x = 0.1;
    const sail = add(ship, new THREE.PlaneGeometry(1.6, 1.3, 4, 3), mat('#efe0c0', { side: THREE.DoubleSide }), 0.1, 3.4, 0.55);
    sail.rotation.y = 0.5; sail.rotation.z = -0.3;
    // escalones a cubierta
    for (let i = 0; i < 4; i++) add(ship, new THREE.BoxGeometry(0.5, 0.1, 1.1), WOOD_L, -2.2 + i * 0.5, 0.25 + i * 0.28, 0.9);
    batchStatic(ship);
    scene.add(ship);
    for (const lx of [-2.5, -0.8, 0.9, 2.6, 4]) { const w = world(ship, lx, 0); obstacles.push({ x: w.x, z: w.z, r: 1.5 }); }
  }

  /* ---------- formación de roca con cueva, enredaderas y nido ---------- */
  {
    const a = 2.15, r = islandRadius(a) * 0.86;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const g = new THREE.Group(); g.position.set(cx, heightAt(cx, cz) - 0.3, cz); g.rotation.y = Math.PI / 2 - a + 0.2; // la boca de la cueva mira al mar
    // fondo oscuro de la cueva
    add(g, new THREE.BoxGeometry(3.6, 3.2, 0.3), new THREE.MeshBasicMaterial({ color: '#1b1622' }), 0, 1.6, -1.4);
    const pillars: [number, number, number, number][] = [[-2.7, 0, 0, 2.3], [2.7, 0, 0, 2.2], [-1.5, 0, -2.3, 2.0], [1.7, 0, -2.2, 2.2]];
    for (const [px, py, pz, pr] of pillars) add(g, rock(pr, px * 3 + pz, 1.5), px < 0 ? GREY : GREY_D, px, py + 1.7, pz);
    add(g, rock(2.9, 5, 0.65), GREY, 0, 4.0, -1.3).scale.x = 1.6;               // techo
    add(g, rock(1.7, 11, 1.2), GREY_D, -1.2, 5.3, -2.0);
    add(g, rock(1.5, 17, 1.5), GREY, 1.2, 5.6, -2.4);
    add(g, rock(1.0, 3, 0.9), GREY, 3.2, 0.5, 1.4);
    add(g, rock(0.8, 8, 0.9), GREY_D, -3.6, 0.4, 1.9);
    // nido con huevos en lo alto
    add(g, new THREE.TorusGeometry(0.42, 0.12, 5, 9), mat('#8a5a35'), 1.2, 7.1, -2.4).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) add(g, new THREE.SphereGeometry(0.17, 8, 6), mat('#f4ecd4'), 1.2 + (i - 1) * 0.2, 7.12, -2.4 + (i % 2) * 0.12);
    batchStatic(g);
    scene.add(g);
    for (const [px, , pz, pr] of pillars) { const w = world(g, px, pz); obstacles.push({ x: w.x, z: w.z, r: pr * 0.85 }); }

    // enredaderas: cadenas de hojas colgando de la roca
    const leafGeo = new THREE.IcosahedronGeometry(0.15, 0); leafGeo.scale(1.4, 0.8, 1);
    const anchors = [[-2.7, 3.7, 2.2], [2.6, 3.5, 2.1], [-1.2, 4.2, 0.8], [1.0, 4.2, 0.9], [-3.4, 2.6, 1.1], [3.3, 2.7, 1.0], [0, 4.4, 0.5], [-0.6, 3.3, 2.4], [1.8, 3.2, 2.3]];
    const leaves: THREE.Vector3[] = [];
    for (const [ax, ay, az] of anchors) {
      for (let c = 0; c < 9; c++) {
        const ox = ax + (Math.random() - 0.5) * 1.8, oz = az + (Math.random() - 0.5) * 0.6, len = 3 + Math.floor(Math.random() * 7);
        for (let k = 0; k < len; k++) leaves.push(new THREE.Vector3(ox + (Math.random() - 0.5) * 0.15, ay - k * 0.32, oz));
      }
    }
    const uTime = { value: 0 };
    const vm = new THREE.MeshStandardMaterial({ color: '#4fbf4a', roughness: 0.8, flatShading: true });
    vm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 ip = instanceMatrix[3].xyz;\ntransformed.x += sin(uTime * 1.4 + ip.y * 1.7 + ip.x) * 0.08;');
    };
    const vines = new THREE.InstancedMesh(leafGeo, vm, leaves.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), tint = new THREE.Color();
    leaves.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      m4.compose(p, q, new THREE.Vector3().setScalar(1.1 + Math.random() * 1.0));
      vines.setMatrixAt(i, m4);
      tint.setHSL(0.27 + Math.random() * 0.06, 0.6, 0.35 + Math.random() * 0.2);
      vines.setColorAt(i, tint);
    });
    vines.castShadow = true;
    g.add(vines);
    ticks.push((t) => { uTime.value = t; });

    // espada en la piedra, junto a la cueva
    const sa = a - 0.2, sr = islandRadius(sa) * 0.82, sx = Math.cos(sa) * sr, sz = Math.sin(sa) * sr;
    const s = new THREE.Group(); s.position.set(sx, heightAt(sx, sz), sz);
    add(s, rock(0.7, 4, 0.7), GREY_D, 0, 0.3, 0);
    const steel = new THREE.MeshStandardMaterial({ userData: { unique: true }, color: '#cfe3f5', metalness: 0.8, roughness: 0.25, emissive: '#5aa9ff', emissiveIntensity: 0.35 });
    add(s, new THREE.BoxGeometry(0.1, 1.3, 0.03), steel, 0, 1.15, 0);
    add(s, new THREE.BoxGeometry(0.5, 0.07, 0.08), mat('#c8a24a', { metalness: 0.6 }), 0, 1.85, 0);
    add(s, new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6), mat('#4a2c1a'), 0, 2.06, 0);
    s.rotation.y = Math.random() * 6;
    scene.add(s);
    obstacles.push({ x: sx, z: sz, r: 0.8 });
    ticks.push((t) => { steel.emissiveIntensity = 0.5 + Math.sin(t * 2) * 0.3; });
  }

  // los helechos de la cueva y el barco los pone nature.ts (con viento y se apartan al pasar)

  /* ---------- tablones flotando en la cala ---------- */
  {
    const plank = new THREE.BoxGeometry(1.1, 0.07, 0.22);
    const floaters: { m: THREE.Mesh; x: number; z: number; ph: number }[] = [];
    let guard = 0;
    while (floaters.length < 7 && guard++ < 500) {
      const aa = 1.75 + (Math.random() - 0.5) * 0.7, rr = islandRadius(aa) + 1 + Math.random() * 5;
      const x = Math.cos(aa) * rr, z = Math.sin(aa) * rr;
      if (heightAt(x, z) > -0.35) continue;
      const m = add(scene, plank, floaters.length % 2 ? WOOD : WOOD_D, x, 0, z);
      m.userData.dynamic = true;
      m.rotation.y = Math.random() * 3;
      floaters.push({ m, x, z, ph: Math.random() * 6 });
    }
    ticks.push((t) => {
      for (const f of floaters) {
        f.m.position.y = waveHeight(f.x, f.z, t) + 0.04;
        f.m.rotation.z = Math.sin(t * 1.3 + f.ph) * 0.08;
        f.m.rotation.x = Math.cos(t * 1.1 + f.ph) * 0.06;
      }
    });
  }

  return { obstacles, update: (t) => { for (const f of ticks) f(t); } };
}
