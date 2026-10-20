import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { WaterEnv } from './water';
import { NOISE3_GLSL } from './toon';

const C = (h: string) => new THREE.Color(h);

/**
 * Cielo pintado estilo BotW: degradado de horizonte a cénit, sol con halo y nubes en dos tonos (base fría, cima iluminada)
 * que se desplazan despacio. Sustituye al cielo físico a la vista; el físico se sigue usando para los reflejos (ver el PMREM).
 */
function paintedSky(sunDir: THREE.Vector3): THREE.Mesh {
  const uniforms = {
    uSunDir: { value: sunDir },
    uTime: { value: 0 },
    uZenith: { value: C('#3a78d2') },
    uHorizon: { value: C('#ffcca3') },
    uSunTint: { value: C('#ffc58f') },
    uCloudLit: { value: C('#fff3e6') },
    uCloudShade: { value: C('#b9c4e4') },
    uGain: { value: 2.0 }, // la exposición de la escena es 0,5: el cielo físico también daba valores por encima de 1
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vWorld;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uSunDir; uniform float uTime; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunTint;
      uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uGain;
      varying vec3 vWorld;
      ${NOISE3_GLSL}
      void main() {
        vec3 d = normalize(vWorld - cameraPosition);
        float y = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, pow(y, 0.35));
        float s = max(dot(d, uSunDir), 0.0);
        c = mix(c, uSunTint, pow(s, 6.0) * 0.6);                        // halo cálido alrededor del sol
        c += uSunTint * smoothstep(0.9988, 0.9992, s) * 1.5;              // disco del sol
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * 0.55 + vec2(uTime * 0.006, uTime * 0.002);
          float den = fbm3(vec3(uv * 1.3, 1.0));
          float lit = fbm3(vec3(uv * 1.3 + uSunDir.xz * 0.08, 1.0));
          float mask = smoothstep(0.51, 0.525, den) * smoothstep(0.0, 0.2, d.y);
          vec3 cloud = mix(uCloudShade, uCloudLit, step(lit, den - 0.012)); // dos tonos, sin degradado
          cloud = mix(cloud, uSunTint, pow(s, 4.0) * 0.5);
          c = mix(c, cloud, mask);
        }
        c = mix(c, uHorizon, 1.0 - smoothstep(0.0, 0.1, d.y));          // bruma en el horizonte
        gl_FragColor = vec4(c * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.scale.setScalar(4000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Luz fija de amanecer (hora dorada): sol bajo y cálido, relleno frío del cielo y rebote cálido del suelo.
 * Sustituye al ciclo día/noche: no se recalcula nada por fotograma salvo la posición de la luz y su sombra.
 */
export class Dawn {
  readonly sunDir = new THREE.Vector3();
  readonly sky: THREE.Mesh;
  readonly hemi = new THREE.HemisphereLight('#a9c9ff', '#ffcf9a', 0.8);
  readonly sun = new THREE.DirectionalLight('#ffb877', 3.4);
  readonly fogColor = C('#ffd9b8');
  readonly waterEnv: WaterEnv;
  /** exposición que aplica el postprocesado */
  exposure = 0.5;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    // sol a ~14° sobre el horizonte, saliendo por el sureste
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 14), THREE.MathUtils.degToRad(145));
    this.sky = paintedSky(this.sunDir);
    scene.add(this.sky, this.hemi, this.sun, this.sun.target);
    scene.environmentIntensity = 0.5;

    this.waterEnv = { sunDir: this.sunDir.clone(), sunColor: C('#ffc99a'), zenith: C('#5f9be0'), horizon: C('#ffd2ae'), light: 1 };

    // entorno para los reflejos de los materiales PBR: se genera una sola vez
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(4000);
    const u = envSky.material.uniforms;
    u.turbidity.value = 7; u.rayleigh.value = 3.1; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(this.sunDir);
    envScene.add(envSky);
    scene.environment = pmrem.fromScene(envScene, 0, 1, 10000).texture;
    pmrem.dispose();
  }

  /** Reorienta el sol (grados sobre el horizonte y acimut): luz, cielo y reflejos del agua. */
  setSun(elevDeg: number, azimDeg: number) {
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevDeg), THREE.MathUtils.degToRad(azimDeg));
    this.waterEnv.sunDir.copy(this.sunDir); // el cielo pintado comparte el vector sunDir
  }

  /** La luz y su sombra siguen al jugador; `t` mueve las nubes. */
  update(follow: THREE.Vector3, t = 0) {
    ((this.sky.material as THREE.ShaderMaterial).uniforms.uTime as THREE.IUniform<number>).value = t;
    this.sun.target.position.copy(follow);
    this.sun.position.copy(follow).addScaledVector(this.sunDir, 90);
  }
}
