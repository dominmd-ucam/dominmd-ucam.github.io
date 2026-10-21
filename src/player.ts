import * as THREE from 'three';
import { heightAt, onDock, DOCK, caveFloor, caveLocal, CAVE } from './world/terrain';
import { waveHeight } from './world/water';
import type { Obstacle } from './world/props';
import type { Input } from './input';
import type { Avatar, Motion } from './avatar/avatar';

/** Lo que el jugador lee de la entrada: el teclado del PC o un mando remoto (src/coop). */
export type Controls = Pick<Input, 'move' | 'yaw' | 'crouch' | 'sprint' | 'roll' | 'jump'>;

const SPEED = 5.5;
const MAX_DEPTH = -3.4;  // límite de profundidad a nado
const SWIM_FROM = -0.55; // por debajo de esto, nada en vez de andar
const LIMIT = 125;       // borde del mundo
const SPRINT = 1.45;     // multiplicador de velocidad al esprintar
const CROUCH = 0.38;     // y al ir agachado
const JUMP_V = 7.2, GRAVITY = 22; // salto de ~1,2 m
const ROLL_T = 0.75, ROLL_V = 9;   // voltereta: duración y velocidad

export class Player {
  group = new THREE.Group();
  vel = new THREE.Vector2();
  private heading = 0;
  private phase = 0;
  private legL: THREE.Group; private legR: THREE.Group;
  private armL: THREE.Group; private armR: THREE.Group;
  private body: THREE.Group;

