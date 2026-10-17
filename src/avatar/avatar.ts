import * as THREE from 'three';
import { loadGLTF } from '../assets/loader';
import { CATEGORIES, LOCKS, SKIN_COLORS, type AvatarConfig, defaultConfig } from './config';

const BASE = `${import.meta.env.BASE_URL}models/avatar/`;

const AXIS_X = new THREE.Vector3(1, 0, 0);
export interface Motion { speed: number; swimming: boolean; t: number; /** 0–1: saluda con el brazo derecho */ wave?: number }

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

  static async create(): Promise<Avatar> {
    const a = new Avatar();
    await a.init();
    return a;
  }

  private async init() {
    const [arm, poses] = await Promise.all([loadGLTF(`${BASE}Armature.glb`), loadGLTF(`${BASE}Poses.glb`)]);
    const hips = arm.scene.getObjectByName('mixamorigHips');
    const plane = arm.scene.getObjectByName('Plane') as THREE.SkinnedMesh | undefined;
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
    const idle = poses.animations.find((c) => c.name === 'Idle') ?? poses.animations[0];
    if (idle) {
      const tracks = idle.tracks.filter((t) => this.root.getObjectByName(t.name.split('.')[0]));
      this.mixer.clipAction(new THREE.AnimationClip('Idle', idle.duration, tracks)).play();
    }
  }

  /** Carga (con caché) la pieza `file` y devuelve su escena. */
  private part(file: string): Promise<THREE.Group> {
    let p = this.cache.get(file);
    if (!p) {
      p = loadGLTF(`${BASE}${file}.glb`).then((g) => g.scene);
      this.cache.set(file, p);
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
        sm.castShadow = sm.receiveShadow = true;
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

  /** Gira un hueso `angle` radianes alrededor de un eje del personaje (por defecto, su derecha). */
  private swing(name: string, angle: number, local = AXIS_X) {
    const bone = this.bones[name];
    if (!bone?.parent) return;
    bone.parent.getWorldQuaternion(this._pw);
    this.root.getWorldQuaternion(this._gq);
    this._axis.copy(local).applyQuaternion(this._gq);
    this._q.setFromAxisAngle(this._axis, angle);
    bone.quaternion.premultiply(this._pw).premultiply(this._q);
    this._pw.invert();
    bone.quaternion.premultiply(this._pw);
  }

  update(dt: number, m: Motion) {
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
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
