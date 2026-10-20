import * as THREE from 'three';
import { DOCK, HILL, ISLET, dockStart, heightAt, islandRadius } from './terrain';
import type { Obstacle } from './props';
import { waveHeight } from './water';
import { batchStatic } from './batch';
import { roughen, stoneGeometry, stoneMaterial } from './stone';

const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

const WOOD = mat('#d9a05b'), WOOD_D = mat('#a8703a'), WOOD_L = mat('#ecc384');
const RED = mat('#e0533d'), WHITE = mat('#f6f1e6'), ROCK = stoneMaterial('#c9795a', 0.8), ROCK_D = stoneMaterial('#a95f48', 0.8);

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = cast; o.receiveShadow = true;
  parent.add(o);
  return o;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Facetado irregular: desplaza vértices según su posición (sin abrir grietas). */

const FLAME = new THREE.Color('#ffb347');

export interface Landmarks {
  update(t: number, night: number): void;
  obstacles: Obstacle[];
}

export function buildLandmarks(scene: THREE.Object3D): Landmarks {
  const obstacles: Obstacle[] = [];
  const ticks: ((t: number, night: number) => void)[] = [];

  /* ---------- cabaña ---------- */
  {
    const [hx, hz] = [-14.5, -3];
    const g = new THREE.Group(); g.position.set(hx, heightAt(hx, hz) - 0.05, hz); g.rotation.y = Math.PI / 2 + 0.25;
    add(g, box(3.4, 0.35, 3.4), WOOD_D, 0, 0.55, 0);
    for (const [px, pz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) add(g, new THREE.CylinderGeometry(0.12, 0.15, 0.9, 6), WOOD_D, px, 0.2, pz);
    // paredes (con puerta en el frente, +z)
    add(g, box(3.2, 2.2, 0.15), WOOD, 0, 1.85, -1.55);
    add(g, box(0.15, 2.2, 3.2), WOOD, -1.55, 1.85, 0);
    add(g, box(0.15, 2.2, 3.2), WOOD, 1.55, 1.85, 0);
    add(g, box(1.1, 2.2, 0.15), WOOD, -1.05, 1.85, 1.55);
    add(g, box(1.1, 2.2, 0.15), WOOD, 1.05, 1.85, 1.55);
    add(g, box(1.0, 0.6, 0.15), WOOD, 0, 2.65, 1.55);
    add(g, box(0.9, 0.9, 0.05), mat('#79d4ee', { emissive: '#79d4ee', emissiveIntensity: 0.2 }), 1.56, 2.0, 0.2, false).rotation.y = Math.PI / 2;
    // tejado a dos aguas
    const roofM = mat('#58c468');
    for (const s of [-1, 1]) {
      const r = add(g, box(2.4, 0.18, 4.0), roofM, s * 1.0, 3.45, 0);
      r.rotation.z = -s * 0.78;
    }
    add(g, box(0.3, 0.2, 4.1), WOOD_D, 0, 4.1, 0);
    // escalones
    for (let i = 0; i < 3; i++) add(g, box(1.0, 0.16, 0.45), WOOD_L, 0, 0.12 + i * 0.2, 2.15 - i * 0.4);
    batchStatic(g);
    scene.add(g);
    obstacles.push({ x: hx, z: hz, r: 2.3 });

    // barriles y cofre junto a la cabaña
    const bx = hx + 2.6 * Math.cos(g.rotation.y + 0.9), bz = hz - 2.6 * Math.sin(g.rotation.y + 0.9);
    for (let i = 0; i < 2; i++) {
      const b = add(scene, new THREE.CylinderGeometry(0.42, 0.38, 0.8, 9), WOOD_D, bx + i * 0.9, heightAt(bx, bz) + 0.4, bz + i * 0.3);
      b.rotation.y = i;
      obstacles.push({ x: bx + i * 0.9, z: bz + i * 0.3, r: 0.5 });
    }
  }

  /* ---------- faro ---------- */
  {
    const [lx, lz] = HILL;
    const g = new THREE.Group(); g.position.set(lx, heightAt(lx, lz) - 0.3, lz);
    const seg = 1.35;
    for (let i = 0; i < 5; i++) add(g, new THREE.CylinderGeometry(1.35 - (i + 1) * 0.09, 1.35 - i * 0.09, seg, 10), i % 2 ? RED : WHITE, 0, seg * (i + 0.5), 0);
    add(g, new THREE.CylinderGeometry(1.4, 1.1, 0.25, 12), WOOD_D, 0, seg * 5 + 0.12, 0);
    const glassM = new THREE.MeshStandardMaterial({ color: '#fff6c9', emissive: '#ffd36a', emissiveIntensity: 0, transparent: true, opacity: 0.85, roughness: 0.2 });
    add(g, new THREE.CylinderGeometry(0.62, 0.62, 0.9, 10), glassM, 0, seg * 5 + 0.7, 0, false);
    add(g, new THREE.ConeGeometry(0.85, 0.8, 10), RED, 0, seg * 5 + 1.55, 0);
    const top = seg * 5 + 0.7;
    const beamM = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 3.2, 26, 12, 1, true), beamM);
    beam.geometry.translate(0, -13, 0); beam.geometry.rotateZ(Math.PI / 2); // apunta a +x
    glassM.userData.unique = true;
    const pivot = new THREE.Group(); pivot.userData.dynamic = true; pivot.position.y = top; pivot.add(beam, beam.clone());
    pivot.children[1].rotation.y = Math.PI;
    g.add(pivot);
    const light = new THREE.PointLight('#ffd36a', 0, 30, 2); light.position.y = top; g.add(light);
    batchStatic(g);
    scene.add(g);
    obstacles.push({ x: lx, z: lz, r: 1.5 });
    ticks.push((t, night) => {
      const on = THREE.MathUtils.smoothstep(night, 0.25, 0.7);
      glassM.emissiveIntensity = on * 3;
      beamM.opacity = on * 0.22;
      light.intensity = on * 14;
      light.visible = on > 0.01; // una luz apagada fuera de la escena no cuesta nada en los shaders
      pivot.rotation.y = t * 0.9;
    });
  }

  /* ---------- muelle + balsa ---------- */
  {
    const g = new THREE.Group(); g.rotation.y = -DOCK.a;
    const u0 = dockStart();
    const n = Math.round(DOCK.len / 0.62);
    for (let k = 0; k < n; k++) {
      const b = add(g, box(0.56, 0.1, DOCK.width), k % 2 ? WOOD : WOOD_L, u0 + k * 0.62 + 0.3, DOCK.y - 0.06, 0);
      b.rotation.y = (Math.sin(k * 7.1) * 0.02);
      if (k % 4 === 0) for (const v of [-1, 1]) add(g, new THREE.CylinderGeometry(0.1, 0.12, 3.2, 7), WOOD_D, u0 + k * 0.62 + 0.3, -0.9, v * (DOCK.width / 2 + 0.05));
    }
    for (const v of [-1, 1]) add(g, box(DOCK.len, 0.08, 0.1), WOOD_D, u0 + DOCK.len / 2, DOCK.y + 0.02, v * (DOCK.width / 2));
    batchStatic(g);
    scene.add(g);

    // balsa con vela, amarrada junto al final del muelle
    const raft = new THREE.Group();
    raft.userData.dynamic = true;
    for (let i = 0; i < 6; i++) add(raft, new THREE.CylinderGeometry(0.22, 0.22, 3.6, 7), i % 2 ? WOOD : WOOD_L, (i - 2.5) * 0.46, 0, 0).rotation.x = Math.PI / 2;
    for (const z of [-0.9, 0.9]) add(raft, box(2.9, 0.1, 0.18), WOOD_D, 0, 0.22, z);
    add(raft, new THREE.CylinderGeometry(0.06, 0.07, 3.2, 6), WOOD_D, 0, 1.8, 0);
    add(raft, box(0.05, 0.05, 1.8), WOOD_D, 0, 2.9, 0);
    const sail = add(raft, new THREE.PlaneGeometry(1.7, 1.5, 4, 4), mat('#f2e2bd', { side: THREE.DoubleSide }), 0, 2.1, 0);
    sail.rotation.y = Math.PI / 2;
    const c = Math.cos(DOCK.a), s = Math.sin(DOCK.a);
    const ru = u0 + DOCK.len - 1.0, rv = 2.4;
    const rx = ru * c - rv * s, rz = ru * s + rv * c;
    raft.rotation.y = -DOCK.a + 0.15;
    scene.add(raft);
    ticks.push((t) => {
      raft.position.set(rx, waveHeight(rx, rz, t) * 0.8 + 0.12, rz);
      raft.rotation.z = Math.sin(t * 1.1) * 0.04; raft.rotation.x = Math.cos(t * 0.9) * 0.03;
    });
  }

  /* ---------- arco de roca y agujas en el mar ---------- */
  {
    const a = 0.2, r = islandRadius(a) + 7;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * r, -1.6, Math.sin(a) * r); g.rotation.y = -a + Math.PI / 2 + 0.3;
    const arch = add(g, roughen(new THREE.TorusGeometry(3.4, 1.15, 14, 28, Math.PI), 1.15, 0.5, 2), ROCK);
    arch.scale.set(1, 1.25, 0.9);
    for (const s of [-1, 1]) {
      add(g, stoneGeometry(1.7, s + 3, 1, 3), ROCK_D, s * 3.3, 0.2, 0.2).scale.set(1, 1.1, 0.9);
    }
    batchStatic(g);
    scene.add(g);

    const stacks: [number, number, number][] = [[a + 0.13, 11, 4.2], [a - 0.16, 9, 3.2], [-2.2, 9, 3.6], [2.4, 8, 3.0]];
    for (const [sa, sd, sh] of stacks) {
      const rr = islandRadius(sa) + sd;
      const cone = add(scene, roughen(new THREE.ConeGeometry(0.9, sh, 12, 8), 0.9, 0.45, sa), ROCK, Math.cos(sa) * rr, -1.4 + sh / 2 - 0.4, Math.sin(sa) * rr);
      cone.rotation.y = sa * 3;
    }
  }

  /* ---------- islote con palmeras (decorado, en el horizonte cercano) ---------- */
  {
    const [ix, iz] = ISLET;
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4, d = 1 + i * 0.5;
      const x = ix + Math.cos(a) * d, z = iz + Math.sin(a) * d;
      const h = heightAt(x, z);
      if (h > 0.3) {
        const t = add(scene, new THREE.CylinderGeometry(0.14, 0.2, 3.2 + i, 6), WOOD_D, x, h + 1.6 + i / 2, z);
        t.rotation.z = 0.12 * (i - 1);
      }
    }
  }

  /* ---------- tumbonas y sombrilla en la playa ---------- */
  {
    const [sx, sz] = [11.5, 14.5];
    const h = heightAt(sx, sz);
    if (h > 0.2) {
      const g = new THREE.Group(); g.position.set(sx, h, sz); g.rotation.y = -0.6;
      add(g, new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), WHITE, 0, 1.3, 0);
      add(g, new THREE.ConeGeometry(1.8, 0.7, 8, 1, true), mat('#ff7a59', { side: THREE.DoubleSide }), 0, 2.5, 0);
      for (const dx of [-1.3, 1.3]) {
        const l = add(g, box(0.7, 0.1, 1.7), mat('#4cc9f0'), dx, 0.35, 0.6); l.rotation.x = -0.1;
        add(g, box(0.7, 0.1, 0.7), mat('#4cc9f0'), dx, 0.6, -0.3).rotation.x = 0.8;
      }
      scene.add(g);
      obstacles.push({ x: sx, z: sz, r: 0.6 });
    }
  }

  /* ---------- antorchas ---------- */
  {
    const flameM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(3) });
    const spots: [number, number][] = [[-12, -8], [-4.5, -4.5], [0.5, 6], [5, 13.5], [-12, 2], [14.5, 9.2]];
    const flames: THREE.Mesh[] = [];
    for (const [x, z] of spots) {
      const h = heightAt(x, z);
      if (h < 0.5) continue;
      const g = new THREE.Group(); g.position.set(x, h, z);
      add(g, new THREE.CylinderGeometry(0.05, 0.07, 1.7, 6), WOOD_D, 0, 0.85, 0);
      add(g, new THREE.CylinderGeometry(0.16, 0.09, 0.22, 7), mat('#5b3b22'), 0, 1.75, 0);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.38, 6), flameM); f.userData.dynamic = true; f.position.y = 2.0; g.add(f); flames.push(f);
      scene.add(g);
    }
    const lamp = new THREE.PointLight('#ffa64a', 0, 14, 2); lamp.position.set(-13.2, 2.2, -2.2); scene.add(lamp);
    ticks.push((t, night) => {
      const on = THREE.MathUtils.smoothstep(night, 0.1, 0.6);
      flameM.color.copy(FLAME).multiplyScalar(0.6 + on * 3.4); // el color base está precalculado: color.set(string) analiza el texto en cada llamada
      for (const f of flames) { const k = 1 + Math.sin(t * 10 + f.position.x * 7) * 0.12; f.scale.set(1 / k, k, 1 / k); }
      lamp.intensity = on * 5 * (0.9 + Math.sin(t * 9) * 0.1);
      lamp.visible = on > 0.01;
    });
  }

  /* ---------- conchas y estrellas de mar ---------- */
  {
    const shell = new THREE.ConeGeometry(0.1, 0.18, 6);
    const star = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 5);
    const shellM = [mat('#ffd7e0'), mat('#fff3e0'), mat('#ffb5a7')], starM = mat('#ff8a5c');
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, r = islandRadius(a) * (0.9 + rnd() * 0.07);
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
      if (h < 0.0 || h > 0.9) continue;
      const m = add(scene, i % 9 === 0 ? star : shell, i % 9 === 0 ? starM : shellM[i % 3], x, h + 0.06, z, false);
      m.rotation.set(Math.PI / 2 * (i % 9 === 0 ? 0 : 1) + rnd() * 0.6, rnd() * 6, rnd() * 0.5);
    }
  }

  return { obstacles, update: (t, night) => { for (const f of ticks) f(t, night); } };
}
