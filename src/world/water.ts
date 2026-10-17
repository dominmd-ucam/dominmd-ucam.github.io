import * as THREE from 'three';
import { Delaunay } from 'd3-delaunay';
import { HEIGHT_RANGE, WORLD_SIZE, buildHeightTexture } from './terrain';

const vert = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;

void wave(vec2 p, vec2 dir, float amp, float k, float speed, inout float h, inout vec2 g) {
  vec2 d = normalize(dir);
  float ph = dot(d, p) * k + uTime * speed;
  h += amp * sin(ph);
  g += amp * k * cos(ph) * d;
}

void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float h = 0.0; vec2 g = vec2(0.0);
  wave(w.xz, vec2(1.0, 0.3), 0.16, 0.35, 1.1, h, g);
  wave(w.xz, vec2(-0.6, 1.0), 0.09, 0.62, 1.5, h, g);
  wave(w.xz, vec2(0.2, -1.0), 0.04, 1.3, 2.1, h, g);
  // las olas se atenúan con la distancia a la cámara: la malla lejana es gruesa y así no parpadea al moverse
  float fadeW = 1.0 - smoothstep(60.0, 240.0, length(w.xz - cameraPosition.xz));
  w.y += h * fadeW;
  vWorld = w.xyz;
  vNormal = normalize(vec3(-g.x * fadeW, 1.0, -g.y * fadeW));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform sampler2D uHeight;
uniform float uWorld;
uniform vec2 uRange;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uLight;
uniform float uOuter;
uniform vec4 uRipple[6]; // x, z, instante de inicio, intensidad
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vWorld;
varying vec3 vNormal;

void main() {
  float dist0 = length(cameraPosition.xz - vWorld.xz);
  if (uOuter > 0.5 && dist0 < 430.0) discard;
  vec2 uv = vWorld.xz / uWorld + 0.5;
  float hs = texture2D(uHeight, uv).r * (uRange.y - uRange.x) + uRange.x;
  if (hs > 0.3) discard;
  float depth = -hs;

  vec3 fn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (fn.y < 0.0) fn = -fn;
  vec3 N = normalize(mix(vNormal, fn, 0.55));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 4.5, depth));

  col *= uLight;
  vec3 R = reflect(-V, N);
  vec3 skyRef = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.45));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col = mix(col, skyRef, 0.12 + fres * 0.6);
  float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 60.0);
  col += uSunColor * spec * 0.7;

  float n = sin(vWorld.x * 1.7 + uTime * 1.2) * sin(vWorld.z * 1.9 - uTime);
  float edge = 1.0 - smoothstep(0.0, 0.5 + 0.14 * n + 0.12 * sin(uTime * 1.3 + depth * 6.0), depth);
  float bands = smoothstep(0.55, 0.7, sin(depth * 18.0 - uTime * 1.6) * 0.5 + 0.5) * (1.0 - smoothstep(0.4, 1.4, depth)) * 0.35;
  float foam = clamp(edge + bands, 0.0, 1.0);
  // Olas capilares: anillos que se expanden y se apagan desde donde algo toca el agua
  for (int i = 0; i < 6; i++) {
    float age = uTime - uRipple[i].z;
    if (age > 0.0 && age < 2.6) {
      float d = distance(vWorld.xz, uRipple[i].xy);
      float r = age * 1.7;
      float w = 0.11 + age * 0.07;
      float ring = exp(-pow((d - r) / w, 2.0)) + 0.45 * exp(-pow((d - r * 0.62) / (w * 1.3), 2.0));
      foam = max(foam, ring * (1.0 - age / 2.6) * uRipple[i].w);
    }
  }
  col = mix(col, vec3(0.2 + 0.8 * uLight), foam * 0.85);

  float alpha = max(mix(0.72, 0.97, smoothstep(0.0, 2.2, depth)), foam);
  float dist = length(cameraPosition - vWorld);
  col = mix(col, uHorizon, smoothstep(250.0, 1800.0, dist));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const WAVES: [number, number, number, number, number][] = [[1, 0.3, 0.16, 0.35, 1.1], [-0.6, 1, 0.09, 0.62, 1.5], [0.2, -1, 0.04, 1.3, 2.1]];
/** Misma altura de ola que calcula el shader: sirve para barcas, nado y criaturas. */
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const [dx, dz, amp, k, sp] of WAVES) { const l = Math.hypot(dx, dz); h += amp * Math.sin(((dx * x + dz * z) / l) * k + t * sp); }
  return h;
}

