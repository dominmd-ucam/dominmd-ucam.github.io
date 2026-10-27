import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { getTsl, type TslTag, type U } from './tag';

/*
 * Versión TSL (nodos de three, compilan a WGSL) de los shaders GLSL del modo 3D. Solo se carga con el motor WebGPU.
 * Cada función replica un `onBeforeCompile` o `ShaderMaterial` de src/world/*: si cambias uno, cambia también su gemelo aquí.
 *  - luz cel + borde (toon.ts)            → ToonLighting
 *  - inserciones tras `#include <color_fragment>` → gancho `color` (se ejecuta tras setupDiffuseColor, con mapas y colores de vértice ya aplicados)
 *  - inserciones en `#include <begin_vertex>`     → gancho `pre` (antes de la instancia) o `post` (después: espacio de la malla)
 *  - `gl_FragColor.a = uAlpha` (máscara de contornos) → outputNode
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- los tipos de TSL no siguen la aritmética entre vectores (vec2 × float, .xz…): aquí se usan sin tipar */
type N = any;
const {
  Fn, If, Discard, float, int, vec2, vec3, vec4, mat3, mat4, ivec2, uniform, uniformArray, texture, buffer, attribute, varying,
  instanceIndex, batchIndirectIndex, instancedBufferAttribute, instancedDynamicBufferAttribute, textureLoad, textureSize, OnBeforeFrameUpdate,
  sin, cos, fract, floor, dot, mix, smoothstep, step, length, normalize, abs, pow, max, clamp, exp, distance, reflect, cross, dFdx, dFdy,
  positionLocal, positionWorld, positionGeometry, normalGeometry, normalWorld, normalView, positionViewDirection, cameraPosition,
  cameraProjectionMatrix, cameraViewMatrix, modelWorldMatrix, diffuseColor, output,
  BRDF_GGX, BRDF_Lambert, F_Schlick, diffuseContribution, specularColor, specularColorBlended, specularF90, roughness,
} = TSL as any;

/* ---------- uniformes: el mismo objeto { value } que usa WebGL pasa a leer y escribir el nodo ---------- */
const uniNodes = new WeakMap<object, N>();
function un(u: U | undefined): N {
  if (!u) throw new Error('tsl: falta un uniforme');
  let n = uniNodes.get(u);
  if (n) return n;
  const v = u.value as { isTexture?: boolean };
  n = v && v.isTexture ? texture(v as THREE.Texture) : uniform(v as never);
  Object.defineProperty(u, 'value', { get: () => n.value, set: (x) => { n.value = x; }, configurable: true, enumerable: true });
  uniNodes.set(u, n);
  return n;
}

/* ---------- ruido (mismo algoritmo que CLOUD_GLSL / NOISE3_GLSL de toon.ts) ---------- */
const hash2 = Fn(([p]: N[]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)))
  .setLayout({ name: 'gHash', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
const noise2 = Fn(([p]: N[]) => {
  const i = floor(p), f = fract(p), u = f.mul(f).mul(f.mul(-2).add(3));
  return mix(mix(hash2(i), hash2(i.add(vec2(1, 0))), u.x), mix(hash2(i.add(vec2(0, 1))), hash2(i.add(1)), u.x), u.y);
}).setLayout({ name: 'gNoise', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
const cloudShadow = Fn(([xz, t]: N[]) => {
  const q = xz.mul(0.045).add(vec2(t.mul(0.022), t.mul(0.011)));
  const n = noise2(q).mul(0.65).add(noise2(q.mul(2.3).add(5.1)).mul(0.35));
  return smoothstep(0.56, 0.66, n);
}).setLayout({ name: 'cloudShadow', type: 'float', inputs: [{ name: 'xz', type: 'vec2' }, { name: 't', type: 'float' }] });

const n3Hash = Fn(([p0]: N[]) => {
  const p = fract(p0.mul(0.3183099).add(0.1)).mul(17.0);
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
}).setLayout({ name: 'n3Hash', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });
const n3 = Fn(([x]: N[]) => {
  const i = floor(x), f = fract(x), u = f.mul(f).mul(f.mul(-2).add(3));
  const h = (a: number, b: number, c: number) => n3Hash(i.add(vec3(a, b, c)));
  return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), u.x), mix(h(0, 1, 0), h(1, 1, 0), u.x), u.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), u.x), mix(h(0, 1, 1), h(1, 1, 1), u.x), u.y), u.z);
}).setLayout({ name: 'n3', type: 'float', inputs: [{ name: 'x', type: 'vec3' }] });
const fbm3 = Fn(([p0]: N[]) => {
  let p: N = p0, a = 0.5, s: N = float(0);
  for (let i = 0; i < 4; i++) { s = s.add(n3(p).mul(a)); p = p.mul(2.03); a *= 0.5; }
  return s;
}).setLayout({ name: 'fbm3', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });

