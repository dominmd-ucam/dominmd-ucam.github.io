import * as THREE from 'three';
import { t } from './i18n';
import type { PuzzleState } from './world/puzzles';

/*
 * Misiones secundarias: una lista corta que guía por la isla (Misu, parcelas de proyectos, faro, cueva, las dos mesetas y
 * el cofre). Se pueden hacer en cualquier orden; se sigue una cada vez (la primera sin hacer, o la que se elija en
 * Menú → Misiones). La seguida tiene una columna de luz en su destino y una flecha en el HUD que apunta hacia ella.
 * El progreso se guarda en localStorage junto con el estado de los puzles.
 */

export interface QuestDef {
  id: string;
  title: string;
  /** objetivo (puede llevar el progreso, p. ej. «2/4») */
  goal: () => string;
  /** destino al que apunta la flecha, o null si no hay uno fijo */
  target: () => THREE.Vector3 | null;
  done: () => boolean;
}

const KEY = 'portfolio-quests-v1';
interface Saved { visited?: string[]; tracked?: string | null; done?: string[]; puzzles?: Partial<PuzzleState> }

function load(): Saved { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved; } catch { return {}; } }

export class QuestStore {
  private s = load();
  readonly puzzles: PuzzleState = { east: false, west: false, chest: false, ...this.s.puzzles };
  readonly visited = new Set(this.s.visited ?? []);
  readonly done = new Set(this.s.done ?? []);
  tracked: string | null = this.s.tracked ?? null;
  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ visited: [...this.visited], tracked: this.tracked, done: [...this.done], puzzles: this.puzzles })); } catch { /* sin almacenamiento */ }
  }
}

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l7 18-7-4-7 4z" fill="currentColor"/></svg>';

export class Quests {
  onComplete: (q: QuestDef) => void = () => {};
  onOpenList: () => void = () => {};
  private el = document.createElement('button');
  private arrow: HTMLElement;
  private titleEl: HTMLElement;
  private goalEl: HTMLElement;
  private distEl: HTMLElement;
  private beacon: THREE.Group;
  private beaconMat: THREE.MeshBasicMaterial;
  private shown = '';
  private checkT = 0;

  constructor(scene: THREE.Scene, readonly list: QuestDef[], readonly store: QuestStore) {
    // lo que ya estaba hecho de antes no vuelve a avisar
    for (const q of list) if (q.done()) store.done.add(q.id);
    this.el.className = 'quest facet'; this.el.id = 'quest'; this.el.type = 'button';
    this.el.setAttribute('aria-label', t('Misiones', 'Quests'));
    this.el.innerHTML = `<i class="q-arrow">${ARROW}</i><span class="q-body"><small class="q-kicker"></small><b></b><span class="q-goal"></span></span><em class="q-dist"></em>`;
    (this.el.querySelector('.q-kicker') as HTMLElement).textContent = t('Misión', 'Quest');
    this.arrow = this.el.querySelector('.q-arrow') as HTMLElement;
    this.titleEl = this.el.querySelector('b') as HTMLElement;
    this.goalEl = this.el.querySelector('.q-goal') as HTMLElement;
    this.distEl = this.el.querySelector('.q-dist') as HTMLElement;
    this.el.addEventListener('click', () => this.onOpenList());
    document.getElementById('hud')?.append(this.el);

    // columna de luz con un rombo encima, en el destino de la misión que se sigue
    this.beacon = new THREE.Group();
    this.beaconMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 12, 1, true), this.beaconMat);
    beam.position.y = 7; this.beacon.add(beam);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: '#ffe3a0', fog: false }));
    gem.scale.y = 1.5; gem.position.y = 3.2; gem.name = 'gem'; this.beacon.add(gem);
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  get current(): QuestDef | null {
    const tr = this.list.find((q) => q.id === this.store.tracked && !q.done());
    return tr ?? this.list.find((q) => !q.done()) ?? null;
  }
  get completed() { return this.list.filter((q) => q.done()).length; }

  track(id: string) { this.store.tracked = id; this.store.save(); this.shown = ''; }

  set visible(v: boolean) { this.el.hidden = !v; }

  /** `yaw` = giro de la cámara (input.yaw): la flecha del HUD gira con ella. */
  update(time: number, dt: number, p: THREE.Vector3, yaw: number) {
    if ((this.checkT += dt) > 0.25) {
      this.checkT = 0;
      for (const q of this.list) {
        if (!this.store.done.has(q.id) && q.done()) {
          this.store.done.add(q.id);
          if (this.store.tracked === q.id) this.store.tracked = null;
          this.store.save();
          this.onComplete(q);
        }
      }
    }
    const q = this.current;
    const target = q?.target() ?? null;
    const key = q ? `${q.id}|${q.goal()}` : 'done';
    if (key !== this.shown) {
      this.shown = key;
      this.titleEl.textContent = q ? q.title : t('¡Isla completada!', 'Island complete!');
      this.goalEl.textContent = q ? q.goal() : t('Has hecho todas las misiones. Gracias por explorar.', 'You finished every quest. Thanks for exploring.');
      this.el.classList.toggle('all-done', !q);
    }
    if (!target) { this.beacon.visible = false; this.arrow.style.visibility = 'hidden'; this.distEl.textContent = ''; return; }
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    // la cámara mira hacia -(sin yaw, cos yaw): ángulo del destino respecto a esa dirección
    const ang = Math.atan2(dx, dz) - Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    this.arrow.style.visibility = 'visible';
    this.arrow.style.transform = `rotate(${-ang}rad)`;
    this.distEl.textContent = d < 1000 ? `${Math.round(d)} m` : '';
    this.beacon.visible = d > 5;
    this.beacon.position.copy(target);
    const gem = this.beacon.getObjectByName('gem')!;
    gem.rotation.y = time * 1.4; gem.position.y = 3.2 + Math.sin(time * 2) * 0.2;
    this.beaconMat.opacity = 0.12 + Math.min(0.12, d / 400);
  }
}
