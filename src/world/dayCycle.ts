import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { WaterEnv } from './water';

export type Preset = 'morning' | 'noon' | 'sunset' | 'night';
export const PRESETS: Record<Preset, number> = { morning: 0.33, noon: 0.5, sunset: 0.71, night: 0.95 };

const C = (h: string) => new THREE.Color(h);
const S = THREE.MathUtils.smoothstep;

/** Reloj del mundo (0 = medianoche, 0.5 = mediodía) que controla cielo, luces, agua y estrellas. */
export class DayCycle {
  time = 0.36;
  auto = true;
  /** minutos reales que dura un día completo */
  dayMinutes = 14;

  readonly sunDir = new THREE.Vector3();
  readonly sky = new Sky();
  readonly hemi = new THREE.HemisphereLight('#cdeaff', '#f3dca0', 0.6);
  readonly sun = new THREE.DirectionalLight('#fff0d2', 3.2);
  readonly moon = new THREE.DirectionalLight('#8fb0ff', 0);
  readonly stars: THREE.Points;
  readonly waterEnv: WaterEnv = { sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), zenith: new THREE.Color(), horizon: new THREE.Color(), light: 1 };
  /** exposición que aplica el postprocesado */
  exposure = 0.5;
  /** color del sol/cielo para tintar nubes y niebla */
  readonly fogColor = new THREE.Color();
  /** 0 de día → 1 de noche cerrada */
  night = 0;

  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envSky = new Sky();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envAt = -1;
  private tmp = new THREE.Color();

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.sky.scale.setScalar(4000);
    this.envSky.scale.setScalar(4000);
    this.envScene.add(this.envSky);
    scene.add(this.sky, this.hemi, this.sun, this.sun.target, this.moon, this.moon.target);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.95 + 0.05;
      pos.set(v.multiplyScalar(3000).toArray(), i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);
    this.apply();
  }

  setPreset(p: Preset) { this.time = PRESETS[p]; this.auto = false; }

  /** "HH:MM" para el HUD */
  get clock(): string {
    const m = Math.floor(this.time * 24 * 60);
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  update(dt: number, follow: THREE.Vector3, camera: THREE.Camera) {
    if (this.auto) this.time = (this.time + dt / (this.dayMinutes * 60)) % 1;
    this.apply();
    this.sun.target.position.copy(follow);
    this.sun.position.copy(follow).addScaledVector(this.sunDir, 90);
    this.moon.target.position.copy(follow);
    this.moon.position.copy(follow).addScaledVector(this.sunDir, -90);
    this.stars.position.copy(camera.position);
  }

  private apply() {
    const e = Math.sin((this.time - 0.25) * Math.PI * 2); // altura del sol (-1..1)
    const elev = e * THREE.MathUtils.degToRad(62);
    const az = THREE.MathUtils.degToRad(140 + (this.time - 0.5) * 220);
    this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - elev, az);

    const day = S(e, -0.05, 0.3);        // 0 noche → 1 pleno día
    const gold = 1 - Math.min(1, Math.abs(e - 0.08) / 0.32); // 1 en el amanecer/atardecer
    this.night = 1 - S(e, -0.25, 0.08);

    const su = this.sky.material.uniforms;
    su.turbidity.value = 2.6 + gold * 5;
    su.rayleigh.value = 2.1 + gold * 1.4;
    su.mieCoefficient.value = 0.004 + gold * 0.004;
    su.mieDirectionalG.value = 0.85;
    su.sunPosition.value.copy(this.sunDir);

    this.sun.color.copy(C('#fff0c4')).lerp(C('#ff9a55'), gold * 0.85);
    this.sun.intensity = 3.4 * S(e, -0.04, 0.22);
    this.moon.intensity = 1.5 * (1 - S(e, -0.3, 0.05));

    this.hemi.color.copy(C('#3a55a8')).lerp(C('#cdeaff'), day).lerp(C('#ffc9a0'), gold * 0.4);
    this.hemi.groundColor.copy(C('#161c2c')).lerp(C('#f3dca0'), day);
    this.hemi.intensity = 0.55 - 0.25 * day;
    this.scene.environmentIntensity = 0.22 + 0.1 * day;
    this.exposure = 0.42 + 0.2 * this.night;

    const sm = this.stars.material as THREE.PointsMaterial;
    sm.opacity = THREE.MathUtils.clamp((this.night - 0.35) / 0.5, 0, 1) * 0.9;

    // entorno del agua
    const w = this.waterEnv;
    w.sunDir.copy(e > -0.1 ? this.sunDir : this.sunDir.clone().negate());
    w.sunColor.copy(this.sun.color).lerp(C('#a8c0ff'), this.night).multiplyScalar(0.4 + 0.6 * (1 - this.night));
    w.zenith.copy(C('#0a1636')).lerp(C('#6fb7ee'), day).lerp(C('#7a79c4'), gold * 0.35);
    w.horizon.copy(C('#152748')).lerp(C('#cfe6f3'), day).lerp(this.tmp.set('#ffb98a'), gold * 0.7);
    w.light = 0.18 + 0.82 * day;
    this.fogColor.copy(w.horizon);

    // el mapa de entorno (IBL) se regenera solo cuando el cielo ha cambiado de verdad
    if (Math.abs(e - this.envAt) > 0.04) this.refreshEnv(e);
  }

  private refreshEnv(e: number) {
    this.envAt = e;
    const src = this.sky.material.uniforms, dst = this.envSky.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) dst[k].value = src[k].value;
    dst.sunPosition.value.copy(this.sunDir);
    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 1, 10000);
    this.scene.environment = this.envTarget.texture;
  }
}
