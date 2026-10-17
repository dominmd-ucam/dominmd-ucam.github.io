import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Tier } from '../quality';

const BASE = import.meta.env.BASE_URL;
/** URL de tu servidor con los assets de calidad alta (opcional). Ej.: VITE_HQ_ASSETS_URL=https://assets.tudominio.com/portfolio/ */
const HQ_BASE: string = (import.meta.env.VITE_HQ_ASSETS_URL as string | undefined) ?? '';

let loader: GLTFLoader | null = null;

/**
 * Decodificadores: Draco (geometría del avatar, en public/draco) y meshopt (animaciones). Las texturas de los modelos son WebP/PNG, que el navegador lee solo.
 * No hay soporte KTX2: ningún modelo lo usa y el transcodificador pesaba 585 KB en cada despliegue. Si un día hace falta (p. ej. modelos HQ de tu servidor con texturas KTX2),
 * hay que importar KTX2Loader, llamar a setTranscoderPath(`${BASE}basis/`) y detectSupport(renderer) y copiar basis_transcoder.{js,wasm} de three/examples/jsm/libs/basis a public/basis.
 */
export function initAssets() {
  const draco = new DRACOLoader().setDecoderPath(`${BASE}draco/`);
  loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
}

/** Carga cruda de un glTF (sin sustituir sombras ni nada): lo usa el avatar. */
export function loadGLTF(url: string): Promise<GLTF> {
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
      const gltf = await loadGLTF(url);
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      return gltf.scene;
    } catch { /* probamos el siguiente */ }
  }
  return null;
}
