import * as THREE from 'three';
import { heightAt, pathMask } from './terrain';

const BASE = new THREE.Color('#3f9d3f'), TIP = new THREE.Color('#c9f06a');
const NEAR_FULL = 18; // metros hasta los que se dibuja la hoja completa

/** Hoja completa: 3 tramos, afilada hacia la punta (6 triángulos, 8 vértices). */
function bladeFull(): THREE.BufferGeometry {
  const segs = 3, pos: number[] = [], col: number[] = [], idx: number[] = [], c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, w = 0.5 * (1 - u * u * 0.92);
    for (const s of [-1, 1]) {
      pos.push(s * w, u, 0);
      c.copy(BASE).lerp(TIP, u);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Hoja ligera: un solo triángulo (3 vértices). A distancia no se distingue de la completa y cuesta 6 veces menos triángulos y casi 3 veces menos vértices. */
function bladeLite(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.42, 0, 0, 0.42, 0, 0, 0, 1, 0], 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute([BASE.r, BASE.g, BASE.b, BASE.r, BASE.g, BASE.b, TIP.r, TIP.g, TIP.b], 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Hierba instanciada con viento en el vertex shader. Cada bloque de 16 m tiene dos mallas que comparten los mismos datos de instancias:
 * la hoja completa (cerca) y la ligera (lejos). En calidad baja solo existe la ligera.
 */
export function buildGrass(count: number, liteOnly = false): { group: THREE.Group; update(t: number, cam?: THREE.Vector3): void } {
  const geoFull = liteOnly ? null : bladeFull(), geoLite = bladeLite();

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
  const lod: { near: THREE.InstancedMesh | null; far: THREE.InstancedMesh; center: THREE.Vector3; full: number }[] = [];
  for (const list of chunks.values()) {
    const far = new THREE.InstancedMesh(geoLite, mat, list.length);
    list.forEach((it, i) => { far.setMatrixAt(i, it.m); far.setColorAt(i, it.c); });
    far.instanceMatrix.needsUpdate = true;
    if (far.instanceColor) far.instanceColor.needsUpdate = true;
    far.computeBoundingSphere();
    far.boundingSphere!.radius += 0.6; // margen para el movimiento del viento
    group.add(far);
    let near: THREE.InstancedMesh | null = null;
    if (geoFull) {
      near = new THREE.InstancedMesh(geoFull, mat, list.length);
      near.instanceMatrix = far.instanceMatrix; near.instanceColor = far.instanceColor; // mismos datos, otra geometría
      near.boundingSphere = far.boundingSphere!.clone();
      group.add(near);
    }
    lod.push({ near, far, center: far.boundingSphere!.center.clone(), full: list.length });
  }
  // LOD: las instancias están en orden aleatorio, así que dibujar solo las N primeras adelgaza el césped de forma uniforme.
  // Cerca se ve todo; a media distancia la mitad; lejos una cuarta parte; más allá de 90 m, nada. Hasta 18 m (centro del bloque) se usa la hoja completa y desde ahí la ligera: a esa distancia una hoja mide 1–5 píxeles de ancho y no se distinguen.
  return {
    group,
    update: (t: number, cam?: THREE.Vector3) => {
      uTime.value = t;
      if (!cam) return;
      for (const { near, far, center, full } of lod) {
        const d = Math.hypot(center.x - cam.x, center.z - cam.z);
        const f = d < 26 ? 1 : d < 46 ? 0.5 : d < 90 ? 0.22 : 0;
        const useNear = near !== null && d < NEAR_FULL;
        const k = Math.round(full * f);
        if (near) { near.count = k; near.visible = f > 0 && useNear; }
        far.count = k; far.visible = f > 0 && !useNear;
      }
    },
  };
}
