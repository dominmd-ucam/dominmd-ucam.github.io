import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { Gfx } from './index';
import type { Post } from '../post';
import type { Quality } from '../quality';
import { ENV_SKY } from '../world/dawn';
import { installIslandMaterials, noise2 } from './tsl';

/* eslint-disable @typescript-eslint/no-explicit-any -- ver tsl.ts: la aritmética de nodos va sin tipar */
type N = any;
const {
  Fn, If, Loop, pass, rtt, step, uniform, uv, vec2, vec3, vec4, float, mix, max, clamp, pow, length, dot, atan, fract, smoothstep, select, distance,
  screenCoordinate, perspectiveDepthToViewZ, toneMapping, renderOutput,
} = TSL as any;

/**
 * Motor WebGPU (experimental, se activa en Ajustes → Motor). Mismo aspecto que el de WebGL:
 * los shaders propios se reconstruyen en TSL (tsl.ts) y el postprocesado usa el RenderPipeline de three en vez de la librería postprocessing.
 */
export async function createWebGPU(canvas: HTMLCanvasElement, q: Quality): Promise<Gfx> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: q.tier === 'low', powerPreference: 'high-performance' });
  await renderer.init();
  // si WebGPU no arranca, three cae solo a su versión WebGL 2 de nodos: para eso es mejor el renderer WebGL de siempre
  if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) { renderer.dispose(); throw new Error('WebGPU no disponible'); }
  installIslandMaterials(renderer);
  renderer.info.autoReset = false;

  return {
    kind: 'webgpu',
    renderer,
    canvas,
    // con WebGPU la sombra se pide por luz, no en el renderer
    initShadows: (light) => { light.shadow.autoUpdate = false; light.shadow.needsUpdate = true; },
    requestShadow: (light) => { light.shadow.needsUpdate = true; },
    envFactory: () => (sunDir) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      const sky = new SkyMesh();
      sky.scale.setScalar(4000);
      sky.turbidity.value = ENV_SKY.turbidity; sky.rayleigh.value = ENV_SKY.rayleigh;
      sky.mieCoefficient.value = ENV_SKY.mieCoefficient; sky.mieDirectionalG.value = ENV_SKY.mieDirectionalG;
      sky.sunPosition.value.copy(sunDir);
      envScene.add(sky);
      const tex = pmrem.fromScene(envScene, 0, 1, 10000).texture;
      pmrem.dispose();
      return tex;
    },
    createPost: (scene, camera, quality) => createPostGPU(renderer, scene, camera, quality),
    resetStats: () => renderer.info.reset(),
    stats: () => {
      const i = renderer.info;
      return { calls: i.render.drawCalls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
    },
    snapshot: async (scene, camera, w, h) => {
      const rt = new THREE.RenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace });
      const prev = renderer.getRenderTarget(), alpha = renderer.getClearAlpha(), clear = renderer.getClearColor(new THREE.Color());
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      const read = renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
      renderer.setRenderTarget(prev);
      renderer.setClearColor(clear, alpha);
      const px = new Uint8Array((await read).buffer);
      rt.dispose();
      // WebGPU alinea cada fila a 256 bytes: se quita el relleno
      const row = w * 4, stride = h > 1 ? (px.length - row) / (h - 1) : row;
      if (stride === row) return px.slice(0, row * h);
      const out = new Uint8Array(row * h);
      for (let y = 0; y < h; y++) out.set(px.subarray(y * stride, y * stride + row), y * row);
      return out;
    },
  };
}

