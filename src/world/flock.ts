import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface Flock {
  update(t: number, dt: number): void;
}

/** Gaviota de pocos polígonos: cuerpo + dos alas. `aWing` vale 0 en el cuerpo y 1 en la punta del ala: el aleteo se hace en el shader. */
function gullGeometry(): THREE.BufferGeometry {
  const white = new THREE.Color('#fbfbf6'), tip = new THREE.Color('#7d8a93');
  const paint = (g: THREE.BufferGeometry, wing: number[], cols: THREE.Color[]) => {
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3), w = new Float32Array(n);
    for (let i = 0; i < n; i++) { const k = cols[i % cols.length]; c.set([k.r, k.g, k.b], i * 3); w[i] = wing[i % wing.length]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aWing', new THREE.BufferAttribute(w, 1));
    return g;
  };
  const body = new THREE.ConeGeometry(0.1, 0.7, 5).rotateX(Math.PI / 2).toNonIndexed();
  body.deleteAttribute('uv'); // las alas no tienen UV y mergeGeometries exige los mismos atributos
  paint(body, [0], [white]);
  const wings = [-1, 1].map((side) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.2, 0, 0, 0.26, side * 1.25, 0.04, -0.05], 3));
    g.computeVertexNormals();
    return paint(g, [0, 0, 1], [white, white, tip]);
  });
  return mergeGeometries([body, ...wings])!;
}

/**
 * Bandada de gaviotas (murmuración): tres reglas locales de boids —separación, alineación y cohesión— más una atracción suave
 * hacia un punto que recorre el cielo de la isla. Una sola malla instanciada (1 llamada de dibujo) y el aleteo va en el vertex shader.
 * Sin asignaciones por fotograma: todo vive en arrays tipados.
 */
export function buildFlock(scene: THREE.Scene, count: number): Flock {
  const N = count;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), bank = new Float32Array(N), size = new Float32Array(N);
  const phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos.set([rnd(-14, 14), rnd(20, 30), rnd(-14, 14)], i * 3);
    const a = Math.random() * 6.28;
    vel.set([Math.cos(a) * 7, rnd(-0.5, 0.5), Math.sin(a) * 7], i * 3);
    size[i] = rnd(1.2, 1.6);
    phase[i] = Math.random() * 6.28;
  }

  const geo = gullGeometry();
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  const uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWing; attribute float aPhase; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // aleteo: la punta sube y baja; cada ave tiene su fase y a ratos planea (amplitud modulada)
        float glide = 0.35 + 0.65 * pow(sin(uTime * 0.6 + aPhase * 3.0) * 0.5 + 0.5, 0.6);
        transformed.y += aWing * sin(uTime * 8.0 + aPhase) * 0.55 * glide;`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false; // la bandada ocupa media isla; es una sola llamada de dibujo
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const R2 = 10 * 10, S2 = 3.2 * 3.2;
  const MIN_SPEED = 5.5, MAX_SPEED = 9, Y_LOW = 16, Y_HIGH = 36;
  const m = mesh.instanceMatrix.array as Float32Array;

  return {
    update(t, dt) {
      dt = Math.min(dt, 0.05);
      uTime.value = t;
      // punto de atracción: recorre el cielo de la isla en una curva lenta
      const tx = Math.cos(t * 0.07) * 38, ty = 26 + Math.sin(t * 0.2) * 4, tz = Math.sin(t * 0.09) * 38;

      for (let i = 0; i < N; i++) {
        const i3 = i * 3, px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
        let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const j3 = j * 3, dx = pos[j3] - px, dy = pos[j3 + 1] - py, dz = pos[j3 + 2] - pz, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > R2) continue;
          n++;
          ax += vel[j3]; ay += vel[j3 + 1]; az += vel[j3 + 2];
          cx += pos[j3]; cy += pos[j3 + 1]; cz += pos[j3 + 2];
          if (d2 < S2) { const k = 1 / (d2 + 0.05); sx -= dx * k; sy -= dy * k; sz -= dz * k; }
        }
        let fx = sx * 5, fy = sy * 5, fz = sz * 5;
        if (n) {
          fx += (ax / n - vel[i3]) * 1.3 + (cx / n - px) * 0.3;
          fy += (ay / n - vel[i3 + 1]) * 1.3 + (cy / n - py) * 0.3;
          fz += (az / n - vel[i3 + 2]) * 1.3 + (cz / n - pz) * 0.3;
        }
        fx += (tx - px) * 0.06; fy += (ty - py) * 0.06; fz += (tz - pz) * 0.06;
        if (py < Y_LOW) fy += (Y_LOW - py) * 1.5; else if (py > Y_HIGH) fy -= (py - Y_HIGH) * 1.5;

        let vx = vel[i3] + fx * dt, vy = vel[i3 + 1] + fy * dt, vz = vel[i3 + 2] + fz * dt;
        const sp = Math.hypot(vx, vy, vz) || 1, ks = Math.min(MAX_SPEED, Math.max(MIN_SPEED, sp)) / sp;
        vx *= ks; vy *= ks; vz *= ks;
        // alabeo: se inclina hacia donde gira (componente lateral de la aceleración)
        const lat = (fx * vz - fz * vx) / (sp * sp);
        bank[i] += (THREE.MathUtils.clamp(-lat * 0.35, -0.7, 0.7) - bank[i]) * Math.min(1, dt * 4);
        vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
        pos[i3] = px + vx * dt; pos[i3 + 1] = py + vy * dt; pos[i3 + 2] = pz + vz * dt;

        // base de la matriz: adelante = velocidad, derecha = Y × adelante, alabeo alrededor del eje de avance
        const inv = 1 / (Math.hypot(vx, vy, vz) || 1), fwx = vx * inv, fwy = vy * inv, fwz = vz * inv;
        let rx = fwz, rz = -fwx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; // Y × f (con ry = 0)
        const ux = fwy * rz, uy = fwz * rx - fwx * rz, uz = -fwy * rx;           // f × r
        const cb = Math.cos(bank[i]), sb = Math.sin(bank[i]), s = size[i], o = i * 16;
        m[o] = (rx * cb + ux * sb) * s;  m[o + 1] = (uy * sb) * s;           m[o + 2] = (rz * cb + uz * sb) * s;  m[o + 3] = 0;
        m[o + 4] = (ux * cb - rx * sb) * s; m[o + 5] = (uy * cb) * s;        m[o + 6] = (uz * cb - rz * sb) * s;  m[o + 7] = 0;
        m[o + 8] = fwx * s; m[o + 9] = fwy * s; m[o + 10] = fwz * s; m[o + 11] = 0;
        m[o + 12] = pos[i3]; m[o + 13] = pos[i3 + 1]; m[o + 14] = pos[i3 + 2]; m[o + 15] = 1;
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
