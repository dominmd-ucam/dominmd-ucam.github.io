import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, islandRadius, pathMask } from './terrain';
import type { Obstacle } from './props';

/** Esferas que forman la copa: centro (x, y, z) y radio. */
const BLOBS: [number, number, number, number][] = [[0, 0, 0, 1.9], [1.3, -0.3, 0.4, 1.35], [-1.2, -0.2, -0.5, 1.4], [0.3, 1.1, -0.3, 1.25], [-0.2, -0.4, 1.3, 1.2]];

/** Árboles de copa redonda y blanda, al estilo de los juegos tipo Petit Island: tronco grueso y copa de esferas con degradado. */
function canopyGeometry(detail: number, shrink = 1, lowHex = '#3da34a', highHex = '#b4e460'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const low = new THREE.Color(lowHex), high = new THREE.Color(highHex), c = new THREE.Color();
  for (const [x, y, z, r0] of BLOBS) {
    const r = r0 * shrink;
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
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
    // baja resolución: vértices compartidos → sombreado suave, que a distancia imita al detalle alto
    if (detail < 3) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); }
    parts.push(g);
  }
  const m = mergeGeometries(parts)!;
  m.computeVertexNormals();
  return m;
}

/**
 * Copa estilo BotW: cientos de tarjetas de hojas repartidas por la superficie de las esferas de la copa.
 * Cada tarjeta mira siempre a la cámara (se orienta en el vertex shader) y lleva la normal de la esfera, no la de la tarjeta:
 * así la copa se ilumina como un volumen blando y su silueta queda recortada en ramilletes.
 */
function leafGeometry(count: number): THREE.BufferGeometry {
  let seed = 977;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const total = BLOBS.reduce((s, b) => s + b[3] * b[3], 0);
  const pos: number[] = [], corner: number[] = [], nrm: number[] = [], rr: number[] = [], idx: number[] = [];
  const d = new THREE.Vector3(), n = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    let pick = rnd() * total, b = BLOBS[0];
    for (const bb of BLOBS) { pick -= bb[3] * bb[3]; if (pick <= 0) { b = bb; break; } }
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
    d.set(sq * Math.cos(a), u, sq * Math.sin(a));
    const r = b[3] * (0.8 + rnd() * 0.24), cx = b[0] + d.x * r, cy = b[1] + d.y * r, cz = b[2] + d.z * r;
    n.set(cx * 0.5 + d.x, cy * 0.5 + d.y, cz * 0.5 + d.z).normalize(); // mezcla de la normal de la esfera y la de la copa entera
    const rv = rnd();
    for (const [ux, uy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(cx, cy, cz); corner.push(ux, uy); nrm.push(n.x, n.y, n.z); rr.push(rv); }
    const o = k * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aNrm', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aRnd', new THREE.Float32BufferAttribute(rr, 1));
  g.setIndex(idx);
  return g;
}

function leafMaterial(uTime: { value: number }, uSunDir: { value: THREE.Vector3 }, uAlpha: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const uLow = { value: new THREE.Color('#2f7d3c') }, uHigh = { value: new THREE.Color('#b2df5a') }; // THREE.Color ya los pasa a lineal
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uSunDir = uSunDir; sh.uniforms.uAlpha = uAlpha; sh.uniforms.uLow = uLow; sh.uniforms.uHigh = uHigh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uSunDir;
        attribute vec2 aCorner; attribute vec3 aNrm; attribute float aRnd;
        varying vec2 vLeafUv; varying float vLeafRnd; varying float vLeafH; varying float vLeafBack;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = aNrm;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        float sway = sin(uTime * 0.9 + ip.x * 0.7 + ip.z * 0.5) + 0.35 * sin(uTime * 2.3 + aRnd * 6.0);
        transformed.x += sway * 0.07 * (position.y + 1.6);
        transformed.z += cos(uTime * 0.7 + ip.z) * 0.05 * (position.y + 1.6);
        vLeafUv = aCorner; vLeafRnd = aRnd; vLeafH = position.y;
        // contraluz: cuánto mira la cámara hacia el sol a través de la copa
        vec3 leafW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vLeafBack = max(dot(normalize(leafW - cameraPosition), uSunDir), 0.0);`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        float la = aRnd * 6.2831;
        mvPosition.xy += mat2(cos(la), -sin(la), sin(la), cos(la)) * aCorner * (0.5 + 0.35 * fract(aRnd * 7.0)) * length(instanceMatrix[0].xyz);
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uAlpha; uniform vec3 uLow; uniform vec3 uHigh;
        varying vec2 vLeafUv; varying float vLeafRnd; varying float vLeafH; varying float vLeafBack;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // silueta de ramillete: un círculo con cinco lóbulos
        float leafR = length(vLeafUv);
        if (leafR > 0.7 + 0.22 * sin(atan(vLeafUv.y, vLeafUv.x) * 5.0 + vLeafRnd * 20.0)) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(uLow, uHigh, clamp((vLeafH + 1.6) / 3.8, 0.0, 1.0)) * (0.85 + 0.3 * fract(vLeafRnd * 13.0));
        toonEdge = (fract(vLeafRnd * 31.0) - 0.5) * 0.25;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(0.8, 1.0, 0.35) * smoothstep(0.4, 1.0, vLeafBack) * (0.15 + 0.25 * leafR);`)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = uAlpha;');
  };
  return m;
}