/* ---------- matrices de instancia (para el viento: la fase y el empuje dependen de dónde está cada planta) ---------- */
const matBuffers = new WeakMap<THREE.InstancedBufferAttribute, THREE.InstancedInterleavedBuffer>();
/** Matriz de la instancia actual de un InstancedMesh (misma lógica que la de three, que no la expone). */
function instanceMatrixOf(builder: N, im: THREE.InstancedBufferAttribute): N {
  const count = Math.max(im.count, 1);
  if (count * 64 <= builder.getUniformBufferLimit()) return buffer(im.array as Float32Array, 'mat4', count).element(instanceIndex);
  let ib = matBuffers.get(im);
  if (!ib) {
    const fresh = new THREE.InstancedInterleavedBuffer(im.array as Float32Array, 16, 1);
    matBuffers.set(im, (ib = fresh));
    OnBeforeFrameUpdate(() => { if (fresh.version !== im.version) fresh.version = im.version; });
  }
  const f = im.usage === THREE.DynamicDrawUsage ? instancedDynamicBufferAttribute : instancedBufferAttribute;
  return mat4(f(ib as never, 'vec4', 16, 0), f(ib as never, 'vec4', 16, 4), f(ib as never, 'vec4', 16, 8), f(ib as never, 'vec4', 16, 12));
}
/** Matriz de la instancia actual de un BatchedMesh (se lee de su textura, con el índice que deja `batch()`). */
function batchMatrixOf(bm: THREE.BatchedMesh): N {
  const tex = (bm as unknown as { _matricesTexture: THREE.DataTexture })._matricesTexture;
  const size = int(textureSize(textureLoad(tex), 0).x);
  const j = int(batchIndirectIndex).mul(4);
  const x = j.mod(size), y = j.div(size);
  return mat4(textureLoad(tex, ivec2(x, y)), textureLoad(tex, ivec2(x.add(1), y)), textureLoad(tex, ivec2(x.add(2), y)), textureLoad(tex, ivec2(x.add(3), y)));
}

/* ---------- ganchos por tipo de material ---------- */
interface Ctx { m: IslandMaterial; t: TslTag; builder: N }
interface Hooks {
  pre?(c: Ctx): void;
  post?(c: Ctx): void;
  color?(c: Ctx): void;
  setup?(c: Ctx): void;
}

const alphaMask = (c: Ctx) => { c.m.outputNode = vec4(output.rgb, un(c.t.u.uAlpha)); };

