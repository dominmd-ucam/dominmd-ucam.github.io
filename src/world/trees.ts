import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, islandRadius, pathMask } from './terrain';
import type { Obstacle } from './props';

/** Árboles de copa redonda y blanda, al estilo de los juegos tipo Petit Island: tronco grueso y copa de esferas con degradado. */
function canopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: [number, number, number, number][] = [[0, 0, 0, 1.9], [1.3, -0.3, 0.4, 1.35], [-1.2, -0.2, -0.5, 1.4], [0.3, 1.1, -0.3, 1.25], [-0.2, -0.4, 1.3, 1.2]];
  const low = new THREE.Color('#3da34a'), high = new THREE.Color('#b4e460'), c = new THREE.Color();
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, 3);
    const p = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const wob = 1 + Math.sin(px * 3.1 + py * 2.3 + pz * 4.1 + x) * 0.07; // contorno orgánico
      p.setXYZ(i, px * wob + x, py * wob + y, pz * wob + z);
      c.copy(low).lerp(high, THREE.MathUtils.clamp((py * wob + y + 1.6) / 3.8, 0, 1));
      c.toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  const m = mergeGeometries(parts)!;
  m.computeVertexNormals();
  return m;
}

export function buildTrees(scene: THREE.Scene, obstacles: Obstacle[], count: number): { update(t: number): void; blocks(p: THREE.Vector3): boolean } {
  const spots: { x: number; z: number; s: number; a: number }[] = [];
  let seed = 20241017;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); // posiciones reproducibles
  let guard = 0;
  while (spots.length < count && guard++ < 4000) {
    const a = rand() * Math.PI * 2, r = islandRadius(a) * (0.32 + rand() * 0.45);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
    if (h < 1.15 || h > 3.4 || pathMask(x, z) > 0.05) continue;
    if (Math.hypot(x, z) < 6 || Math.hypot(x - 6, z - 12) < 6) continue; // plaza central y punto de inicio despejados
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2.4)) continue;
    if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 5)) continue;
    spots.push({ x, z, s: 0.75 + rand() * 0.55, a: rand() * 6.28 });
  }

  const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const uTime = { value: 0 };
  canopyMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        float sway = sin(uTime * 0.9 + ip.x * 0.7 + ip.z * 0.5);
        transformed.x += sway * 0.07 * (position.y + 1.6);
        transformed.z += cos(uTime * 0.7 + ip.z) * 0.05 * (position.y + 1.6);`);
  };
  const canopy = new THREE.InstancedMesh(canopyGeometry(), canopyMat, spots.length);
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 2.6, 8); trunkGeo.translate(0, 1.3, 0);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#a86b40', roughness: 0.9 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  spots.forEach((p, i) => {
    const y = heightAt(p.x, p.z) - 0.1;
    q.setFromAxisAngle(up, p.a);
    m.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    trunk.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(p.x, y + 3.9 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    canopy.setMatrixAt(i, m);
    tint.setHSL(0.27 + Math.random() * 0.05, 0.9, 0.9 + Math.random() * 0.2);
    canopy.setColorAt(i, tint);
    obstacles.push({ x: p.x, z: p.z, r: 0.7 * p.s });
  });
  for (const o of [canopy, trunk]) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; scene.add(o); }
  return {
    update: (t) => { uTime.value = t; },
    /** ¿está el punto (la cámara) dentro de alguna copa? */
    blocks: (p) => spots.some((s) => {
      const y0 = heightAt(s.x, s.z) + 2.0 * s.s;
      return p.y > y0 && p.y < y0 + 5.5 * s.s && Math.hypot(p.x - s.x, p.z - s.z) < 2.9 * s.s;
    }),
  };
}
