import * as THREE from 'three';
import { heightAt } from './terrain';
import { waveHeight } from './water';
import type { PeerRow } from '../net/presence';

const MAX_GHOSTS = 30;

interface Ghost { id: string; mat: THREE.MeshBasicMaterial; group: THREE.Group; body: THREE.Group; target: THREE.Vector3; rot: number; m: number; w: boolean; seen: number; phase: number; fade: number; label: THREE.Sprite; name: string }

function nameSprite(text: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(15,52,64,.72)';
  g.beginPath(); g.roundRect(4, 8, 248, 48, 24); g.fill();
  g.fillStyle = '#fbf7ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 28;
  do { g.font = `700 ${size}px system-ui, sans-serif`; size -= 2; } while (g.measureText(text).width > 220 && size > 12);
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  s.scale.set(2.4, 0.6, 1);
  return s;
}

/** Otros visitantes conectados: siluetas translúcidas que caminan, nadan y se mueven con suavidad entre actualizaciones. */
export class Ghosts {
  private ghosts = new Map<string, Ghost>();
  private geo = {
    body: new THREE.CapsuleGeometry(0.3, 0.6, 4, 10),
    head: new THREE.SphereGeometry(0.3, 12, 10),
    hat: new THREE.CylinderGeometry(0.58, 0.6, 0.05, 14),
    crown: new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  };
  onFirst: () => void = () => {};
  private announced = false;
  enabled = true;

  constructor(private scene: THREE.Scene) {}

  get count() { return this.ghosts.size; }

  apply(rows: PeerRow[], now: number) {
    if (!this.enabled) return;
    for (const r of rows) {
      let g = this.ghosts.get(r.id);
      if (!g) {
        if (this.ghosts.size >= MAX_GHOSTS) continue;
        g = this.create(r);
        this.ghosts.set(r.id, g);
        if (!this.announced) { this.announced = true; this.onFirst(); }
      }
      g.target.set(r.x, 0, r.z); g.rot = r.r; g.m = r.m; g.w = r.w; g.seen = now;
      if (r.name && r.name !== g.name) { g.name = r.name; this.setLabel(g, r.name); }
    }
  }

  remove(id: string) {
    const g = this.ghosts.get(id);
    if (!g) return;
    this.scene.remove(g.group);
    g.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.Material).dispose(); });
    (g.label.material as THREE.SpriteMaterial).map?.dispose();
    this.ghosts.delete(id);
  }

  clear() { for (const id of [...this.ghosts.keys()]) this.remove(id); }

  private setLabel(g: Ghost, text: string) {
    g.group.remove(g.label);
    (g.label.material as THREE.SpriteMaterial).map?.dispose();
    g.label = nameSprite(text);
    g.label.position.y = 2.7;
    g.group.add(g.label);
  }

  private create(r: PeerRow): Ghost {
    const hue = (parseInt(r.id.slice(0, 3), 16) / 4096) % 1;
    const color = new THREE.Color().setHSL(hue, 0.7, 0.75);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    const group = new THREE.Group();
    const body = new THREE.Group();
    const torso = new THREE.Mesh(this.geo.body, mat); torso.position.y = 0.95; body.add(torso);
    const head = new THREE.Mesh(this.geo.head, mat); head.position.y = 1.7; body.add(head);
    const hat = new THREE.Mesh(this.geo.hat, mat); hat.position.y = 1.92; body.add(hat);
    const crown = new THREE.Mesh(this.geo.crown, mat); crown.position.y = 1.94; body.add(crown);
    group.add(body);
    const label = nameSprite(r.name || 'Visitante');
    label.position.y = 2.7;
    group.add(label);
    group.position.set(r.x, heightAt(r.x, r.z), r.z);
    this.scene.add(group);
    return { id: r.id, mat, group, body, target: new THREE.Vector3(r.x, 0, r.z), rot: r.r, m: r.m, w: r.w, seen: 0, phase: Math.random() * 6, fade: 0, label, name: r.name };
  }

  update(dt: number, t: number, now: number) {
    for (const g of this.ghosts.values()) {
      if (now - g.seen > 6000) { this.remove(g.id); continue; } // sin noticias durante 6 s: se fue
      const p = g.group.position;
      const k = 1 - Math.exp(-8 * dt);
      p.x += (g.target.x - p.x) * k; p.z += (g.target.z - p.z) * k;
      const h = heightAt(p.x, p.z);
      const targetY = g.w ? waveHeight(p.x, p.z, t) * 0.7 - 0.85 : Math.max(h, -0.4);
      p.y += (targetY - p.y) * (1 - Math.exp(-10 * dt));
      let d = g.rot - g.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.group.rotation.y += d * (1 - Math.exp(-10 * dt));
      g.phase += dt * (3 + g.m * 8);
      g.body.position.y = Math.abs(Math.sin(g.phase)) * 0.07 * Math.min(1, g.m) + Math.sin(t * 1.6 + g.phase * 0.1) * 0.04;
      g.body.rotation.x = g.w ? 0.7 : 0;
      if (g.fade < 1) { // el fundido de entrada dura ~0,7 s; después la opacidad ya no cambia
        g.fade = Math.min(1, g.fade + dt * 1.5);
        g.mat.opacity = 0.5 * g.fade; // los cuatro cuerpos comparten el material
        (g.label.material as THREE.SpriteMaterial).opacity = g.fade;
      }
    }
  }
}