const HOOKS: Record<TslTag['kind'], Hooks> = {
  grass: {
    // grass.ts: el desplazamiento se calcula en el mundo; aquí la instancia ya está aplicada, así que se suma tal cual
    post({ m, t, builder }) {
      const uTime = un(t.u.uTime), uPlayer = un(t.u.uPlayer);
      const im = instanceMatrixOf(builder, (builder.object as THREE.InstancedMesh).instanceMatrix);
      const ip = im.element(3).xz, py = im.element(3).y;
      const bladeH = length(im.element(1).xyz);
      const y = positionGeometry.y, bend = y.mul(y);
      const windDir = vec2(0.8, 0.6);
      const along = dot(ip, windDir);
      const gust = sin(along.mul(0.11).sub(uTime.mul(0.85))).mul(0.5).add(0.5);
      const wave = sin(along.mul(0.8).sub(uTime.mul(2.3)).add(ip.y.mul(0.15))).mul(0.5).add(0.5);
      const sway = gust.mul(0.8).add(0.2).mul(wave.mul(0.55).add(0.45));
      const dp = ip.sub(uPlayer.xz), dist = length(dp);
      const push = float(1).sub(smoothstep(0.2, 1.0, dist)).mul(step(abs(uPlayer.y.sub(py)), 1.5));
      const off = windDir.mul(sway.mul(0.38))
        .add(vec2(windDir.y.negate(), windDir.x).mul(sin(uTime.mul(1.7).add(ip.x.mul(1.3)).add(ip.y.mul(0.7))).mul(0.06)))
        .add(dp.div(max(dist, 0.001)).mul(push.mul(0.75)));
      positionLocal.addAssign(vec3(off.x, dot(off, off).mul(-0.45), off.y).mul(bend.mul(bladeH)));
      m.vars = {
        vGust: varying(gust.mul(wave).mul(y).mul(float(1).sub(push)), 'vGust'), vCloud: varying(cloudShadow(ip, uTime), 'vCloud'),
        vBH: varying(y, 'vBH'), vBladeN: varying(normalize(im.element(2).xyz), 'vBladeN'),
      };
    },
    color({ m }) {
      diffuseColor.rgb.addAssign(vec3(0.07, 0.08, 0.025).mul(m.vars!.vGust));
      diffuseColor.rgb.mulAssign(float(1).sub(m.vars!.vCloud.mul(0.2)));
    },
    setup({ m, t }) {
      // la misma normal (+Y) por las dos caras, sin la vuelta de la cara trasera
      m.normalNode = normalize(cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz);
      // contraluz (grass.ts): mirando al sol a través de la hoja, más en la punta y en las hojas de canto
      // m.vars los deja el gancho de vértice, que se construye después de setup: se leen dentro del Fn (al compilar)
      const trans = Fn(() => {
        const v = m.vars!, L = un(t.u.uSunDir), V = normalize(cameraPosition.sub(positionWorld));
        const back = pow(max(dot(V, L.negate()), 0), 3);
        const edge = float(1).sub(abs(dot(v.vBladeN, L)));
        return un(t.u.uTrans).mul(back).mul(v.vBH.mul(v.vBH)).mul(edge.mul(0.65).add(0.35)).mul(float(1).sub(v.vCloud.mul(0.7))).mul(0.55);
      });
      m.outputNode = vec4(output.rgb.add(trans()), un(t.u.uAlpha));
    },
  },

  foliage: {
    // nature.ts (patchFoliage): viento en el espacio de la planta y empuje del personaje en el mundo
    post({ t, builder }) {
      const uTime = un(t.u.uTime), uPlayer = un(t.u.uPlayer), amp = Number(t.k?.amp ?? 0.02);
      const obj = builder.object;
      let ip: N = vec3(0), rot: N = mat3(1, 0, 0, 0, 1, 0, 0, 0, 1);
      if (obj.isBatchedMesh) { const bm = batchMatrixOf(obj as THREE.BatchedMesh); ip = bm.element(3).xyz; rot = mat3(bm); }
      const p = positionGeometry;
      const bend = max(p.y, 0).mul(amp);
      const wind = vec3(
        sin(uTime.mul(1.1).add(ip.x.mul(0.6)).add(ip.z.mul(0.4)).add(p.y.mul(0.5))).mul(bend), 0,
        cos(uTime.mul(0.8).add(ip.z.mul(0.5)).add(p.x.mul(0.7))).mul(bend).mul(0.7));
      positionLocal.addAssign(rot.mul(wind));
      const wp = positionLocal;
      const dp = wp.xz.sub(uPlayer.xz), dist = length(dp), hy = wp.y.sub(ip.y);
      const push = float(1).sub(smoothstep(0.25, 1.1, dist)).mul(smoothstep(0.0, 0.5, hy)).mul(float(1).sub(smoothstep(1.2, 1.6, hy)))
        .mul(step(abs(uPlayer.y.sub(ip.y)), 1.5));
      const off = dp.div(max(dist, 0.001)).mul(push.mul(0.55));
      positionLocal.addAssign(vec3(off.x, push.mul(-0.15), off.y));
    },
    color({ t }) {
      // hojas que vienen rojas en el kit: se repintan en verde conservando el dibujo (su luminosidad)
      if (t.k?.tint) diffuseColor.rgb.assign(un(t.u.uTint).mul(dot(diffuseColor.rgb, vec3(0.5, 0.35, 0.15)).mul(1.6).add(0.45)));
    },
    setup: alphaMask,
  },

  vines: {
    // diorama.ts: las hojas de las enredaderas se mecen según su posición
    pre({ t, builder }) {
      const ip = instanceMatrixOf(builder, (builder.object as THREE.InstancedMesh).instanceMatrix).element(3).xyz;
      positionLocal.x.addAssign(sin(un(t.u.uTime).mul(1.4).add(ip.y.mul(1.7)).add(ip.x)).mul(0.08));
    },
  },

  flock: {
    // flock.ts: aleteo; cada ave tiene su fase y a ratos planea
    pre({ t }) {
      const uTime = un(t.u.uTime), aPhase = attribute('aPhase', 'float'), aWing = attribute('aWing', 'float');
      const glide = pow(sin(uTime.mul(0.6).add(aPhase.mul(3))).mul(0.5).add(0.5), 0.6).mul(0.65).add(0.35);
      positionLocal.y.addAssign(aWing.mul(sin(uTime.mul(8).add(aPhase))).mul(0.55).mul(glide));
    },
  },

  fish: {
    // life.ts: destello plateado del costado cuando mira a la cámara (por encima de 1: el agua lo atenúa y el bloom lo recoge)
    color() {
      const vFlash = varying(attribute('aFlash', 'float').mul(abs(normalGeometry.x)).mul(pow(abs(normalView.z), 0.7)), 'vFlash');
      diffuseColor.rgb.assign(mix(diffuseColor.rgb, vec3(5.5, 5.8, 6.0), clamp(vFlash.mul(1.4), 0, 1)));
    },
  },

  stone: {
    // stone.ts: vetas, musgo en las caras de arriba y borde de sombra de pincel
    color({ m, t }) {
      const w = positionWorld, nrm = normalize(normalWorld);
      diffuseColor.rgb.mulAssign(step(0.5, fract(w.y.mul(1.5).add(fbm3(w.mul(0.7)).mul(1.6)))).mul(0.1).add(0.9));
      const moss = smoothstep(0.52, 0.64, nrm.y.add(fbm3(w.mul(1.3)).sub(0.5).mul(0.7))).mul(un(t.u.uMossAmt));
      diffuseColor.rgb.assign(mix(diffuseColor.rgb, un(t.u.uMoss).mul(n3(w.mul(4.0)).mul(0.24).add(0.88)), moss));
      m.toonEdgeNode = fbm3(w.mul(1.6)).sub(0.5).mul(0.5);
    },
  },

  terrain: {
    color({ t }) {
      const u = t.u, uTime = un(u.uTime), A = un(u.uCaveA), B = un(u.uCaveB), C = un(u.uCaveC);
      const w = positionWorld, vUp = normalGeometry.y;
      // la pared de la meseta tapa la boca de la cueva: se recorta lo que quede dentro del tubo de roca (como en terrain.ts)
      Fn(() => {
        const o = w.xz.sub(A.xy);
        const s = dot(o, A.zw), v = o.x.negate().mul(A.w).add(o.y.mul(A.z));
        If(s.greaterThanEqual(B.w).and(s.lessThanEqual(C.x.add(C.y))), () => {
          const fl = B.x.add(s.mul(0.05)), y = w.y.sub(fl);
          If(y.greaterThanEqual(0.08), () => {
            const room = max(0, C.y.mul(C.y).sub(s.sub(C.x).mul(s.sub(C.x)))).sqrt();
            const before = s.lessThan(C.x);
            const hw = before.select(max(B.y, room), room);
            const hh = before.select(max(B.z, hw.mul(0.95)), hw.mul(0.95));
            const e = vec2(v.div(hw.mul(0.84)), y.div(hh.mul(0.84)));
            If(dot(e, e).lessThan(1), () => { Discard(); });
          });
        });
      })();
      const land = smoothstep(0.55, 1.05, w.y);
      const sp = w.xz;
      if (t.k?.detail) {
        // suelo pintado a mano: manchas de dos tonos, trazos en la dirección del viento, ondas en la arena y vetas en la roca
        const big = noise2(sp.mul(0.18)).mul(0.65).add(noise2(sp.mul(0.55).add(7.3)).mul(0.35));
        const tone = smoothstep(0.48, 0.56, big);
        const rs = vec2(sp.x.mul(0.8).add(sp.y.mul(0.6)), sp.x.mul(-0.6).add(sp.y.mul(0.8)));
        const strokes = noise2(vec2(rs.x.mul(0.9), rs.y.mul(3.2))).mul(0.6).add(noise2(sp.mul(2.7)).mul(0.4));
        const grassy = land.mul(smoothstep(0.75, 0.9, vUp));
        diffuseColor.rgb.mulAssign(mix(float(1), mix(0.9, 1.07, tone).mul(strokes.mul(0.12).add(0.94)), grassy));
        diffuseColor.rgb.assign(mix(diffuseColor.rgb, diffuseColor.rgb.mul(vec3(1.06, 1.04, 0.86)), tone.mul(grassy).mul(0.5)));
        const sandy = float(1).sub(land).mul(smoothstep(-0.3, 0.2, w.y));
        const ripple = sin(dot(sp, vec2(0.9, 0.45)).mul(3.0).add(noise2(sp.mul(0.7)).mul(5.0)));
        diffuseColor.rgb.mulAssign(sandy.mul(ripple.mul(0.035).add(hash2(floor(sp.mul(9.0))).sub(0.5).mul(0.06))).add(1));
        const rocky = land.mul(float(1).sub(smoothstep(0.62, 0.8, vUp)));
        const strata = smoothstep(0.35, 0.5, fract(w.y.mul(1.6).add(noise2(sp.mul(0.6)).mul(0.8))));
        diffuseColor.rgb.mulAssign(float(1).sub(rocky.mul(strata).mul(0.14)));
      }
      // camino: tierra con borde irregular y alguna piedrecita
      const pm = un(u.uPath).sample(sp.div(Number(t.k?.world ?? 320)).add(0.5)).r;
      const pv = pm.add(noise2(sp.mul(1.4)).sub(0.5).mul(0.28));
      const pEdge = smoothstep(0.4, 0.47, pv);
      let dirt: N = mix(vec3(0.56, 0.42, 0.27), vec3(0.72, 0.58, 0.4), noise2(sp.mul(0.9)));
      dirt = dirt.mul(hash2(floor(sp.mul(6.0))).mul(0.16).add(0.92));
      dirt = mix(dirt.mul(0.8), dirt, smoothstep(0.47, 0.58, pv));
      diffuseColor.rgb.assign(mix(diffuseColor.rgb, dirt, pEdge.mul(land)));
      // cáusticas: dos redes de Voronoi que se deslizan, apagadas con la profundidad y junto a la orilla
      const depthFade = smoothstep(-0.12, -0.55, w.y).mul(float(1).sub(smoothstep(-1.4, -3.4, w.y)));
      const net1 = causticNet(sp.mul(0.42).add(vec2(uTime.mul(0.05), 0)), uTime);
      const net2 = causticNet(sp.mul(0.63).add(vec2(7.3, uTime.mul(-0.045))), uTime);
      const caus = net1.add(net2).mul(0.5).mul(net1.mul(net2).mul(0.9).add(0.55));
      diffuseColor.rgb.addAssign(vec3(0.5, 0.85, 0.8).mul(caus).mul(depthFade).mul(un(u.uCaus)));
      diffuseColor.rgb.mulAssign(float(1).sub(cloudShadow(sp, uTime).mul(0.2).mul(smoothstep(-0.2, 0.3, w.y))));
    },
  },

  water: { setup: waterMaterial },
  sky: { setup: skyMaterial },
};

