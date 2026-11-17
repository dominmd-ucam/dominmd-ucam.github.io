import * as THREE from 'three';

export interface Dust {
  /** Nube de polvo en (x, y, z); `power` 0–1 (cuántas motas y con qué fuerza salen). */
  puff(x: number, y: number, z: number, power?: number): void;
  update(dt: number): void;
}

const MAX = 48, LIFE = 0.5;

/** Polvo de saltos y aterrizajes: motas en una sola malla instanciada que se abren y se encogen (sin transparencia ni asignaciones por fotograma). */
export function buildDust(scene: THREE.Scene): Dust {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#e9dcc0') }), MAX);
  mesh.frustumCulled = false; mesh.visible = false; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX), vy = new Float32Array(MAX), vz = new Float32Array(MAX);
  const age = new Float32Array(MAX), size = new Float32Array(MAX);
  let n = 0;
  const m = mesh.instanceMatrix.array as Float32Array;
  return {
    puff(x, y, z, power = 1) {
      const k = Math.min(1, Math.max(0, power)), count = 3 + Math.round(5 * k);
      for (let i = 0; i < count && n < MAX; i++) {
        const a = Math.random() * Math.PI * 2, sp = (0.8 + Math.random() * 1.2) * (0.5 + k);
        px[n] = x + Math.cos(a) * 0.25; py[n] = y + 0.05; pz[n] = z + Math.sin(a) * 0.25;
        vx[n] = Math.cos(a) * sp; vy[n] = 0.5 + Math.random() * 0.6; vz[n] = Math.sin(a) * sp;
        size[n] = 0.07 + Math.random() * 0.06 + 0.05 * k; age[n] = 0; n++;
      }
    },
    update(dt) {
      for (let i = 0; i < n;) {
        age[i] += dt;
        if (age[i] >= LIFE) { // se sustituye por la última mota viva
          n--;
          px[i] = px[n]; py[i] = py[n]; pz[i] = pz[n]; vx[i] = vx[n]; vy[i] = vy[n]; vz[i] = vz[n]; age[i] = age[n]; size[i] = size[n];
          continue;
        }
        const drag = Math.exp(-4 * dt);
        vx[i] *= drag; vz[i] *= drag; vy[i] *= drag;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        const u = age[i] / LIFE, s = size[i] * (1 + u * 1.2) * (1 - u * u);
        const o = i * 16;
        m[o] = s; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
        m[o + 12] = px[i]; m[o + 13] = py[i]; m[o + 14] = pz[i]; m[o + 15] = 1;
        i++;
      }
      mesh.count = n; mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
