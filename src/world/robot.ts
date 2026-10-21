import * as THREE from 'three';
import { loadGLTF } from '../assets/loader';
import { heightAt } from './terrain';
import type { Obstacle } from './props';

/*
 * Robot "Claude" (Claudito): cubo blanco con pantalla OLED plana por cara (ojos y sonrisa naranjas de píxeles), CLAUDE en el costado y botones.
 * El modelo sale del .glb de Tripo que pasó Domingo (scripts/blender/robot.py: uno de los cuatro, reducido, con
 * esqueleto rígido e Idle/Walk/Wave). La cara se pinta encima en un lienzo para que parpadee y cambie de gesto.
 * Pasea cerca de su sitio y saluda cuando te acercas.
 */

const URL = `${import.meta.env.BASE_URL}models/characters/robot.glb`;
/** altura del modelo en metros tal como sale de Blender, y la que tiene en el juego */
const MODEL_H = 0.274, HEIGHT = 1.0;
const SPEED = 0.9;

type Face = 'calm' | 'blink' | 'happy';

/** Cara de píxeles: 32 × 24 en naranja, sobre fondo transparente (el negro es el cristal del propio modelo). */
function drawFace(g: CanvasRenderingContext2D, face: Face) {
  g.clearRect(0, 0, 32, 24);
  g.fillStyle = '#ff8a2a';
  if (face === 'calm') { g.fillRect(8, 7, 4, 6); g.fillRect(20, 7, 4, 6); }
  else if (face === 'blink') { g.fillRect(7, 11, 6, 2); g.fillRect(19, 11, 6, 2); }
  else { // ojos en ^
    for (const ox of [7, 19]) { g.fillRect(ox, 10, 2, 2); g.fillRect(ox + 2, 8, 2, 2); g.fillRect(ox + 4, 10, 2, 2); }
  }
  // sonrisa
  g.fillRect(12, 16, 8, 2); g.fillRect(10, 14, 2, 2); g.fillRect(20, 14, 2, 2);
}

export class Robot {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current = '';
  private faceCtx: CanvasRenderingContext2D | null = null;
  private faceTex: THREE.CanvasTexture | null = null;
  private face: Face = 'calm';
  private target = new THREE.Vector2();
  private waitT = 2;
  private waveT = 0;
  private nextBlink = 2;
  private greeted = false;
  private readonly body: Obstacle;

  constructor(scene: THREE.Scene, private obstacles: Obstacle[], private home: [number, number], private range = 4) {
    this.group.position.set(home[0], heightAt(home[0], home[1]), home[1]);
    this.target.set(home[0], home[1]);
    this.body = { x: home[0], z: home[1], r: 0.35 };
    obstacles.push(this.body); // el jugador choca con él (se actualiza al moverse)
    scene.add(this.group);
  }

  async load() {
    const gltf = await loadGLTF(URL);
    const root = gltf.scene;
    root.scale.setScalar(HEIGHT / MODEL_H);
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
    this.group.add(root);
    root.updateMatrixWorld(true);
    const body = root.getObjectByName('body');
    if (body) this.decorate(root, body);
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    const wave = this.actions.Wave;
    if (wave) { wave.setLoop(THREE.LoopOnce, 1); wave.clampWhenFinished = false; }
    this.play('Idle');
  }