const hashV2 = Fn(([p0]: N[]) => {
  const p = vec2(dot(p0, vec2(127.1, 311.7)), dot(p0, vec2(269.5, 183.3)));
  return fract(sin(p).mul(43758.5453));
}).setLayout({ name: 'hashV2', type: 'vec2', inputs: [{ name: 'p', type: 'vec2' }] });
/** Bordes de Voronoi (F2 − F1 ≈ 0): líneas finas brillantes alrededor de parches oscuros. Los puntos bailan con el tiempo. */
const causticNet = Fn(([p, time]: N[]) => {
  const i = floor(p), f = fract(p);
  const d1 = float(8).toVar(), d2 = float(8).toVar();
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const g = vec2(x, y);
    const o = sin(time.mul(0.55).add(hashV2(i.add(g)).mul(6.2831))).mul(0.5).add(0.5);
    const d = length(g.add(o).sub(f));
    If(d.lessThan(d1), () => { d2.assign(d1); d1.assign(d); }).ElseIf(d.lessThan(d2), () => { d2.assign(d); });
  }
  return float(1).sub(smoothstep(0.0, 0.17, d2.sub(d1)));
}).setLayout({ name: 'causticNet', type: 'float', inputs: [{ name: 'p', type: 'vec2' }, { name: 'time', type: 'float' }] });

