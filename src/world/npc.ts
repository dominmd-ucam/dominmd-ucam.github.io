import * as THREE from 'three';
import { Avatar } from '../avatar/avatar';
import { defaultConfig, type AvatarConfig } from '../avatar/config';
import { heightAt } from './terrain';
import type { Obstacle } from './props';

/** Misu, la gato guía: usa el mismo sistema de avatar modular que el jugador, con el disfraz de gato y animaciones propias. */
export class CatGuide {
  readonly group = new THREE.Group();
  readonly pos: THREE.Vector3;
  private avatar: Avatar | null = null;
  private wave = 0;
  private greeted = false;
  private waveUntil = 0;
  /** distancia a la que se puede hablar */
  static REACH = 3.2;

  constructor(scene: THREE.Scene, obstacles: Obstacle[], x: number, z: number, private face: [number, number]) {
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(face[0] - x, face[1] - z);
    scene.add(this.group);
    obstacles.push({ x, z, r: 0.6 });
  }

  /** Carga el avatar en segundo plano; mientras tanto el gato no se ve. */
  async load() {
    const a = await Avatar.create();
    const cfg: AvatarConfig = defaultConfig();
    Object.assign(cfg.parts, { Head: 0, Eyes: 2, EyeBrow: null, Nose: 0, Hair: null, Top: null, Bottom: null, Shoes: null, Outfit: 3 });
    cfg.colors.Head = '#fbe0cf';
    await a.apply(cfg);
    const holder = new THREE.Group();
    holder.scale.setScalar(1.05);
    holder.add(a.root);
    this.group.add(holder);
    this.avatar = a;
  }

  distanceTo(p: THREE.Vector3) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  update(dt: number, t: number, player: THREE.Vector3) {
    if (!this.avatar) return;
    const d = this.distanceTo(player);
    // gira hacia el jugador cuando está cerca y vuelve a su posición de espera cuando se aleja
    const target = d < 11 ? Math.atan2(player.x - this.pos.x, player.z - this.pos.z) : Math.atan2(this.face[0] - this.pos.x, this.face[1] - this.pos.z);
    let diff = target - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, dt * 4);
    // saluda la primera vez que el jugador se acerca
    if (!this.greeted && d < 9) { this.greeted = true; this.waveUntil = t + 3.2; }
    this.wave += ((t < this.waveUntil ? 1 : 0) - this.wave) * Math.min(1, dt * 6);
    this.avatar.update(dt, { speed: 0, swimming: false, t, wave: this.wave });
  }
}
