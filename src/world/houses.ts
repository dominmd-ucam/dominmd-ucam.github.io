import * as THREE from 'three';
import { loadGLTF } from '../assets/loader';
import { heightAt } from './terrain';
import type { Obstacle } from './props';

/*
 * Casas montadas con piezas del Medieval Village MegaKit (Quaternius, CC0) en scripts/blender/houses.py.
 * La puerta mira a +z en local; `foot` es la planta (ancho en x, fondo en z) para asentarla y para los choques.
 */
const BASE = `${import.meta.env.BASE_URL}models/houses/`;

export function placeHouse(scene: THREE.Object3D, name: string, x: number, z: number, rotY: number, foot: [number, number], obstacles: Obstacle[]) {
  const [w, d] = foot, c = Math.cos(rotY), s = Math.sin(rotY);
  const toWorld = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  // se apoya en la esquina más baja y se hunde un poco: en cuesta, el zócalo queda enterrado en vez de flotar
  let y = Infinity;
  for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) y = Math.min(y, heightAt(...toWorld(lx, lz)));
  // choques: círculos a lo largo del lado largo
  const n = Math.max(1, Math.round(Math.max(w, d) / Math.min(w, d))), r = Math.min(w, d) / 2 + 0.15;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (Math.max(w, d) - Math.min(w, d));
    const [ox, oz] = w > d ? toWorld(t, 0) : toWorld(0, t);
    obstacles.push({ x: ox, z: oz, r });
  }
  void loadGLTF(`${BASE}${name}.glb`).then((gltf) => {
    const g = gltf.scene;
    g.position.set(x, y - 0.12, z); g.rotation.y = rotY;
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(g);
  }).catch((e) => console.warn(`casa ${name}: no se pudo cargar`, e));
}