/* ---------- agua (water.ts): olas, bandas de color por profundidad, reflejo pintado, espuma y ondas capilares ---------- */
function waterMaterial({ m, t }: Ctx) {
  const u = t.u, uTime = un(u.uTime);
  const ripples = uniformArray(u.uRipple.value as THREE.Vector4[], 'vec4');
  // vértice: en el mundo, como el GLSL
  const w0 = modelWorldMatrix.mul(vec4(positionGeometry, 1)).xyz;
  let h: N = float(0), g: N = vec2(0);
  for (const [dx, dz, amp, k, speed] of [[1, 0.3, 0.16, 0.35, 1.1], [-0.6, 1, 0.09, 0.62, 1.5], [0.2, -1, 0.04, 1.3, 2.1]]) {
    const d = new THREE.Vector2(dx, dz).normalize();
    const ph = dot(vec2(d.x, d.y), w0.xz).mul(k).add(uTime.mul(speed));
    h = h.add(sin(ph).mul(amp));
    g = g.add(vec2(d.x, d.y).mul(cos(ph).mul(amp * k)));
  }
  const fadeW = float(1).sub(smoothstep(60, 240, length(w0.xz.sub(cameraPosition.xz))));
  const wpos = vec3(w0.x, w0.y.add(h.mul(fadeW)), w0.z);
  m.vertexNode = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(wpos, 1));
  const vWorld = varying(wpos, 'vWorld');
  const vNormal = varying(normalize(vec3(g.x.mul(fadeW).negate(), 1, g.y.mul(fadeW).negate())), 'vNormal');

  m.colorNode = Fn(() => {
    const dist0 = length(cameraPosition.xz.sub(vWorld.xz));
    If(un(u.uOuter).greaterThan(0.5).and(dist0.lessThan(430)), () => { Discard(); });
    const range = un(u.uRange);
    const hs = un(u.uHeight).sample(vWorld.xz.div(un(u.uWorld)).add(0.5)).r.mul(range.y.sub(range.x)).add(range.x);
    If(hs.greaterThan(0.3), () => { Discard(); });
    const depth = hs.negate();
    const fn = normalize(cross(dFdx(vWorld), dFdy(vWorld))).toVar();
    If(fn.y.lessThan(0), () => { fn.assign(fn.negate()); });
    const N = normalize(mix(vNormal, fn, 0.55));
    const V = normalize(cameraPosition.sub(vWorld));
    const dq = smoothstep(0, 4.5, depth.add(sin(vWorld.x.mul(0.9).add(uTime.mul(0.4))).mul(sin(vWorld.z.mul(0.8).sub(uTime.mul(0.3)))).mul(0.35)));
    const light = un(u.uLight), sunCol = un(u.uSunColor), sunDir = un(u.uSunDir), horizon = un(u.uHorizon);
    const col = mix(un(u.uShallow), un(u.uDeep), mix(floor(dq.mul(3).add(0.5)).div(3), dq, 0.25)).mul(light).toVar();
    const R = reflect(V.negate(), N);
    const skyRef = mix(horizon, un(u.uZenith), pow(clamp(R.y, 0, 1), 0.45));
    const fres = pow(float(1).sub(max(dot(N, V), 0)), 3);
    col.assign(mix(col, skyRef, fres.mul(0.6).add(0.12)));
    const sunR = max(dot(reflect(sunDir.negate(), N), V), 0);
    col.addAssign(sunCol.mul(smoothstep(0.3, 0.45, pow(sunR, 60))).mul(0.7));
    const glint = step(0.9, sin(vWorld.x.mul(3.1).add(uTime.mul(1.7)).add(sin(vWorld.z.mul(2.3))))
      .mul(sin(vWorld.z.mul(3.7).sub(uTime.mul(1.3)).add(sin(vWorld.x.mul(1.9))))));
    col.addAssign(sunCol.mul(glint).mul(pow(sunR, 4).add(0.25)).mul(smoothstep(1, 3, depth)).mul(float(1).sub(smoothstep(40, 120, dist0))));
    const n = sin(vWorld.x.mul(1.7).add(uTime.mul(1.2))).mul(sin(vWorld.z.mul(1.9).sub(uTime)));
    const edge = float(1).sub(smoothstep(0, n.mul(0.14).add(0.5).add(sin(uTime.mul(1.3).add(depth.mul(6))).mul(0.12)), depth));
    const bands = smoothstep(0.55, 0.7, sin(depth.mul(18).sub(uTime.mul(1.6))).mul(0.5).add(0.5)).mul(float(1).sub(smoothstep(0.4, 1.4, depth))).mul(0.35);
    const foam = clamp(edge.add(bands), 0, 1).toVar();
    // olas capilares: anillos que se expanden y se apagan desde donde algo toca el agua
    for (let i = 0; i < 6; i++) {
      const r = ripples.element(i);
      const age = uTime.sub(r.z);
      const d = distance(vWorld.xz, r.xy), rad = age.mul(1.7), wd = age.mul(0.07).add(0.11);
      const ring = exp(pow(d.sub(rad).div(wd), 2).negate()).add(exp(pow(d.sub(rad.mul(0.62)).div(wd.mul(1.3)), 2).negate()).mul(0.45));
      const live = step(0.0001, age).mul(step(age, 2.6));
      foam.assign(max(foam, ring.mul(float(1).sub(age.div(2.6))).mul(r.w).mul(live)));
    }
    const f = smoothstep(0.4, 0.55, foam);
    col.assign(mix(col, vec3(light.mul(0.8).add(0.2)), f.mul(0.9)));
    const alpha = max(mix(0.72, 0.97, smoothstep(0, 2.2, depth)), f);
    col.assign(mix(col, horizon, smoothstep(250, 1800, length(cameraPosition.sub(vWorld)))));
    return vec4(col, alpha);
  })();
}

