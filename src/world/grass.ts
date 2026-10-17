import * as THREE from 'three';
import { heightAt, pathMask } from './terrain';

/** Hierba instanciada con viento en el vertex shader: una sola draw call. */
export function buildGrass(count: number): { group: THREE.Group; update(t: number): void } {
  // hoja: 3 tramos, afilada hacia la punta
  const segs = 3, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const base = new THREE.Color('#3f9d3f'), tip = new THREE.Color('#c9f06a'), c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, w = 0.5 * (1 - u * u * 0.92);
    for (const s of [-1, 1]) {
      pos.push(s * w, u, 0);
      c.copy(base).lerp(tip, u);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bend = position.y * position.y;
        vec3 ip = instanceMatrix[3].xyz;
        transformed.x += (sin(uTime * 1.6 + ip.x * 0.45 + ip.z * 0.3) + sin(uTime * 2.7 + ip.z * 0.9) * 0.4) * bend * 0.22;
        transformed.z += cos(uTime * 1.3 + ip.x * 0.35) * bend * 0.14;`);
  };

  // posiciones primero; después se reparten en bloques de 16 m para que el motor pueda descartar los que no se ven
  const CELL = 16;
  const chunks = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let n = 0, guard = 0;
  while (n < count && guard++ < count * 12) {
    const x = (Math.random() - 0.5) * 60, z = (Math.random() - 0.5) * 60, h = heightAt(x, z);
    if (h < 1.0 || h > 5.4 || pathMask(x, z) > 0.25) continue;
    const hh = 0.35 + Math.random() * 0.55;
    p.set(x, h - 0.02, z);
    q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
    s.set(0.07 + Math.random() * 0.05, hh, 1);
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let list = chunks.get(key);
    if (!list) { list = []; chunks.set(key, list); }
    list.push({ m: new THREE.Matrix4().compose(p, q, s), c: new THREE.Color().setHSL(0.26 + Math.random() * 0.07, 0.65, 0.42 + Math.random() * 0.2) });
    n++;
  }
  const group = new THREE.Group();
  for (const list of chunks.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, it.c); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.boundingSphere!.radius += 0.6; // margen para el movimiento del viento
    group.add(mesh);
  }
  return { group, update: (t: number) => { uTime.value = t; } };
}