export interface WaterEnv { sunDir: THREE.Vector3; sunColor: THREE.Color; zenith: THREE.Color; horizon: THREE.Color; light: number }

export interface Water {
  mesh: THREE.Mesh;
  /** Nueva onda en (x, z) en el instante t; `amp` 0–1. Se guardan las 6 más recientes. */
  ripple(x: number, z: number, t: number, amp?: number): void;
  update(t: number, center: THREE.Vector3, env: WaterEnv): void;
  /** Uniformes de la malla interior y del anillo exterior (para ajustarlos en vivo con ?tune). */
  uniformSets: Record<string, THREE.IUniform>[];
}

/**
 * Malla del agua: anillos de puntos con separación creciente (2,3 m junto al jugador → 28 m en el horizonte), triangulados con Delaunay.
 * Mismo principio que el terreno: los triángulos van donde se ven. Pasa de ~115.000 triángulos de rejilla a unos 6.000.
 */
function radialWaterGeometry(): THREE.BufferGeometry {
  let seed = 31337;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pts: [number, number][] = [[0, 0]];
  const maxR = 450;
  for (let rho = 2.3; rho <= maxR + 20; ) {
    const step = THREE.MathUtils.lerp(2.3, 28, THREE.MathUtils.smoothstep(rho, 30, 420));
    const n = Math.max(6, Math.round((2 * Math.PI * rho) / step));
    const off = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI * 2 / n) * 0.55;
      const r = rho + (rnd() - 0.5) * step * 0.55;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    rho += step;
  }
  const tri = Delaunay.from(pts).triangles;
  const pos = new Float32Array(pts.length * 3);
  pts.forEach(([x, z], i) => { pos[i * 3] = x; pos[i * 3 + 2] = z; });
  const index = new Uint32Array(tri.length);
  for (let i = 0; i < tri.length; i += 3) {
    const a = tri[i], b = tri[i + 1], c = tri[i + 2];
    const cross = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
    if (cross > 0) { index[i] = a; index[i + 1] = c; index[i + 2] = b; } else { index[i] = a; index[i + 1] = b; index[i + 2] = c; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

export function buildWater(sunDir: THREE.Vector3): Water {
  const geo = radialWaterGeometry();
  const uniforms = {
    uTime: { value: 0 },
    uHeight: { value: buildHeightTexture() },
    uWorld: { value: WORLD_SIZE },
    uRange: { value: new THREE.Vector2(HEIGHT_RANGE[0], HEIGHT_RANGE[1]) },
    uShallow: { value: new THREE.Color('#5be6d6') },
    uDeep: { value: new THREE.Color('#1aa5cc') },
    uZenith: { value: new THREE.Color('#6fb7ee') },
    uHorizon: { value: new THREE.Color('#cfe6f3') },
    uLight: { value: 1 },
    uOuter: { value: 0 },
    uRipple: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color('#fff2cf') },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  // anillo exterior grueso hasta el horizonte (mismo shader, sin descartar la zona cercana)
  const outerGeo = new THREE.PlaneGeometry(6000, 6000, 80, 80);
  outerGeo.rotateX(-Math.PI / 2);
  const outerMat = mat.clone();
  outerMat.uniforms.uOuter.value = 1;
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.position.y = -0.06;
  outer.frustumCulled = false;
  mesh.add(outer);
  const all = [uniforms, outerMat.uniforms];
  let ripN = 0;
  return {
    mesh,
    uniformSets: all,
    ripple(x, z, t, amp = 1) {
      for (const u of all) (u.uRipple.value as THREE.Vector4[])[ripN % 6].set(x, z, t, amp);
      ripN++;
    },
    update(t, center, env) {
      for (const u of all) {
        u.uTime.value = t;
        u.uSunDir.value.copy(env.sunDir);
        u.uSunColor.value.copy(env.sunColor);
        u.uZenith.value.copy(env.zenith);
        u.uHorizon.value.copy(env.horizon);
        u.uLight.value = env.light;
      }
      // el plano sigue al jugador (en pasos de 3 m) para mantener la densidad de olas cerca de la cámara
      mesh.position.x = Math.round(center.x / 3) * 3;
      mesh.position.z = Math.round(center.z / 3) * 3;
    },
  };
}