/* ---------- cielo pintado (dawn.ts) ---------- */
function skyMaterial({ m, t }: Ctx) {
  const u = t.u;
  const w = modelWorldMatrix.mul(vec4(positionGeometry, 1));
  const clip = cameraProjectionMatrix.mul(cameraViewMatrix).mul(w);
  m.vertexNode = vec4(clip.xy, clip.w.mul(0.99999), clip.w); // en el fondo, sin recortarse contra el plano lejano
  const vWorld = varying(w.xyz, 'vWorld');
  m.colorNode = Fn(() => {
    const sunDir = un(u.uSunDir), uTime = un(u.uTime), tint = un(u.uSunTint), horizon = un(u.uHorizon);
    const d = normalize(vWorld.sub(cameraPosition));
    const c = mix(horizon, un(u.uZenith), pow(max(d.y, 0), 0.35)).toVar();
    const s = max(dot(d, sunDir), 0);
    c.assign(mix(c, tint, pow(s, 6).mul(0.6)));
    c.addAssign(tint.mul(smoothstep(0.9988, 0.9992, s)).mul(1.5));
    If(d.y.greaterThan(0), () => {
      const uv = d.xz.div(d.y.add(0.12)).mul(0.55).add(vec2(uTime.mul(0.006), uTime.mul(0.002)));
      const den = fbm3(vec3(uv.mul(1.3), 1));
      const lit = fbm3(vec3(uv.mul(1.3).add(sunDir.xz.mul(0.08)), 1));
      const mask = smoothstep(0.51, 0.525, den).mul(smoothstep(0, 0.2, d.y));
      const cloud = mix(mix(un(u.uCloudShade), un(u.uCloudLit), step(lit, den.sub(0.012))), tint, pow(s, 4).mul(0.5));
      c.assign(mix(c, cloud, mask));
    });
    c.assign(mix(c, horizon, float(1).sub(smoothstep(0, 0.1, d.y))));
    return c.mul(un(u.uGain));
  })();
}

