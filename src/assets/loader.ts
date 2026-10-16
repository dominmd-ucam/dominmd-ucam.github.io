import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Tier } from '../quality';

const BASE = import.meta.env.BASE_URL;
/** URL de tu servidor con los assets de calidad alta (opcional). Ej.: VITE_HQ_ASSETS_URL=https://assets.tudominio.com/portfolio/ */
const HQ_BASE: string = (import.meta.env.VITE_HQ_ASSETS_URL as string | undefined) ?? '';

let loader: GLTFLoader | null = null;

export function initAssets(renderer: THREE.WebGLRenderer) {
  const draco = new DRACOLoader().setDecoderPath(`${BASE}draco/`);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}basis/`).detectSupport(renderer);
  loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
}

function load(url: string): Promise<GLTF> {
  if (!loader) return Promise.reject(new Error('initAssets() no se ha llamado'));
  return loader.loadAsync(url);
}

/**
 * Carga un modelo por nombre. En calidad alta intenta primero tu servidor (HQ) y, si no está o falla,
 * usa la versión ligera de Pages. Devuelve null si no existe ninguna, para que el llamador use su modelo procedural.
 */
export async function loadModel(name: string, tier: Tier): Promise<THREE.Group | null> {
  const candidates: string[] = [];
  if (tier === 'high' && HQ_BASE) candidates.push(`${HQ_BASE.replace(/\/?$/, '/')}${name}.glb`);
  candidates.push(`${BASE}models/${name}.glb`);
  for (const url of candidates) {
    try {
      const gltf = await load(url);
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      return gltf.scene;
    } catch { /* probamos el siguiente */ }
  }
  return null;
}
