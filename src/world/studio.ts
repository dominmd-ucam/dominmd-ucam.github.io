import * as THREE from 'three';
import type { Dawn } from './dawn';

const RAD = Math.PI / 180;
/** Posición en una esfera alrededor del personaje: acimut medido desde la cámara (hacia la derecha) y elevación, en grados. */
const spot = (az: number, el: number, r: number) =>
  new THREE.Vector3(Math.sin(az * RAD) * Math.cos(el * RAD), Math.sin(el * RAD), Math.cos(az * RAD) * Math.cos(el * RAD)).multiplyScalar(r);

/**
 * Luz de estudio para el editor de avatar: la clásica de tres puntos más dos contraluces de color.
 * - principal (key): cálida, delante a la derecha y arriba, la que modela la cara
 * - relleno (fill): más suave y fría desde el otro lado, para que la sombra no quede negra
 * - dos contraluces (rim) rojo y azul por detrás: dibujan el contorno y separan al personaje del fondo
 * Al abrirse el editor la luz del amanecer baja de golpe y la de estudio sube (y al cerrarse, al revés), con una transición suave.
 */
export class StudioLight {
  private group = new THREE.Group();
  private lights: THREE.DirectionalLight[] = [];
  private k = 0;          // 0 = mundo normal, 1 = estudio completo
  private applied = 0;    // atenuación ya aplicada a la luz del amanecer (para no pelear con los ajustes de ?tune)
  private readonly base = [2.4, 0.7, 4.5, 4.5];

  constructor(private scene: THREE.Scene, private dawn: Dawn) {
    const defs: [string, number, number][] = [['#fff1dc', 35, 35], ['#cfe4ff', -50, 10], ['#ff5a7a', 125, 25], ['#4aa8ff', -125, 25]];
    defs.forEach(([color, az, el]) => {
      const l = new THREE.DirectionalLight(color, 0);
      l.position.copy(spot(az, el, 10));
      this.group.add(l, l.target); // el objetivo cuelga del mismo grupo (en su origen): así la luz sigue al personaje
      this.lights.push(l);
    });
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Compila una vez los materiales con y sin las luces de estudio: así abrir el editor no provoca un tirón por recompilar shaders. */
  prewarm(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.group.visible = true;
    renderer.compile(scene, camera);
    this.group.visible = false;
  }

  /** `yaw`: dirección de la cámara respecto al personaje. */
  update(dt: number, target: THREE.Vector3, yaw: number, on: boolean) {
    const goal = on ? 1 : 0;
    if (!on && this.k === 0 && this.applied === 0) return; // cerrado del todo: no cuesta nada
    this.k += (goal - this.k) * (1 - Math.exp(-5 * dt));
    if (Math.abs(goal - this.k) < 0.002) this.k = goal;

    this.group.visible = this.k > 0;
    this.group.position.set(target.x, target.y + 1.1, target.z);
    this.group.rotation.y = yaw;
    this.lights.forEach((l, i) => { l.intensity = this.base[i] * this.k; });

    // la luz del amanecer se apaga en parte mientras dura el estudio (se aplica la diferencia, no un valor fijo)
    const f = (v: number) => 1 - v * this.k;
    const prev = (v: number) => 1 - v * this.applied;
    const d = this.dawn;
    d.sun.intensity *= f(0.78) / prev(0.78);
    d.hemi.intensity *= f(0.65) / prev(0.65);
    this.scene.environmentIntensity *= f(0.55) / prev(0.55);
    this.applied = this.k;
  }
}