/* ---------- luz cel (toon.ts): dos tonos con borde suave y luz de borde cálida ---------- */
class ToonLighting extends THREE.PhysicalLightingModel {
  direct({ lightDirection, lightColor, reflectedLight }: N, builder: N) {
    const mat = builder.material as IslandMaterial;
    const dotNL = normalView.dot(lightDirection).clamp();
    const edge = mat.toonEdgeNode ?? float(0);
    const irradiance = smoothstep(0, 0.08, dotNL.add(edge)).mul(dotNL.mul(0.5).add(0.5)).mul(lightColor).toVar();
    const self = this as N;
    const halfDir = lightDirection.add(positionViewDirection).normalize();
    const dotVH = positionViewDirection.dot(halfDir).clamp();
    const F = F_Schlick({ f0: specularColor, f90: specularF90, dotVH } as never) as N;
    const specularBRDF = BRDF_GGX({ lightDirection, f0: specularColorBlended, f90: 1, roughness, f: self.iridescenceFresnel, USE_IRIDESCENCE: self.iridescence, USE_ANISOTROPY: self.anisotropy } as never) as N;
    reflectedLight.directDiffuse.addAssign(irradiance.mul(BRDF_Lambert({ diffuseColor: diffuseContribution } as never)).mul(F.oneMinus()));
    reflectedLight.directSpecular.addAssign(irradiance.mul(specularBRDF).mul(self.multiScatteringCompensation));
    if (!('TOON_NO_RIM' in (mat.defines ?? {}))) {
      const rimV = float(1).sub(dot(normalView, positionViewDirection).clamp());
      const rim = smoothstep(0.55, 0.65, rimV).mul(smoothstep(-0.2, 0.25, dot(normalView, lightDirection)));
      reflectedLight.directDiffuse.addAssign(lightColor.mul(diffuseContribution).mul(rim).mul(0.7));
    }
  }
}

