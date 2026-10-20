import * as THREE from 'three';
import { loadGLTF } from '../assets/loader';
import { heightAt } from './terrain';
import type { Obstacle } from './props';

const URL = `${import.meta.env.BASE_URL}models/characters/misu.glb`;
/** el modelo sale de Blender con altura 1 (scripts/blender/misu.py) */
const HEIGHT = 0.75;

/** Misu, la gata guía: gatita con capucha roja, con animaciones de reposo, saludo y charla. */
export class CatGuide {
  readonly group = new THREE.Group();
  readonly pos: THREE.Vector3;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current = '';
  private greeted = false;
  private waveUntil = 0;
  /** lo pone el juego mientras el diálogo con Misu está abierto */
  talking = false;
  /** distancia a la que se puede hablar */
  static REACH = 3.2;

  constructor(scene: THREE.Scene, obstacles: Obstacle[], x: number, z: number, private face: [number, number]) {
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(face[0] - x, face[1] - z);
    scene.add(this.group);
    obstacles.push({ x, z, r: 0.45 });
  }

  /** Carga el modelo en segundo plano; mientras tanto Misu no se ve. */
  async load() {
    const gltf = await loadGLTF(URL);
    const root = gltf.scene;
    root.scale.setScalar(HEIGHT);
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
    this.group.add(root);
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.play('Idle');
  }

  private play(name: string, fade = 0.3) {
    const next = this.actions[name];
    if (!next || this.current === name) return;
    next.reset().fadeIn(fade).play();
    this.actions[this.current]?.fadeOut(fade);
    this.current = name;
  }

  distanceTo(p: THREE.Vector3) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  update(dt: number, t: number, player: THREE.Vector3) {
    if (!this.mixer) return;
    const d = this.distanceTo(player);
    // gira hacia el jugador cuando está cerca y vuelve a su posición de espera cuando se aleja
    const target = d < 11 ? Math.atan2(player.x - this.pos.x, player.z - this.pos.z) : Math.atan2(this.face[0] - this.pos.x, this.face[1] - this.pos.z);
    let diff = target - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, dt * 4);
    // saluda la primera vez que el jugador se acerca
    if (!this.greeted && d < 9) { this.greeted = true; this.waveUntil = t + 2.5; }
    this.play(this.talking ? 'Talk' : t < this.waveUntil ? 'Wave' : 'Idle');
    this.mixer.update(dt);
  }
}