  /** Pantalla con cara animada y el rótulo CLAUDE en el costado derecho (medidas del modelo, en metros sin escalar). */
  private decorate(root: THREE.Object3D, body: THREE.Object3D) {
    const c = document.createElement('canvas'); c.width = 32; c.height = 24;
    this.faceCtx = c.getContext('2d')!;
    drawFace(this.faceCtx, 'calm');
    this.faceTex = new THREE.CanvasTexture(c);
    this.faceTex.magFilter = THREE.NearestFilter; this.faceTex.minFilter = THREE.NearestFilter; this.faceTex.colorSpace = THREE.SRGBColorSpace;
    // un poco por encima de 1: con bloom, la pantalla brilla
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.115), new THREE.MeshBasicMaterial({ map: this.faceTex, color: new THREE.Color(1.35, 1.35, 1.35), toneMapped: false, transparent: true, depthWrite: false }));
    screen.position.set(0, 0.178, 0.0383); // a ras del frontal plano (z 0.0377, scripts/fix-robot.mjs)
    const lc = document.createElement('canvas'); lc.width = 256; lc.height = 64;
    const g = lc.getContext('2d')!;
    g.fillStyle = '#5b5e66'; g.font = 'bold 46px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CLAUDE', 128, 34);
    const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = 4;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.0275), new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false }));
    label.position.set(-0.0935, 0.17, 0.0); label.rotation.y = -Math.PI / 2;
    // se cuelgan del hueso del cuerpo para que se muevan con él
    for (const m of [screen, label]) { root.add(m); m.updateMatrixWorld(true); body.attach(m); }
  }

  private play(name: string, fade = 0.25) {
    const next = this.actions[name];
    if (!next || this.current === name) return;
    const prev = this.actions[this.current];
    next.reset().fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.current = name;
  }

  private setFace(f: Face) {
    if (f === this.face || !this.faceCtx || !this.faceTex) return;
    this.face = f; drawFace(this.faceCtx, f); this.faceTex.needsUpdate = true;
  }

  private pickTarget() {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * this.range;
      const x = this.home[0] + Math.cos(a) * r, z = this.home[1] + Math.sin(a) * r;
      if (this.obstacles.some((o) => o !== this.body && Math.hypot(o.x - x, o.z - z) < o.r + 0.6)) continue;
      this.target.set(x, z); return;
    }
  }

  update(dt: number, t: number, player: THREE.Vector3) {
    if (!this.mixer) return;
    const p = this.group.position;
    const toPlayer = Math.hypot(player.x - p.x, player.z - p.z);
    // saluda al acercarte (y otra vez si te vas lejos y vuelves)
    if (toPlayer > 9) this.greeted = false;
    if (!this.greeted && toPlayer < 4) { this.greeted = true; this.waveT = 2.6; }
    let face: number | null = null;
    if (this.waveT > 0) {
      this.waveT -= dt;
      this.play('Wave', 0.2);
      face = Math.atan2(player.x - p.x, player.z - p.z);
    } else if (toPlayer < 2.5) {
      this.play('Idle'); face = Math.atan2(player.x - p.x, player.z - p.z); // se queda mirándote
    } else {
      const dx = this.target.x - p.x, dz = this.target.y - p.z, d = Math.hypot(dx, dz);
      if (d < 0.15) {
        this.play('Idle');
        if ((this.waitT -= dt) < 0) { this.waitT = 2 + Math.random() * 4; this.pickTarget(); }
      } else {
        this.play('Walk');
        const step = Math.min(d, SPEED * dt);
        const nx = p.x + (dx / d) * step, nz = p.z + (dz / d) * step;
        if (this.obstacles.some((o) => o !== this.body && Math.hypot(o.x - nx, o.z - nz) < o.r + 0.35) || Math.hypot(player.x - nx, player.z - nz) < 0.8) this.target.set(p.x, p.z);
        else { p.x = nx; p.z = nz; }
        face = Math.atan2(dx, dz);
      }
    }
    if (face !== null) {
      const diff = Math.atan2(Math.sin(face - this.group.rotation.y), Math.cos(face - this.group.rotation.y));
      this.group.rotation.y += diff * Math.min(1, dt * 6);
    }
    p.y += (heightAt(p.x, p.z) - p.y) * Math.min(1, dt * 12);
    this.body.x = p.x; this.body.z = p.z;
    // gestos de la pantalla: contento al saludar, parpadeo de vez en cuando
    if (this.waveT > 0) this.setFace('happy');
    else if (t > this.nextBlink) { this.setFace('blink'); if (t > this.nextBlink + 0.14) { this.nextBlink = t + 2 + Math.random() * 3; this.setFace('calm'); } }
    else this.setFace('calm');
    this.mixer.update(dt);
  }
}
