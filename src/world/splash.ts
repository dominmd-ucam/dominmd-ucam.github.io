import * as THREE from 'three';
import { waveHeight } from './water';

export interface Splash {
  /** Salpicadura en corona en (x, z) a la altura del agua; `power` 0–1. */
  crown(x: number, z: number, t: number, power?: number): void;
  update(t: number, dt: number): void;
}

const MAX_DROPS = 120, MAX_CROWNS = 4, CROWN_LIFE = 0.6, MIN_GAP = 0.5;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** La pared de la corona: cilindro abierto con el borde dentado (puntas alternas), con la base en y = 0 para escalarlo hacia arriba. */
function crownGeometry(): THREE.BufferGeometry {
  const seg = 20;
  const g = new THREE.CylinderGeometry(1, 0.72, 1, seg, 1, true);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) { const k = Math.round((Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2)) * seg); p.setY(i, 0.5 + (k & 1 ? 0.4 : 0)); }
  }
  g.translate(0, 0.5, 0);
  return g;
}

/**
 * Salpicadura en corona ("crown splash"): al entrar en el agua sale una pared fina que se abre en un anillo dentado,
 * un chorro central y un círculo de gotas que describen parábolas. Todo en piscinas fijas: sin asignaciones por fotograma y 1 + 4 llamadas de dibujo.
 */
export function buildSplash(scene: THREE.Scene): Splash {
  /* gotas: una malla instanciada; se encogen al final de su vida en vez de desvanecerse */
  const dropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.3, 1.32) });
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), dropMat, MAX_DROPS);
  drops.frustumCulled = false; drops.visible = false; drops.count = 0;
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(drops);
  const px = new Float32Array(MAX_DROPS), py = new Float32Array(MAX_DROPS), pz = new Float32Array(MAX_DROPS);
  const vx = new Float32Array(MAX_DROPS), vy = new Float32Array(MAX_DROPS), vz = new Float32Array(MAX_DROPS);
  const life = new Float32Array(MAX_DROPS), size = new Float32Array(MAX_DROPS);
  let n = 0;
  const m = drops.instanceMatrix.array as Float32Array;
  const spawn = (x: number, y: number, z: number, sx: number, sy: number, sz: number, s: number, l: number) => {
    if (n >= MAX_DROPS) return;
    px[n] = x; py[n] = y; pz[n] = z; vx[n] = sx; vy[n] = sy; vz[n] = sz; size[n] = s; life[n] = l; n++;
  };

  /* paredes de la corona */
  const geo = crownGeometry();
  const walls = Array.from({ length: MAX_CROWNS }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.2, 1.22), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false; mesh.frustumCulled = false;
    mesh.renderOrder = 6; // después del agua (casi opaca): si no, la pared quedaría tapada por la superficie
    scene.add(mesh);
    return { mesh, mat, age: -1, power: 1 };
  });
  let lastT = -9, wi = 0;

  return {
    crown(x, z, t, power = 1) {
      if (t - lastT < MIN_GAP) return; // en la orilla el borde del agua puede parpadear: no se repite la salpicadura
      lastT = t;
      const y = waveHeight(x, z, t);
      const w = walls[wi++ % MAX_CROWNS];
      w.age = 0; w.power = power; w.mesh.position.set(x, y, z); w.mesh.visible = true;
      // anillo de gotas lanzadas hacia fuera y arriba, con ligera irregularidad
      const k = Math.round(12 + 14 * power);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + rnd(-0.12, 0.12), h = rnd(1.3, 2.2) * (0.6 + 0.4 * power);
        spawn(x + Math.cos(a) * 0.25, y + 0.05, z + Math.sin(a) * 0.25, Math.cos(a) * h, rnd(2.8, 4.2) * (0.6 + 0.4 * power), Math.sin(a) * h, rnd(0.028, 0.055), rnd(0.7, 1.0));
      }
      // chorro central: pocas gotas, más altas
      for (let i = 0; i < 4; i++) spawn(x + rnd(-0.06, 0.06), y + 0.1, z + rnd(-0.06, 0.06), rnd(-0.25, 0.25), rnd(4.4, 5.8) * (0.6 + 0.4 * power), rnd(-0.25, 0.25), rnd(0.04, 0.065), 1.1);
    },
    update(t, dt) {
      for (const w of walls) {
        if (w.age < 0) continue;
        w.age += dt;
        const u = w.age / CROWN_LIFE;
        if (u >= 1) { w.age = -1; w.mesh.visible = false; continue; }
        const open = 1 - (1 - u) * (1 - u);                                   // el radio se abre rápido y se frena
        const rise = Math.min(1, u * 5) * (1 - u * u);                        // sube de golpe y se desploma
        const r = (0.18 + 0.85 * open) * (0.7 + 0.3 * w.power);
        w.mesh.scale.set(r, 0.55 * rise * (0.6 + 0.4 * w.power) + 0.001, r);
        w.mat.opacity = 0.7 * (1 - u) * (1 - u);
      }

      // gotas: balística con gravedad; se retiran al caer al agua o al agotar su vida (intercambio con la última: sin huecos)
      for (let i = 0; i < n;) {
        life[i] -= dt;
        vy[i] -= 9.8 * dt;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        if (life[i] <= 0 || (vy[i] < 0 && py[i] < waveHeight(px[i], pz[i], t) - 0.02)) {
          n--;
          if (i !== n) { px[i] = px[n]; py[i] = py[n]; pz[i] = pz[n]; vx[i] = vx[n]; vy[i] = vy[n]; vz[i] = vz[n]; life[i] = life[n]; size[i] = size[n]; }
          continue;
        }
        const s = size[i] * Math.min(1, life[i] / 0.2), o = i * 16;
        m[o] = s; m[o + 5] = s; m[o + 10] = s; m[o + 12] = px[i]; m[o + 13] = py[i]; m[o + 14] = pz[i]; m[o + 15] = 1;
        i++;
      }
      drops.count = n; drops.visible = n > 0;
      if (n > 0) drops.instanceMatrix.needsUpdate = true;
    },
  };
}
