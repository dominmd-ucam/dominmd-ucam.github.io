import * as THREE from 'three';
import { loadGLTF } from '../assets/loader';
import { heightAt } from './terrain';
import type { Obstacle } from './props';

/*
 * Robot "Claude" (Claudito): cubo blanco con pantalla por cara (la pantalla "Usage" del cubo de referencia, con el bicho naranja), CLAUDE en el costado y botones.
 * El modelo sale del .glb de Tripo que pasó Domingo (scripts/blender/robot.py: uno de los cuatro, reducido, con
 * esqueleto rígido e Idle/Walk/Wave). La cara se pinta encima en un lienzo para que parpadee y cambie de gesto.
 * Pasea cerca de su sitio y saluda cuando te acercas.
 */

const URL = `${import.meta.env.BASE_URL}models/characters/robot.glb`;
/** altura del modelo en metros tal como sale de Blender, y la que tiene en el juego */
const MODEL_H = 0.274, HEIGHT = 1.0;
const SPEED = 0.9;

type Face = 'calm' | 'blink' | 'happy';

const SW = 320, SH = 300;
const ORANGE = '#e8763f';
/** Bicho de píxeles de Claude (11 × 6); los huecos de la fila 1 son los ojos. */
const CRAB = ['..#######..', '..#.###.#..', '###########', '###########', '..#######..', '..#.#.#.#..'];

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
}

/** Pantalla "Usage" como la del cubo de referencia: bicho naranja, dos barras de uso y una línea de estado. */
function drawFace(g: CanvasRenderingContext2D, face: Face) {
  g.clearRect(0, 0, SW, SH); g.fillStyle = '#060607'; roundRect(g, 0, 0, SW, SH, 34); // esquinas redondas como el cristal
  // bicho (parpadea tapando los ojos)
  const px = 5;
  CRAB.forEach((row, y) => [...row].forEach((c, x) => {
    const eye = c === '.' && y === 1 && (x === 3 || x === 7);
    if (c === '#' || (eye && face === 'blink')) { g.fillStyle = ORANGE; g.fillRect(14 + x * px, 18 + y * px, px, px); }
  }));
  g.fillStyle = '#f4f1ea'; g.font = 'bold 34px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Usage', SW / 2, 34);
  // batería
  g.strokeStyle = '#f4f1ea'; g.lineWidth = 2.5; g.strokeRect(266, 25, 32, 18); g.fillStyle = '#f4f1ea'; g.fillRect(299, 30, 3, 8);
  for (let i = 0; i < 3; i++) g.fillRect(270 + i * 9.5, 29, 7, 10);
  const card = (y: number, pct: number, tag: string, color: string, reset: string) => {
    g.fillStyle = '#1d1c21'; roundRect(g, 10, y, SW - 20, 92, 12);
    g.textAlign = 'left'; g.fillStyle = '#f4f1ea'; g.font = 'bold 28px Nunito, sans-serif'; g.fillText(`${pct}%`, 20, y + 24);
    g.fillStyle = '#4a4555'; roundRect(g, SW - 112, y + 11, 92, 26, 13);
    g.fillStyle = '#e9e4f0'; g.font = 'bold 17px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText(tag, SW - 66, y + 25);
    g.fillStyle = '#3a3640'; roundRect(g, 20, y + 47, SW - 40, 12, 6);
    g.fillStyle = color; roundRect(g, 20, y + 47, Math.max(12, (SW - 40) * pct / 100), 12, 6);
    g.fillStyle = '#d8d4dc'; g.font = 'bold 15px Nunito, sans-serif'; g.textAlign = 'left'; g.fillText(reset, 20, y + 76);
  };
  card(70, 50, 'Current', ORANGE, 'Resets in 1h 22m');
  card(174, 11, 'Weekly', '#b9d65c', 'Resets in 6d 8h');
  g.fillStyle = ORANGE; g.font = 'bold 19px "Courier New", monospace'; g.textAlign = 'center';
  g.fillText(face === 'happy' ? '✱ ¡Hola!' : '✱ Musing…', SW / 2, 284);
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
    const c = document.createElement('canvas'); c.width = SW; c.height = SH;
    this.faceCtx = c.getContext('2d')!;
    drawFace(this.faceCtx, 'calm');
    this.faceTex = new THREE.CanvasTexture(c);
    this.faceTex.colorSpace = THREE.SRGBColorSpace; this.faceTex.anisotropy = 4;
    // un poco por encima de 1: con bloom, la pantalla brilla
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.152, 0.1425), new THREE.MeshBasicMaterial({ map: this.faceTex, color: new THREE.Color(1.15, 1.15, 1.15), toneMapped: false, transparent: true }));
    screen.position.set(0, 0.18, 0.058);
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