/* ---------- materiales: three convierte cada material clásico en su versión de nodos; aquí se le añaden los ganchos ---------- */
interface IslandMaterial extends THREE.NodeMaterial {
  /** desplaza la frontera luz/sombra (ver toonEdge en toon.ts) */
  toonEdgeNode?: N;
  /** varyings que un gancho de vértice deja para el de color */
  vars?: Record<string, N>;
}

function withHooks<T extends new (...a: never[]) => THREE.NodeMaterial>(Base: T, toon: boolean) {
  return class extends (Base as new () => THREE.NodeMaterial) {
    toonEdgeNode?: N;
    vars?: Record<string, N>;
    private ctx(builder: N): Ctx | null {
      const t = getTsl(this);
      return t ? { m: this as unknown as IslandMaterial, t, builder } : null;
    }
    setup(builder: N) {
      const c = this.ctx(builder);
      if (c) HOOKS[c.t.kind].setup?.(c);
      return super.setup(builder);
    }
    setupPosition(builder: N) {
      const c = this.ctx(builder), h = c && HOOKS[c.t.kind];
      h?.pre?.(c!);
      super.setupPosition(builder);
      h?.post?.(c!);
      return positionLocal;
    }
    setupDiffuseColor(builder: N) {
      super.setupDiffuseColor(builder);
      const c = this.ctx(builder);
      if (c) HOOKS[c.t.kind].color?.(c);
    }
    setupLightingModel() {
      return toon ? new ToonLighting() : super.setupLightingModel();
    }
  };
}

/** Registra los materiales del juego en el renderer WebGPU (sustituye al parche de ShaderChunk de toon.ts). */
export function installIslandMaterials(renderer: THREE.WebGPURenderer) {
  // addMaterial no sustituye un tipo ya registrado (solo avisa): se escribe en el mapa directamente
  const set = (cls: unknown, type: string) => (renderer.library as unknown as { materialNodes: Map<string, unknown> }).materialNodes.set(type, cls);
  set(withHooks(THREE.MeshStandardNodeMaterial, true), 'MeshStandardMaterial');
  set(withHooks(THREE.MeshPhysicalNodeMaterial, true), 'MeshPhysicalMaterial');
  set(withHooks(THREE.MeshBasicNodeMaterial, false), 'MeshBasicMaterial');
  // ShaderMaterial: solo los que llevan etiqueta (agua y cielo); el resto no tiene equivalente
  set(withHooks(THREE.MeshBasicNodeMaterial, false), 'ShaderMaterial');
}

export { hash2, noise2, fbm3, n3, cloudShadow };
