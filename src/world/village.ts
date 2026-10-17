import * as THREE from 'three';
import { heightAt, pathMask } from './terrain';
import type { Obstacle } from './props';
import { batchStatic } from './batch';

const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
const WOOD = mat('#c98f55'), WOOD_D = mat('#8f5a32');

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  parent.add(o);
  return o;
}

/** Texto en un cartel (canvas → textura) para que las flechas indiquen a dónde lleva cada camino. */
function label(text: string, bg = '#d9a05b'): THREE.Mesh {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 84, 256, 12);
  g.fillStyle = '#4a2c14'; g.font = '700 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 46);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.08), [mat('#8f5a32'), mat('#8f5a32'), mat('#8f5a32'), mat('#8f5a32'), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })]);
}

/** Valla de postes y travesaños entre dos puntos; se salta los tramos sobre caminos o fuera de la hierba. */
function fence(scene: THREE.Object3D, a: [number, number], b: [number, number]) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 1.5));
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const post = new THREE.CylinderGeometry(0.1, 0.12, 1.15, 6);
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[1] + ((b[1] - a[1]) * i) / n, h = heightAt(x, z);
    if (h < 0.95 || pathMask(x, z) > 0.15) continue;
    add(scene, post, WOOD, x, h + 0.5, z);
    if (i < n) {
      const nx = a[0] + ((b[0] - a[0]) * (i + 1)) / n, nz = a[1] + ((b[1] - a[1]) * (i + 1)) / n, nh = heightAt(nx, nz);
      if (nh < 0.95 || pathMask(nx, nz) > 0.15) continue;
      for (const k of [0.38, 0.8]) {
        const r = add(scene, new THREE.BoxGeometry(len / n + 0.05, 0.1, 0.07), WOOD_D, (x + nx) / 2, (h + nh) / 2 + k, (z + nz) / 2);
        r.rotation.y = -ang; r.rotation.z = Math.atan2(nh - h, len / n);
      }
    }
  }
}

export function buildVillage(scene: THREE.Object3D): { obstacles: Obstacle[] } {
  const obstacles: Obstacle[] = [];

  /* ---------- casita mediterránea ---------- */
  {
    const [cx, cz] = [-3, -17.5];
    const g = new THREE.Group(); g.position.set(cx, heightAt(cx, cz) - 0.1, cz); g.rotation.y = 0.35;
    add(g, new THREE.BoxGeometry(4.6, 2.7, 3.8), mat('#f7efe2'), 0, 1.35, 0);
    add(g, new THREE.BoxGeometry(4.8, 0.2, 4.0), mat('#e8dcc8'), 0, 0.1, 0);
    // tejado a dos aguas de teja
    const roofM = mat('#d96b3f');
    for (const s of [-1, 1]) {
      const r = add(g, new THREE.BoxGeometry(2.9, 0.22, 4.4), roofM, s * 1.15, 3.2, 0);
      r.rotation.z = -s * 0.62;
    }
    add(g, new THREE.BoxGeometry(0.4, 0.26, 4.5), mat('#c25a33'), 0, 3.85, 0);
    add(g, new THREE.BoxGeometry(0.6, 1.4, 0.6), mat('#f2e6d2'), 1.4, 3.7, -1.0);
    // puerta, ventanas y macetas
    add(g, new THREE.BoxGeometry(1.0, 1.8, 0.12), mat('#2f84c4'), -0.6, 0.95, 1.92);
    for (const wx of [0.9, 1.9]) {
      add(g, new THREE.BoxGeometry(0.7, 0.8, 0.1), mat('#9bd8f2', { emissive: '#9bd8f2', emissiveIntensity: 0.15 }), wx, 1.6, 1.93);
      for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.3, 0.9, 0.08), mat('#2f84c4'), wx + s * 0.5, 1.6, 1.94);
    }
    add(g, new THREE.BoxGeometry(2.2, 0.3, 0.4), WOOD, 1.4, 0.95, 2.15);
    for (let i = 0; i < 5; i++) add(g, new THREE.IcosahedronGeometry(0.16, 1), mat(['#ff7a8a', '#ffd23f', '#ff9ac1'][i % 3]), 0.5 + i * 0.4, 1.2, 2.15);
    batchStatic(g);
    scene.add(g);
    obstacles.push({ x: cx, z: cz, r: 2.7 });
    fence(scene, [cx - 5, cz + 4.5], [cx + 5, cz + 4.5]);
    fence(scene, [cx - 5, cz + 4.5], [cx - 5, cz - 3]);
    fence(scene, [cx + 5, cz + 4.5], [cx + 5, cz - 3]);
  }

  /* ---------- carteles en el cruce de caminos ---------- */
  {
    const p = new THREE.Group(); p.position.set(1.8, heightAt(1.8, 1.8), 1.8);
    add(p, new THREE.CylinderGeometry(0.12, 0.16, 3.2, 7), WOOD_D, 0, 1.6, 0);
    const targets: [string, number, number][] = [['Web', 10, 8], ['Consola', 16, -4], ['Plugin', 4, -14], ['Bot', -12, 6], ['Faro', -8, -8]];
    targets.forEach(([name, tx, tz], i) => {
      const b = label(name, ['#e9b36a', '#d98f5a', '#e3a24f', '#d9a86a', '#e8c07a'][i]);
      b.position.set(0, 3.0 - i * 0.5, 0);
      b.rotation.y = Math.atan2(-(tz - 1.8), tx - 1.8);
      b.translateX(0.8);
      b.castShadow = true;
      p.add(b);
    });
    scene.add(p);
    obstacles.push({ x: 1.8, z: 1.8, r: 0.3 });
  }

  /* ---------- vallas sueltas: bordean el sendero a la cala y el cruce ---------- */
  fence(scene, [9, 14], [13, 10]);
  fence(scene, [-6, 5], [-9, 9]);
  return { obstacles };
}
