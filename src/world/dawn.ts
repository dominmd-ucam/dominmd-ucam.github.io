import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { WaterEnv } from './water';

const C = (h: string) => new THREE.Color(h);

/**
 * Luz fija de amanecer (hora dorada): sol bajo y cálido, relleno frío del cielo y rebote cálido del suelo.
 * Sustituye al ciclo día/noche: no se recalcula nada por fotograma salvo la posición de la luz y su sombra.
 */
export class Dawn {
  readonly sunDir = new THREE.Vector3();
  readonly sky = new Sky();
  readonly hemi = new THREE.HemisphereLight('#a9c9ff', '#ffcf9a', 0.8);
  readonly sun = new THREE.DirectionalLight('#ffb877', 3.4);
  readonly fogColor = C('#ffd9b8');
  readonly waterEnv: WaterEnv;
  /** exposición que aplica el postprocesado */
  readonly exposure = 0.5;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    // sol a ~14° sobre el horizonte, saliendo por el sureste
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 14), THREE.MathUtils.degToRad(145));
    this.sky.scale.setScalar(4000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 7; u.rayleigh.value = 3.1; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(this.sunDir);
    scene.add(this.sky, this.hemi, this.sun, this.sun.target);
    scene.environmentIntensity = 0.5;

    this.waterEnv = { sunDir: this.sunDir.clone(), sunColor: C('#ffc99a'), zenith: C('#5f9be0'), horizon: C('#ffd2ae'), light: 1 };

    // entorno para los reflejos de los materiales PBR: se genera una sola vez
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(4000);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = u[k].value;
    envSky.material.uniforms.sunPosition.value.copy(this.sunDir);
    envScene.add(envSky);
    scene.environment = pmrem.fromScene(envScene, 0, 1, 10000).texture;
    pmrem.dispose();
  }

  /** La luz y su sombra siguen al jugador. */
  update(follow: THREE.Vector3) {
    this.sun.target.position.copy(follow);
    this.sun.position.copy(follow).addScaledVector(this.sunDir, 90);
  }
}