/** Postprocesado equivalente a post.ts: contornos por profundidad, exposición, bloom, ACES, saturación, contraste, viñeta y SMAA (no en móvil). */
function createPostGPU(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: Quality): Post {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (q.tier === 'low') {
    return {
      render: () => { renderer.render(scene, camera); },
      setSize: () => {},
      setExposure: (v) => { renderer.toneMappingExposure = v; },
      setEnabled: () => {},
      setSun: () => {},
    };
  }
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false; // el tone mapping va en medio de la cadena, como en post.ts
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output'), depth = scenePass.getTextureNode('depth');
  const uExposure = uniform(0.6), uInk = uniform(0.85), uTexel = uniform(new THREE.Vector2(1, 1));
  const uNear = uniform(camera.near), uFar = uniform(camera.far);

  // contornos (InkEffect de post.ts): laplaciana de 1/z; no se dibujan sobre la hierba y el follaje (alfa 0)
  const inked = Fn(() => {
    const p = uv();
    const c = color.sample(p);
    const d = depth.sample(p).r;
    const invZ = (o: N) => perspectiveDepthToViewZ(depth.sample(p.add(o)).r, uNear, uFar).negate().reciprocal();
    const w0 = perspectiveDepthToViewZ(d, uNear, uFar).negate().reciprocal();
    const ox = vec2(uTexel.x, 0), oy = vec2(0, uTexel.y);
    const lx = w0.mul(2).sub(invZ(ox)).sub(invZ(ox.negate()));
    const ly = w0.mul(2).sub(invZ(oy)).sub(invZ(oy.negate()));
    const edge = smoothstep(0.04, 0.12, max(lx, ly).div(w0)).mul(float(1).sub(smoothstep(30, 75, w0.reciprocal())));
    const skip = d.greaterThanEqual(1).or(c.a.lessThan(0.5));
    return select(skip, c.rgb, mix(c.rgb, c.rgb.mul(vec3(0.3, 0.28, 0.38)), edge.mul(uInk)));
  })();
  // rayos de sol (godrays.ts): máscara del cielo brillante a media resolución y marcha de cada píxel hacia el sol
  const uSunUv = uniform(new THREE.Vector2(0.5, 0.5)), uVisible = uniform(0), uAspect = uniform(1.78), uTime = uniform(0);
  const SAMPLES = q.tier === 'high' ? 40 : 28;
  const mask = rtt(Fn(() => {
    const c = color.sample(uv()).rgb;
    const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return vec4(c.mul(smoothstep(0.9, 1.3, lum)).mul(step(0.99999, depth.sample(uv()).r)), 1);
  })(), null, null, { resolutionScale: 0.5 });
  const rays = Fn(() => {
    const out = vec3(0).toVar();
    If(uVisible.greaterThan(0), () => {
      const d = uv().sub(uSunUv), da = d.mul(vec2(uAspect, 1)), dist = length(da);
      const reach = pow(clamp(float(1).sub(dist.div(1.4)), 0, 1), 1.4);
      const stepUv = d.mul(0.85 / SAMPLES);
      const h = fract(screenCoordinate.xy.dot(vec2(0.06711056, 0.00583715)).fract().mul(52.9829189));
      const p = uv().sub(stepUv.mul(h)).toVar(), acc = vec3(0).toVar(), w = float(1).toVar(), wsum = float(0).toVar();
      Loop(SAMPLES, () => {
        p.subAssign(stepUv);
        const e = smoothstep(vec2(0), vec2(0.03), p).mul(smoothstep(vec2(1), vec2(0.97), p));
        acc.addAssign(mask.sample(clamp(p, 0, 1)).rgb.mul(w.mul(e.x).mul(e.y)));
        wsum.addAssign(w);
        w.mulAssign(0.965);
      });
      acc.divAssign(wsum);
      const n = noise2(vec2(atan(da.y, da.x.add(1e-6)).mul(6), dist.mul(3).add(uTime.mul(0.05))));
      const strands = mix(1, smoothstep(0.25, 0.75, n).mul(1.4).add(0.3), 0.35);
      const shaft = mix(acc, vec3(1, 0.886, 0.722).mul(max(max(acc.r, acc.g), acc.b)), 0.35);
      out.assign(shaft.mul(reach.mul(strands).mul(uVisible).mul(0.55)));
    });
    return out;
  })();
  const lit = q.mobile ? inked : inked.add(rays);
  const exposed = lit.mul(uExposure);
  // como en postprocessing: el bloom mide el umbral sobre la escena sin exposición y se suma al color ya expuesto.
  // La intensidad de BloomNode no equivale a la de postprocessing: 0,18 da el mismo halo que 0,4 allí (comparado en capturas)
  const glow = bloom(vec4(lit, 1), 0.18, 0.7, 1.15) as N;
  glow.smoothWidth.value = 0.25;
  const graded = Fn(() => {
    let c: N = toneMapping(THREE.ACESFilmicToneMapping, float(1), exposed.add(glow.rgb)).rgb;
    // saturación +0,16 y contraste +0,08 con las fórmulas de la librería postprocessing
    const avg = c.r.add(c.g).add(c.b).div(3);
    c = c.add(vec3(avg).sub(c).mul(1 - 1 / (1.001 - 0.16))).min(1);
    c = c.sub(0.5).div(1 - 0.08).add(0.5);
    const off = 0.35, dark = 0.28;
    c = c.mul(smoothstep(0.8, off * 0.799, distance(uv(), vec2(0.5)).mul(dark + off)));
    return renderOutput(vec4(c, 1), THREE.NoToneMapping, THREE.SRGBColorSpace);
  })();
  // en móvil la densidad de píxeles ya disimula los dientes de sierra (igual que en WebGL)
  pipeline.outputNode = q.mobile ? graded : smaa(graded);

  let enabled = true, expo = 0.5, sunDir: THREE.Vector3 | null = null;
  const size = new THREE.Vector2(), clip = new THREE.Vector4(), vp = new THREE.Matrix4();
  /** dónde cae el sol en pantalla y cuánto se ve: igual que GodRaysEffect.sunOnScreen */
  const sunOnScreen = () => {
    if (!sunDir) return 0;
    vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    clip.set(camera.position.x + sunDir.x * 100, camera.position.y + sunDir.y * 100, camera.position.z + sunDir.z * 100, 1).applyMatrix4(vp);
    if (clip.w <= 0) return 0;
    const sx = (clip.x / clip.w) * 0.5 + 0.5, sy = (clip.y / clip.w) * 0.5 + 0.5;
    uSunUv.value.set(sx, 1 - sy); // en WebGPU la v de las texturas crece hacia abajo
    return THREE.MathUtils.clamp(Math.min((Math.min(sx, 1 - sx) + 0.25) / 0.35, (Math.min(sy, 1 - sy) + 0.25) / 0.35), 0, 1);
  };
  return {
    render: (dt) => {
      if (enabled) {
        uVisible.value = sunOnScreen(); uTime.value += dt;
        mask.autoUpdate = !q.mobile && uVisible.value > 0; // sin sol en pantalla no hace falta la máscara
        renderer.toneMapping = THREE.NoToneMapping; pipeline.render();
      }
      else { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = expo * 1.1; renderer.render(scene, camera); }
    },
    setSize: () => {
      renderer.getDrawingBufferSize(size);
      uTexel.value.set(1 / Math.max(1, size.x), 1 / Math.max(1, size.y));
      uAspect.value = size.x / Math.max(1, size.y);
    },
    setExposure: (v) => { expo = v; uExposure.value = v; },
    setEnabled: (on) => { enabled = on; },
    setSun: (dir) => { sunDir = dir; },
  };
}