/**
 * `leaves`: las copas cercanas se dibujan con tarjetas de hojas (estilo BotW) sobre un núcleo oscuro y barato;
 * sin ello (calidad baja) se usa la copa de esferas de siempre.
 */
export function buildTrees(scene: THREE.Scene, obstacles: Obstacle[], count: number, leaves = true, sunDir = new THREE.Vector3(0, 1, 0)): { update(t: number, cam?: THREE.Vector3): void; blocks(p: THREE.Vector3): boolean; setInkMask(on: boolean): void } {
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
  // LOD de las copas (lo que más triángulos cuesta): la misma copa con menos subdivisiones según la distancia a la cámara
  const LODS = leaves ? [{ detail: 1, max: 40 }, { detail: 1, max: 65 }, { detail: 0, max: Infinity }] : [{ detail: 3, max: 26 }, { detail: 1, max: 65 }, { detail: 0, max: Infinity }];
  const HYST = 3; // margen en metros para que un árbol no salte de nivel una y otra vez en el límite
  // con hojas, el nivel cercano es solo el núcleo: más pequeño y oscuro, tapa los huecos entre tarjetas y es el que proyecta la sombra
  const canopies = LODS.map((l, k) => new THREE.InstancedMesh(leaves && k === 0 ? canopyGeometry(l.detail, 0.82, '#1f5a2c', '#3f8a3a') : canopyGeometry(l.detail), canopyMat, spots.length));
  const uAlpha = { value: 1 };
  const leafMesh = leaves ? new THREE.InstancedMesh(leafGeometry(420), leafMaterial(uTime, { value: sunDir }, uAlpha), spots.length) : null;
  const baseMat = new Float32Array(spots.length * 16), baseCol = new Float32Array(spots.length * 3);
  const lodOf = new Int8Array(spots.length).fill(-1), counts = new Int32Array(LODS.length);
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 2.6, 8); trunkGeo.translate(0, 1.3, 0);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#a86b40', roughness: 0.9 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  spots.forEach((p, i) => {
    const y = heightAt(p.x, p.z) - 0.1;
    q.setFromAxisAngle(up, p.a);
    m.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    trunk.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(p.x, y + 3.9 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    m.toArray(baseMat, i * 16);
    tint.setHSL(0.27 + Math.random() * 0.05, 0.9, 0.9 + Math.random() * 0.2);
    tint.toArray(baseCol, i * 3);
    obstacles.push({ x: p.x, z: p.z, r: 0.7 * p.s });
  });
  for (const c of canopies) c.setColorAt(0, tint); // reserva el buffer de color; luego se rellena por nivel
  for (const o of [...canopies, trunk]) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; scene.add(o); }
  if (leafMesh) { leafMesh.setColorAt(0, tint); leafMesh.receiveShadow = true; leafMesh.frustumCulled = false; scene.add(leafMesh); } // las tarjetas no proyectan sombra: ya lo hace el núcleo

  /** Reparte los árboles entre los niveles según la distancia horizontal a la cámara; solo reescribe buffers si alguno cambia de nivel. */
  function assignLods(cam: THREE.Vector3) {
    let changed = false;
    for (let i = 0; i < spots.length; i++) {
      const d = Math.hypot(cam.x - spots[i].x, cam.z - spots[i].z);
      let l = Math.max(lodOf[i], 0);
      while (l < LODS.length - 1 && d > LODS[l].max + HYST) l++;
      while (l > 0 && d < LODS[l - 1].max - HYST) l--;
      if (l !== lodOf[i]) { lodOf[i] = l; changed = true; }
    }
    if (!changed) return;
    counts.fill(0);
    for (let i = 0; i < spots.length; i++) {
      const k = lodOf[i], c = canopies[k];
      (c.instanceMatrix.array as Float32Array).set(baseMat.subarray(i * 16, i * 16 + 16), counts[k] * 16);
      (c.instanceColor!.array as Float32Array).set(baseCol.subarray(i * 3, i * 3 + 3), counts[k] * 3);
      counts[k]++;
    }
    canopies.forEach((c, k) => { c.count = counts[k]; c.visible = counts[k] > 0; c.instanceMatrix.needsUpdate = true; c.instanceColor!.needsUpdate = true; });
    if (leafMesh) { // las hojas acompañan a los núcleos del nivel cercano
      const c0 = canopies[0];
      (leafMesh.instanceMatrix.array as Float32Array).set((c0.instanceMatrix.array as Float32Array).subarray(0, counts[0] * 16));
      (leafMesh.instanceColor!.array as Float32Array).set((c0.instanceColor!.array as Float32Array).subarray(0, counts[0] * 3));
      leafMesh.count = counts[0]; leafMesh.visible = counts[0] > 0;
      leafMesh.instanceMatrix.needsUpdate = true; leafMesh.instanceColor!.needsUpdate = true;
    }
  }

  return {
    update: (t, cam) => { uTime.value = t; if (cam) assignLods(cam); },
    /** Igual que en la hierba: alfa 0 para que el postprocesado no dibuje contornos en cada tarjeta. */
    setInkMask: (on) => { uAlpha.value = on ? 0 : 1; },
    /** ¿está el punto (la cámara) dentro de alguna copa? */
    blocks: (p) => {
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i], y0 = heightAt(s.x, s.z) + 2.0 * s.s;
        if (p.y > y0 && p.y < y0 + 5.5 * s.s && Math.hypot(p.x - s.x, p.z - s.z) < 2.9 * s.s) return true;
      }
      return false;
    },
  };
}
