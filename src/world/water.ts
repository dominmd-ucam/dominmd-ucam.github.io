import * as THREE from 'three';
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
  w.y += h;
  vWorld = w.xyz;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
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
  update(t: number, center: THREE.Vector3, env: WaterEnv): void;
}

export function buildWater(sunDir: THREE.Vector3): Water {
  const geo = new THREE.PlaneGeometry(900, 900, 300, 300);
  geo.rotateX(-Math.PI / 2);
  // vértices desplazados al azar (según su posición): facetas irregulares en vez de una rejilla regular
  const pp = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), z = pp.getZ(i);
    pp.setX(i, x + Math.sin(x * 12.9898 + z * 78.233) * 1.1);
    pp.setZ(i, z + Math.sin(x * 39.346 + z * 11.135) * 1.1);
  }
  const uniforms = {
    uTime: { value: 0 },
    uHeight: { value: buildHeightTexture() },
    uWorld: { value: WORLD_SIZE },
    uRange: { value: new THREE.Vector2(HEIGHT_RANGE[0], HEIGHT_RANGE[1]) },
    uShallow: { value: new THREE.Color('#4fe3d4') },
    uDeep: { value: new THREE.Color('#0d86c0') },
    uZenith: { value: new THREE.Color('#6fb7ee') },
    uHorizon: { value: new THREE.Color('#cfe6f3') },
    uLight: { value: 1 },
    uOuter: { value: 0 },
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
  return {
    mesh,
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
