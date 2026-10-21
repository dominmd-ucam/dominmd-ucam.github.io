import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadGLTF } from '../assets/loader';
import { CATEGORIES, LOCKS, SKIN_COLORS, type AvatarConfig, defaultConfig } from './config';

const BASE = `${import.meta.env.BASE_URL}models/avatar/`;

const AXIS_X = new THREE.Vector3(1, 0, 0);

/** Caché compartida por todos los avatares (el del juego y el de las miniaturas del selector): cada .glb se descarga y se procesa una sola vez. */
const files = new Map<string, Promise<GLTF>>();
function file(name: string): Promise<GLTF> {
  let p = files.get(name);
  if (!p) {
    p = loadGLTF(`${BASE}${name}.glb`);
    p.catch(() => files.delete(name)); // si falla, el siguiente intento vuelve a pedirlo
    files.set(name, p);
  }
  return p;
}
export interface Motion {
  speed: number; swimming: boolean; t: number;
  /** 0–1: saluda con el brazo derecho */ wave?: number;
  /** en el aire (salto o caída) */ airborne?: boolean;
  crouch?: boolean;
  sprint?: boolean;
  /** se pone a 1 para lanzar una voltereta; el avatar lo vuelve a 0 */ roll?: number;
}

/** Clips de Moves.glb (Universal Animation Library de Quaternius, CC0, pasados al esqueleto Mixamo con scripts/retarget-ual.mjs). */
type Clip = 'Idle' | 'Walk' | 'Run' | 'Sprint' | 'JumpStart' | 'JumpLoop' | 'JumpLand' | 'CrouchIdle' | 'CrouchWalk' | 'Roll' | 'SwimIdle' | 'Swim' | 'Interact' | 'Dance';
const ONCE: Clip[] = ['JumpStart', 'JumpLand', 'Roll', 'Interact'];
/** piezas pequeñas que no proyectan sombra */
const NO_SHADOW = new Set(['Eyes', 'EyeBrow', 'Nose', 'Earring', 'Face', 'Glasses', 'FacialHair']);

/**
 * Avatar modular: un esqueleto Mixamo compartido y piezas SkinnedMesh intercambiables.
 * Portado a three "a pelo" desde r3f-ultimate-character-configurator (Wawa Sensei).
 */
export class Avatar {
  /** raíz que se coloca y orienta en el mundo (pies en el origen) */
  readonly root = new THREE.Group();
  private armature = new THREE.Group();
  private skeleton!: THREE.Skeleton;
  private mixer!: THREE.AnimationMixer;
  private skin = new THREE.MeshStandardMaterial({ color: SKIN_COLORS[1], roughness: 0.9 });
  private slots = new Map<string, THREE.Group>();
  private cache = new Map<string, Promise<THREE.Group>>();
  private bones: Record<string, THREE.Object3D> = {};
  private phase = 0;
  private config: AvatarConfig = defaultConfig();
  private applying = Promise.resolve();
  /** puntero a la última petición de apply (descarta las obsoletas) */
  private ticket = 0;
  /** acciones de Moves.glb; vacío si no cargó (se usa entonces el balanceo procedural) */
  private acts = new Map<Clip, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private curName: Clip | null = null;
  private wasAir = false;
  /** acción de una sola vez que manda hasta que termina (salto, aterrizaje, voltereta) */
  private once: Clip | null = null;
  get animated() { return this.acts.size > 0; }

  static async create(): Promise<Avatar> {
    const a = new Avatar();
    await a.init();
    return a;
  }

  private async init() {
    const [armGltf, moves] = await Promise.all([
      file('Armature'),
      file('Moves').catch((e) => { console.warn('avatar: sin Moves.glb, uso la pose de Poses.glb', e); return null; }),
    ]);
    // Poses.glb (211 KB) solo hace falta si no llegaron las animaciones
    const poses = moves ? null : await file('Poses').catch(() => null);
    const arm = cloneSkinned(armGltf.scene); // copia propia: los huesos se mueven a este avatar
    const hips = arm.getObjectByName('mixamorigHips');
    const plane = arm.getObjectByName('Plane') as THREE.SkinnedMesh | undefined;
    if (!hips || !plane) throw new Error('Armature.glb sin Hips o Plane');
    this.skeleton = plane.skeleton;
    this.armature.rotation.x = Math.PI / 2; // el rig viene de Blender (Z arriba), en centímetros
    this.armature.scale.setScalar(0.01);
    this.armature.add(hips);
    this.root.add(this.armature);
    this.root.updateMatrixWorld(true);

    for (const b of this.skeleton.bones) this.bones[b.name] = b;

    // animaciones (poses): descartamos pistas de huesos que no existen en este esqueleto
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const c of moves?.animations ?? []) {
      const tracks = c.tracks.filter((t) => this.root.getObjectByName(t.name.split('.')[0]));
      const a = this.mixer.clipAction(new THREE.AnimationClip(c.name, c.duration, tracks));
      if (ONCE.includes(c.name as Clip)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.acts.set(c.name as Clip, a);
    }
    this.mixer.addEventListener('finished', (e) => { if (this.once && e.action === this.acts.get(this.once)) this.once = null; });
    const idle = poses ? poses.animations.find((c) => c.name === 'Idle') ?? poses.animations[0] : undefined;
    if (this.acts.size) this.play('Idle', 0);
    else if (idle) {
      const tracks = idle.tracks.filter((t) => this.root.getObjectByName(t.name.split('.')[0]));
      this.mixer.clipAction(new THREE.AnimationClip('Idle', idle.duration, tracks)).play();
    }
  }

