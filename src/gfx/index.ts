import * as THREE from 'three';
import { settings, type Backend } from '../settings';
import type { Quality } from '../quality';
import { createPost, type Post } from '../post';
import { skyEnvWebGL } from '../world/dawn';

/** Lo que el juego usa de cualquiera de los dos renderizadores (WebGLRenderer y WebGPURenderer lo cumplen). */
export interface RendererLike {
  shadowMap: { enabled: boolean; type: THREE.ShadowMapType };
  setPixelRatio(v: number): void;
  setSize(w: number, h: number, updateStyle?: boolean): void;
  setAnimationLoop(cb: ((t: number) => void) | null): unknown;
  render(scene: THREE.Object3D, camera: THREE.Camera): unknown;
}

/**
 * Motor gráfico del modo 3D. Todo lo que cambia entre WebGL y WebGPU pasa por aquí: sombras a ritmo propio,
 * entorno de reflejos, postprocesado, estadísticas y lectura de píxeles. El resto del juego usa `renderer` sin saber cuál es.
 */
export interface Gfx {
  kind: Backend;
  renderer: RendererLike;
  /** el lienzo en uso (si WebGPU falla al arrancar se sustituye por uno nuevo: un lienzo no admite dos contextos) */
  canvas: HTMLCanvasElement;
  /** la sombra del sol solo se recalcula cuando se pide (ver el bucle del juego) */
  initShadows(light: THREE.DirectionalLight): void;
  requestShadow(light: THREE.DirectionalLight): void;
  envFactory(): (sunDir: THREE.Vector3) => THREE.Texture | null;
  createPost(scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: Quality): Post;
  /** reinicia los contadores al empezar un fotograma */
  resetStats(): void;
  stats(): { calls: number; triangles: number; geometries: number; textures: number };
  /** dibuja la escena fuera del lienzo (fondo transparente, sRGB) y devuelve sus píxeles RGBA con las filas de arriba abajo */
  snapshot(scene: THREE.Scene, camera: THREE.Camera, w: number, h: number): Promise<Uint8Array>;
}

/** ¿Hay WebGPU en este navegador? (se comprueba que de verdad entregue un adaptador) */
export async function webgpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try { return (await gpu.requestAdapter()) !== null; } catch { return false; }
}

function createWebGL(canvas: HTMLCanvasElement, q: Quality): Gfx {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.tier === 'low', powerPreference: 'high-performance' });
  renderer.shadowMap.autoUpdate = false; // la sombra se recalcula a 30 Hz (ver el bucle)
  renderer.info.autoReset = false;
  return {
    kind: 'webgl',
    renderer,
    canvas,
    // con autoUpdate apagado, el primer fotograma necesita generar el mapa o el sampler de sombra queda sin textura válida
    initShadows: () => { renderer.shadowMap.needsUpdate = true; },
    // solo se activa, nunca se apaga aquí: three lo pone a false tras dibujar la sombra
    requestShadow: () => { renderer.shadowMap.needsUpdate = true; },
    envFactory: () => skyEnvWebGL(renderer),
    createPost: (scene, camera, q) => createPost(renderer, scene, camera, q),
    resetStats: () => renderer.info.reset(),
    stats: () => {
      const i = renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
    },
    snapshot: async (scene, camera, w, h) => {
      // render target en sRGB: el propio hardware convierte el color lineal al escribirlo
      const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace });
      const prev = renderer.getRenderTarget(), alpha = renderer.getClearAlpha(), clear = renderer.getClearColor(new THREE.Color());
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      const px = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
      renderer.setRenderTarget(prev);
      renderer.setClearColor(clear, alpha);
      rt.dispose();
      // WebGL lee de abajo arriba: se da la vuelta a las filas
      const out = new Uint8Array(px.length);
      for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      return out;
    },
  };
}

/**
 * Crea el motor elegido en los ajustes. WebGPU se descarga aparte (three/webgpu y los shaders TSL) y solo si el navegador lo admite;
 * si falla al arrancar se vuelve a WebGL. `?gpu=webgl|webgpu` lo fuerza sin tocar los ajustes (útil para comparar).
 */
export async function createGfx(canvas: HTMLCanvasElement, q: Quality): Promise<Gfx> {
  const forced = new URLSearchParams(location.search).get('gpu');
  const want = forced === 'webgpu' || forced === 'webgl' ? forced : settings.value.backend;
  if (want === 'webgpu' && await webgpuAvailable()) {
    try {
      const { createWebGPU } = await import('./webgpu');
      return await createWebGPU(canvas, q);
    } catch (e) {
      console.warn('WebGPU no ha podido arrancar, se usa WebGL:', e);
      const fresh = canvas.cloneNode() as HTMLCanvasElement;
      canvas.replaceWith(fresh);
      canvas = fresh;
    }
  }
  return createWebGL(canvas, q);
}
