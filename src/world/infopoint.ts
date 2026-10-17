import * as THREE from 'three';
import { heightAt } from './terrain';
import { makeLabel } from '../interactables';
import type { Obstacle } from './props';

const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

/** Atril con el libro de visitas y buzón de contacto, junto al punto de inicio. */
export class InfoPoint {
  readonly pos: THREE.Vector3;
  readonly group = new THREE.Group();
  private page!: THREE.Mesh;
  private label: THREE.Sprite;
  static REACH = 3.0;

  constructor(scene: THREE.Scene, obstacles: Obstacle[], x: number, z: number) {
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(6 - x, 12 - z) + 0.4; // mira hacia el punto de inicio
    const wood = mat('#c98f55'), dark = mat('#8f5a32');
    const add = (g: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
      const o = new THREE.Mesh(g, m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; this.group.add(o); return o;
    };
    // atril
    add(new THREE.CylinderGeometry(0.1, 0.14, 1.0, 7), dark, 0, 0.5, 0);
    const top = add(new THREE.BoxGeometry(1.0, 0.08, 0.7), wood, 0, 1.1, 0); top.rotation.x = -0.35;
    // libro abierto
    const cover = add(new THREE.BoxGeometry(0.86, 0.04, 0.56), mat('#e0533d'), 0, 1.16, 0.0); cover.rotation.x = -0.35;
    for (const s of [-1, 1]) {
      const p = add(new THREE.BoxGeometry(0.4, 0.03, 0.5), mat('#fbf7ee'), s * 0.21, 1.19, 0.0);
      p.rotation.x = -0.35; p.rotation.z = -s * 0.08;
      if (s === 1) this.page = p;
    }
    // buzón
    add(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6), dark, 1.5, 0.5, 0);
    const box = add(new THREE.BoxGeometry(0.5, 0.36, 0.34), mat('#2f84c4'), 1.5, 1.15, 0);
    box.rotation.y = 0.1;
    add(new THREE.BoxGeometry(0.28, 0.02, 0.2), mat('#1d5f93'), 1.5, 1.34, 0);
    const flag = add(new THREE.BoxGeometry(0.04, 0.26, 0.1), mat('#ff7a59'), 1.77, 1.24, 0);
    flag.rotation.z = 0.1;
    scene.add(this.group);
    obstacles.push({ x, z, r: 0.9 });

    this.label = makeLabel('Libro de visitas');
    this.label.position.set(x, this.pos.y + 2.5, z);
    scene.add(this.label);
  }

  distanceTo(p: THREE.Vector3) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  update(t: number, player: THREE.Vector3) {
    this.page.rotation.z = -0.08 + Math.sin(t * 1.5) * 0.05;
    (this.label.material as THREE.SpriteMaterial).opacity = Math.min(1, Math.max(0, (this.distanceTo(player) - 4) / 6));
  }
}
