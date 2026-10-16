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
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vWorld;
varying vec3 vNormal;

void main() {
  vec2 uv = vWorld.xz / uWorld + 0.5;
  float hs = texture2D(uHeight, uv).r * (uRange.y - uRange.x) + uRange.x;
  if (hs > 0.3) discard;
  float depth = -hs;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 4.5, depth));

  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col = mix(col, uSky, fres * 0.55);
  float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 120.0);
  col += uSunColor * spec * 0.9;

  float n = sin(vWorld.x * 1.7 + uTime * 1.2) * sin(vWorld.z * 1.9 - uTime);
  float edge = 1.0 - smoothstep(0.0, 0.5 + 0.14 * n + 0.12 * sin(uTime * 1.3 + depth * 6.0), depth);
  float bands = smoothstep(0.55, 0.7, sin(depth * 18.0 - uTime * 1.6) * 0.5 + 0.5) * (1.0 - smoothstep(0.4, 1.4, depth)) * 0.35;
  float foam = clamp(edge + bands, 0.0, 1.0);
  col = mix(col, vec3(1.0), foam * 0.85);

  float alpha = max(mix(0.55, 0.96, smoothstep(0.0, 2.2, depth)), foam);
  float dist = length(cameraPosition - vWorld);
  col = mix(col, uHorizon, smoothstep(140.0, 380.0, dist));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface Water {
  mesh: THREE.Mesh;
  update(t: number, center: THREE.Vector3): void;
}

export function buildWater(sunDir: THREE.Vector3): Water {
  const geo = new THREE.PlaneGeometry(900, 900, 300, 300);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uHeight: { value: buildHeightTexture() },
    uWorld: { value: WORLD_SIZE },
    uRange: { value: new THREE.Vector2(HEIGHT_RANGE[0], HEIGHT_RANGE[1]) },
    uShallow: { value: new THREE.Color('#5fe6d2') },
    uDeep: { value: new THREE.Color('#0a6c9c') },
    uSky: { value: new THREE.Color('#a9dcff') },
    uHorizon: { value: new THREE.Color('#cfe9f5') },
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color('#fff2cf') },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    update(t, center) {
      uniforms.uTime.value = t;
      // el plano sigue al jugador (en pasos de 3 m) para mantener la densidad de olas cerca de la cámara
      mesh.position.x = Math.round(center.x / 3) * 3;
      mesh.position.z = Math.round(center.z / 3) * 3;
    },
  };
}