  /** Carga (con caché) la pieza `file` y devuelve su escena. */
  private part(name: string): Promise<THREE.Group> {
    let p = this.cache.get(name);
    if (!p) {
      p = file(name).then((g) => g.scene);
      this.cache.set(name, p);
    }
    return p;
  }

  /** Aplica una configuración: carga las piezas que faltan y recompone el cuerpo. */
  apply(config: AvatarConfig): Promise<void> {
    this.config = structuredClone(config);
    const mine = ++this.ticket;
    this.applying = this.applying.then(() => this.build(mine)).catch((e) => console.warn('avatar:', e));
    return this.applying;
  }

  private async build(mine: number) {
    const cfg = this.config;
    // piezas bloqueadas por otras (disfraces, calabaza…)
    const locked = new Set<string>();
    for (const c of CATEGORIES) {
      const idx = cfg.parts[c.name];
      if (idx != null) for (const l of LOCKS[c.files[idx]] ?? []) locked.add(l);
    }
    const skinColor = cfg.colors.Head ?? SKIN_COLORS[1];
    this.skin.color.set(skinColor);

    for (const c of CATEGORIES) {
      const idx = cfg.parts[c.name];
      const old = this.slots.get(c.name);
      if (old) { this.armature.remove(old); this.slots.delete(c.name); }
      if (idx == null || locked.has(c.name)) continue;
      const scene = await this.part(c.files[idx]);
      if (mine !== this.ticket) return; // llegó una configuración más nueva
      const group = new THREE.Group();
      const color = cfg.colors[c.name];
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = m.material as THREE.Material;
        let material: THREE.Material = src;
        if (src.name.includes('Skin_')) material = this.skin;
        else if (src.name.includes('Color_')) {
          material = src.clone();
          if (color) (material as THREE.MeshStandardMaterial).color.set(color);
        }
        const sm = new THREE.SkinnedMesh(m.geometry, material);
        sm.skeleton = this.skeleton;
        sm.morphTargetDictionary = m.morphTargetDictionary;
        sm.morphTargetInfluences = m.morphTargetInfluences;
        sm.castShadow = !NO_SHADOW.has(c.name); // ojos, cejas, nariz… no cambian la sombra y cada pieza es otra llamada en la pasada de sombras
        sm.receiveShadow = true;
        sm.frustumCulled = false;
        group.add(sm);
      });
      this.slots.set(c.name, group);
      this.armature.add(group);
    }
  }

  getConfig(): AvatarConfig { return structuredClone(this.config); }

  /* ---------- animación ---------- */
  private _pw = new THREE.Quaternion();
  private _gq = new THREE.Quaternion();
  private _q = new THREE.Quaternion();
  private _axis = new THREE.Vector3();

  /** Rotación en el mundo del esqueleto (armature) y del avatar: no cambian mientras se aplican los giros de un fotograma. */
  private _armQ = new THREE.Quaternion();

  /** Rotación en el mundo de `o`: producto de las rotaciones locales (la escala es uniforme y no la afecta). */
  private worldQuat(o: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
    if (!o.parent) return out.copy(o.quaternion);
    return this.worldQuat(o.parent, out).multiply(o.quaternion);
  }

  /** Igual, pero sin subir por encima del armature: su rotación ya está calculada en `_armQ`. */
  private boneWorldQuat(o: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
    if (o === this.armature || !o.parent) return out.copy(this._armQ);
    return this.boneWorldQuat(o.parent, out).multiply(o.quaternion);
  }

  /**
   * Gira un hueso `angle` radianes alrededor de un eje del personaje (por defecto, su derecha), en ejes del mundo.
   * Antes se leían las matrices del mundo con getWorldQuaternion (que recorre y recompone la jerarquía entera en cada llamada, ~10 por avatar y fotograma);
   * ahora basta multiplicar las rotaciones locales de la cadena de huesos, que son 5–6 productos.
   */
  private swing(name: string, angle: number, local = AXIS_X) {
    const bone = this.bones[name];
    if (!bone?.parent) return;
    this.boneWorldQuat(bone.parent, this._pw);
    this._axis.copy(local).applyQuaternion(this._gq);
    this._q.setFromAxisAngle(this._axis, angle);
    bone.quaternion.premultiply(this._pw).premultiply(this._q);
    this._pw.invert();
    bone.quaternion.premultiply(this._pw);
  }

  /** Pasa a `name` fundiendo en `fade` segundos. `from` es el punto del clip por el que empieza. */
  private play(name: Clip, fade = 0.2, from = 0) {
    const next = this.acts.get(name);
    if (!next || next === this.cur) return;
    next.reset(); next.time = from; next.setEffectiveWeight(1); next.play();
    if (this.cur) next.crossFadeFrom(this.cur, fade, false);
    this.cur = next; this.curName = name;
  }

  /** Elige el clip según el movimiento. */
  private pick(m: Motion) {
    const k = m.speed;
    if (m.roll) { m.roll = 0; this.once = 'Roll'; this.play('Roll', 0.1, 0.05); this.acts.get('Roll')!.timeScale = 1.35; }
    if (m.airborne && !m.swimming) {
      if (!this.wasAir) { this.once = 'JumpStart'; this.play('JumpStart', 0.08, 0.04); this.acts.get('JumpStart')!.timeScale = 1.6; }
      else if (this.once !== 'JumpStart' && this.once !== 'Roll') this.play('JumpLoop', 0.25);
      this.wasAir = true;
      return;
    }
    if (this.wasAir) {
      this.wasAir = false;
      if (this.once !== 'Roll') { this.once = k > 0.3 ? null : 'JumpLand'; if (this.once) { this.play('JumpLand', 0.08, 0.05); this.acts.get('JumpLand')!.timeScale = 1.5; } }
    }
    // la voltereta termina sola; el aterrizaje se corta si ya echas a andar
    if (this.once === 'Roll') return;
    if (this.once === 'JumpLand' && k < 0.15) return;
    this.once = null;
    let want: Clip, rate = 1;
    if (m.swimming) { want = k > 0.12 ? 'Swim' : 'SwimIdle'; rate = 0.7 + k * 0.6; }
    else if (m.crouch) { want = k > 0.06 ? 'CrouchWalk' : 'CrouchIdle'; rate = k > 0.06 ? Math.max(0.6, k / 0.32) : 1; }
    else if (k < 0.06) want = 'Idle';
    else if (m.sprint && k > 0.9) { want = 'Sprint'; rate = k / 1.45; }
    // Walk_Loop avanza ~1,5 m/s y Jog_Fwd_Loop ~4 m/s a escala real; aquí la velocidad va en fracciones de 6,5 m/s
    else if (k < 0.42) { want = 'Walk'; rate = Math.max(0.55, k / 0.26); }
    else { want = 'Run'; rate = Math.max(0.75, k / 0.68); }
    this.play(want, this.curName === 'JumpLand' ? 0.25 : 0.2);
    this.acts.get(want)!.timeScale = rate;
  }

  update(dt: number, m: Motion) {
    if (this.acts.size) this.pick(m);
    this.mixer.update(dt);
    // los giros leen las rotaciones locales (ya actualizadas por el mezclador), así que no hace falta recalcular las matrices del mundo aquí: el render lo hace una vez
    this.worldQuat(this.armature, this._armQ);
    this.worldQuat(this.root, this._gq);
    if (m.wave && m.wave > 0.01 && this.acts.size) {
      this.swing('mixamorigRightArm', -2.6 * m.wave + Math.sin(m.t * 9) * 0.25 * m.wave);
      this.swing('mixamorigRightForeArm', -0.5 * m.wave + Math.sin(m.t * 9) * 0.45 * m.wave);
    }
    if (this.acts.size) return; // con clips no hace falta el balanceo de abajo
    const k = Math.min(1, m.speed);
    this.phase += dt * (m.swimming ? 5.5 : 3 + 7 * k);
    const s = Math.sin(this.phase);
    if (m.wave && m.wave > 0.01) {
      this.swing('mixamorigRightArm', -2.6 * m.wave + Math.sin(m.t * 9) * 0.25 * m.wave);
      this.swing('mixamorigRightForeArm', -0.5 * m.wave + Math.sin(m.t * 9) * 0.45 * m.wave);
    }
    if (m.swimming) {
      // braza: brazos por encima de la cabeza alternando, patada corta
      this.swing('mixamorigLeftArm', -2.5 + s * 0.8 * (0.5 + k));
      this.swing('mixamorigRightArm', -2.5 - s * 0.8 * (0.5 + k));
      this.swing('mixamorigLeftUpLeg', s * 0.35);
      this.swing('mixamorigRightUpLeg', -s * 0.35);
      this.root.rotation.x += (0.9 - this.root.rotation.x) * Math.min(1, dt * 6);
    } else {
      const amp = 0.75 * k;
      this.swing('mixamorigLeftUpLeg', s * amp);
      this.swing('mixamorigRightUpLeg', -s * amp);
      this.swing('mixamorigLeftLeg', Math.max(0, -s) * amp * 1.3);
      this.swing('mixamorigRightLeg', Math.max(0, s) * amp * 1.3);
      this.swing('mixamorigLeftArm', -s * amp * 0.7);
      this.swing('mixamorigRightArm', s * amp * 0.7);
      this.swing('mixamorigLeftForeArm', -0.35 * k);
      this.swing('mixamorigRightForeArm', -0.35 * k);
      this.root.rotation.x += (0.06 * k - this.root.rotation.x) * Math.min(1, dt * 8);
    }
  }
}