  constructor(private obstacles: Obstacle[], start: [number, number]) {
    const m = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
    const skin = m('#f1bb8f'), shirt = m('#ff7a59'), shorts = m('#1f8fa8'), hatM = m('#f4d27f'), band = m('#e0583c');
    const mesh = (g: THREE.BufferGeometry, mat: THREE.Material) => { const o = new THREE.Mesh(g, mat); o.castShadow = true; return o; };

    this.body = new THREE.Group();
    this.group.add(this.body);
    const torso = mesh(new THREE.CapsuleGeometry(0.3, 0.42, 6, 14), shirt); torso.position.y = 1.0; this.body.add(torso);
    const hips = mesh(new THREE.CylinderGeometry(0.34, 0.33, 0.28, 14), shorts); hips.position.y = 0.66; this.body.add(hips);
    const head = mesh(new THREE.SphereGeometry(0.31, 18, 14), skin); head.position.y = 1.64; this.body.add(head);
    const eyeM = m('#1a2a35');
    for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeM); e.position.set(0.11 * s, 1.67, 0.28); this.body.add(e); }
    const hat = new THREE.Group(); hat.position.y = 1.87; this.body.add(hat);
    hat.add(mesh(new THREE.CylinderGeometry(0.62, 0.64, 0.05, 20), hatM));
    const crown = mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatM); crown.position.y = 0.02; hat.add(crown);
    const ring = mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.07, 16), band); ring.position.y = 0.06; hat.add(ring);

    const limb = (w: number, h: number, mat: THREE.Material, x: number, y: number) => {
      const piv = new THREE.Group(); piv.position.set(x, y, 0);
      const l = mesh(new THREE.CapsuleGeometry(w, h, 4, 8), mat); l.position.y = -(h / 2 + w); piv.add(l);
      this.body.add(piv); return piv;
    };
    this.legL = limb(0.09, 0.32, skin, -0.15, 0.55); this.legR = limb(0.09, 0.32, skin, 0.15, 0.55);
    this.armL = limb(0.075, 0.36, skin, -0.4, 1.3); this.armR = limb(0.075, 0.36, skin, 0.4, 1.3);
    this.armL.rotation.z = 0.12; this.armR.rotation.z = -0.12;

    this.body.scale.setScalar(Player.AVATAR_HEIGHT / 2.05); // el muñeco de respaldo mide ~2,05 m con el sombrero
    this.group.position.set(start[0], heightAt(start[0], start[1]), start[1]);
  }

  swimming = false;
  /** dentro de la cueva (bajo la meseta del suroeste) */
  inCave = false;
  /** velocidad vertical y si está en el aire */
  private vy = 0;
  airborne = false;
  private rollT = 0;
  private tgt = new THREE.Vector2();
  private motion: Motion = { speed: 0, swimming: false, t: 0 };
  avatar: Avatar | null = null;
  private holder = new THREE.Group();
  /** altura objetivo del avatar (m) y giro para que mire a +Z del jugador (se ajusta según el modelo) */
  static AVATAR_HEIGHT = 1.7;
  /** altura real del avatar modular a escala 1 (medida en el juego: cabeza y pelo incluidos) */
  static MODEL_HEIGHT = 2.19;
  static AVATAR_YAW = 0;

  /** Sustituye el cuerpo procedural por el avatar modular cuando termina de cargar. */
  attachAvatar(a: Avatar) {
    this.avatar = a;
    this.body.visible = false;
    this.holder.rotation.y = Player.AVATAR_YAW;
    this.holder.scale.setScalar(Player.AVATAR_HEIGHT / Player.MODEL_HEIGHT);
    this.holder.add(a.root);
    this.group.add(this.holder);
  }

  update(dt: number, input: Controls, t: number) {
    const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
    // dirección relativa a la cámara
    const wx = input.move.x * cy - input.move.y * sy;
    const wz = -input.move.x * sy - input.move.y * cy;
    const crouch = input.crouch && !this.swimming;
    const mult = this.swimming ? 0.6 : crouch ? CROUCH : input.sprint ? SPRINT : 1;
    const target = this.tgt.set(wx, wz).multiplyScalar(SPEED * mult);
    // voltereta: impulso hacia delante que no se puede frenar hasta que acaba
    if (input.roll) {
      input.roll = false;
      if (!this.swimming && !this.airborne && this.rollT <= 0) { this.rollT = ROLL_T; this.motion.roll = 1; }
    }
    if (this.rollT > 0) {
      this.rollT -= dt;
      target.set(Math.sin(this.heading), Math.cos(this.heading)).multiplyScalar(ROLL_V * Math.min(1, this.rollT / ROLL_T + 0.35));
    }
    this.vel.lerp(target, 1 - Math.exp(-(this.airborne ? 4 : 12) * dt));

    const p = this.group.position;
    // dentro de la cueva se camina por su suelo (por debajo de la meseta) y no se puede salir por las paredes
    const cf = caveFloor(p.x, p.z);
    this.inCave = !Number.isNaN(cf) && p.y < cf + 1.5;
    const tryMove = (nx: number, nz: number) => {
      if (Math.hypot(nx, nz) > LIMIT) return false;
      if (this.inCave && caveLocal(nx, nz)[0] > CAVE.notch - 0.6 && Number.isNaN(caveFloor(nx, nz, 0.35))) return false;
      if (!onDock(nx, nz) && heightAt(nx, nz) < MAX_DEPTH) return false;
      for (const o of this.obstacles) {
        if (Math.hypot(nx - o.x, nz - o.z) < o.r + 0.35) return false;
      }
      return true;
    };
    const nx = p.x + this.vel.x * dt, nz = p.z + this.vel.y * dt;
    if (tryMove(nx, nz)) { p.x = nx; p.z = nz; }
    else if (tryMove(nx, p.z)) { p.x = nx; this.vel.y = 0; }
    else if (tryMove(p.x, nz)) { p.z = nz; this.vel.x = 0; }
    else this.vel.set(0, 0);

    const cave = this.inCave ? caveFloor(p.x, p.z) : NaN;
    const h = Number.isNaN(cave) ? heightAt(p.x, p.z) : cave;
    const dock = onDock(p.x, p.z);
    this.swimming = !dock && h < SWIM_FROM;
    // con los clips de natación el cuerpo va tumbado: flota más arriba que el muñeco de respaldo
    const swimY = this.avatar?.animated ? -0.25 : -0.85;
    const targetY = dock ? DOCK.y : this.swimming ? waveHeight(p.x, p.z, t) * 0.7 + swimY : Math.max(h, -0.4);
    if (input.jump) {
      input.jump = false;
      if (!this.airborne && !this.swimming && this.rollT <= 0) { this.airborne = true; this.vy = JUMP_V; }
    }
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      p.y += this.vy * dt;
      if (p.y <= targetY && this.vy < 0) { p.y = targetY; this.airborne = false; this.vy = 0; }
    } else p.y += (targetY - p.y) * (1 - Math.exp(-(dock || this.swimming ? 10 : 40) * dt));

    const speed = this.vel.length();
    if (speed > 0.4) {
      const want = Math.atan2(this.vel.x, this.vel.y);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * (1 - Math.exp(-14 * dt));
      this.group.rotation.y = this.heading;
    }
    const mo = this.motion; mo.speed = speed / SPEED; mo.swimming = this.swimming; mo.t = t;
    mo.airborne = this.airborne; mo.crouch = crouch; mo.sprint = input.sprint;
    this.avatar?.update(dt, mo);
    this.phase += speed * dt * 1.7;
    const k = Math.min(1, speed / SPEED), s = Math.sin(this.phase) * 0.9 * k;
    if (this.swimming) {
      // braza: cuerpo inclinado hacia delante, brazos en círculo y patada corta
      const sw = Math.sin(t * 5.5) ;
      this.armL.rotation.x = -2.2 + Math.sin(t * 5.5) * 0.9 * (0.4 + k); this.armR.rotation.x = -2.2 - Math.sin(t * 5.5) * 0.9 * (0.4 + k);
      this.legL.rotation.x = sw * 0.35 * (0.4 + k); this.legR.rotation.x = -sw * 0.35 * (0.4 + k);
      this.body.rotation.x = 0.55 * Math.min(1, 0.4 + k);
      this.body.position.y = 0.05 + Math.sin(t * 2.2) * 0.03;
    } else {
      this.legL.rotation.x = s; this.legR.rotation.x = -s;
      this.armL.rotation.x = -s * 0.8; this.armR.rotation.x = s * 0.8;
      this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * k;
      this.body.rotation.x = 0.06 * k;
    }
  }
}
