import * as THREE from 'three';
import { CAVE, CHEST, PLATEAUS, caveFloorY, heightAt } from './terrain';
import type { Obstacle } from './props';
import { stoneMaterial } from './stone';
import { t } from '../i18n';

/*
 * Puzles de la isla (las parcelas y el cofre los reserva src/data/zones.json; aquí está lo que se mueve):
 * - Meseta este, «Losas del eco»: un cristal sobre el pedestal enseña una secuencia de colores; hay que pisar
 *   las cuatro losas de colores en ese orden. Si te equivocas, se apagan y vuelves a empezar.
 * - Meseta oeste, «Tótems del sol»: tres tótems de piedra (con una gema de color encima) que giran con E.
 *   La combinación está grabada en la tablilla de la cueva: cada color con su símbolo, mirando hacia fuera.
 * - Cofre de la playa: tiene dos cerraduras de runa, una por puzle. Con las dos encendidas, se abre.
 */

export type Glyph = 0 | 1 | 2 | 3; // sol, luna, ola, hoja
export const GLYPH_NAME = () => [t('sol', 'sun'), t('luna', 'moon'), t('ola', 'wave'), t('hoja', 'leaf')];
const COLORS = ['#2fd3c4', '#ff7a59', '#ffc857', '#a77bff']; // turquesa, coral, oro, violeta
const COLOR_NAME = () => [t('turquesa', 'teal'), t('coral', 'coral'), t('dorado', 'gold'), t('violeta', 'violet')];
/** Combinación de los tótems (turquesa, coral, dorado) y secuencia de las losas: fijas, para que la tablilla siempre valga. */
export const TOTEM_GOAL: Glyph[] = [1, 2, 3];
export const PLATE_SEQ = [2, 0, 3, 1];

export interface PuzzleState { east: boolean; west: boolean; chest: boolean }
export interface ZoneTarget { d: number; label: string; run: () => void }
interface Spot { x: number; z: number; y?: number; reach?: number; readonly label: string; run: () => void }

/** Dibuja un símbolo con trazo grueso centrado en (cx, cy). */
function glyph(g: CanvasRenderingContext2D, k: Glyph, cx: number, cy: number, s: number, color: string) {
  g.save(); g.translate(cx, cy); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = s * 0.12; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  if (k === 0) { // sol
    g.arc(0, 0, s * 0.22, 0, Math.PI * 2); g.fill(); g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.moveTo(Math.cos(a) * s * 0.33, Math.sin(a) * s * 0.33); g.lineTo(Math.cos(a) * s * 0.46, Math.sin(a) * s * 0.46); }
    g.stroke();
  } else if (k === 1) { // luna
    g.arc(0, 0, s * 0.4, 0.35 * Math.PI, 1.65 * Math.PI, false);
    g.arc(s * 0.16, -s * 0.02, s * 0.3, 1.5 * Math.PI, 0.5 * Math.PI, true);
    g.closePath(); g.fill();
  } else if (k === 2) { // ola: dos ondas
    for (const y of [-0.13, 0.17]) {
      g.moveTo(-s * 0.42, y * s);
      for (let i = 1; i <= 16; i++) { const x = -0.42 + (i / 16) * 0.84; g.lineTo(x * s, (y + Math.sin(i / 16 * Math.PI * 2) * 0.1) * s); }
    }
    g.stroke();
  } else { // hoja
    g.moveTo(0, -s * 0.44); g.quadraticCurveTo(s * 0.38, 0, 0, s * 0.4); g.quadraticCurveTo(-s * 0.38, 0, 0, -s * 0.44); g.fill();
    g.strokeStyle = 'rgba(40,30,20,.55)'; g.lineWidth = s * 0.05; g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(0, s * 0.46); g.stroke();
  }
  g.restore();
}

function canvasTex(c: HTMLCanvasElement) { const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; }

/** Cara de piedra con un símbolo grabado que brilla. */
function runeFace(k: Glyph): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a7a6a'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${i % 2 ? '255,240,220' : '40,30,20'},.08)`; g.fillRect((i * 37) % 128, (i * 61) % 128, 6 + (i % 5) * 3, 3); }
  g.strokeStyle = 'rgba(40,30,20,.5)'; g.lineWidth = 6; g.strokeRect(8, 8, 112, 112);
  glyph(g, k, 64, 64, 92, '#fff3c4');
  return canvasTex(c);
}

/** Tablilla de la cueva: los tres colores de los tótems con su símbolo. */
export function tabletCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 384; c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9b79f'; g.beginPath(); g.roundRect(0, 0, 384, 160, 18); g.fill();
  g.strokeStyle = '#7d6a58'; g.lineWidth = 6; g.stroke();
  TOTEM_GOAL.forEach((k, i) => {
    const x = 70 + i * 122;
    g.fillStyle = COLORS[i]; g.beginPath(); g.arc(x, 80, 52, 0, Math.PI * 2); g.fill();
    glyph(g, k, x, 80, 74, '#3a2a1c');
  });
  return c;
}

const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...o });
const glow = (color: string) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4 });

interface Totem { group: THREE.Group; state: number; rot: number; gem: THREE.MeshStandardMaterial; faces: THREE.MeshStandardMaterial[] }
interface Plate { x: number; z: number; y: number; m: THREE.MeshStandardMaterial; color: number }

export class Puzzles {
  onSolve: (id: 'east' | 'west' | 'chest') => void = () => {};
  onNote: (title: string, body: string, img?: string) => void = () => {};
  readonly tablet: THREE.Vector3;
  private totems: Totem[] = [];
  private plates: Plate[] = [];
  private step = 0;
  private onPlate = -1;
  private failT = -9;
  private crystal: THREE.Mesh;
  private crystalM: THREE.MeshStandardMaterial;
  private eastBeam: THREE.Mesh;
  private westBeam: THREE.Mesh;
  private chestLid = new THREE.Group();
  private chestLocks: THREE.MeshStandardMaterial[] = [];
  private chestGem: THREE.Mesh;
  private chestLight: THREE.PointLight;
  private lidAngle = 0;
  private spots: Spot[] = [];

  constructor(scene: THREE.Scene, obstacles: Obstacle[], readonly state: PuzzleState, private save: () => void) {
    const root = new THREE.Group(); root.name = 'puzzles'; scene.add(root);

    /* ---- meseta este: losas del eco ---- */
    const E = PLATEAUS[0], ey = heightAt(E.x, E.z);
    const plateGeo = new THREE.CylinderGeometry(0.62, 0.68, 0.14, 8);
    for (let i = 0; i < 4; i++) {
      const a = E.ramp + Math.PI / 4 + (i * Math.PI) / 2, x = E.x + Math.cos(a) * 2.1, z = E.z + Math.sin(a) * 2.1, y = heightAt(x, z);
      const m = glow(COLORS[i]);
      const p = new THREE.Mesh(plateGeo, m); p.position.set(x, y + 0.03, z); p.receiveShadow = true; root.add(p);
      this.plates.push({ x, z, y, m, color: i });
    }
    this.crystalM = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.92 });
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), this.crystalM);
    this.crystal.scale.y = 1.6; this.crystal.position.set(E.x, ey + 1.6, E.z); root.add(this.crystal);
    this.eastBeam = this.beam(root, E.x, ey, E.z, '#ffd27a');

    /* ---- meseta oeste: tótems del sol ---- */
    const W = PLATEAUS[1], faces = ([0, 1, 2, 3] as Glyph[]).map(runeFace);
    const body = new THREE.BoxGeometry(0.62, 1.3, 0.62);
    for (let i = 0; i < 3; i++) {
      const a = W.ramp + Math.PI / 2 + i * (Math.PI / 2), x = W.x + Math.cos(a) * 2.3, z = W.z + Math.sin(a) * 2.3, y = heightAt(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z);
      g.rotation.y = Math.atan2(x - W.x, z - W.z); // +Z local mira hacia fuera
      const spin = new THREE.Group(); g.add(spin);
      const fm = faces.map((map) => new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffd890', emissiveIntensity: 0.25, roughness: 0.9 }));
      const top = stoneMaterial('#9d8b79', 0.5);
      // grupos de la caja: +x, -x, +y, -y, +z, -z → símbolos 1, 3, (piedra), (piedra), 0, 2
      const m = new THREE.Mesh(body, [fm[1], fm[3], top, top, fm[0], fm[2]]);
      m.position.y = 0.65; m.castShadow = true; m.receiveShadow = true; spin.add(m);
      const gemM = glow(COLORS[i]);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), gemM); gem.position.y = 1.5; gem.scale.y = 1.4; g.add(gem);
      root.add(g);
      obstacles.push({ x, z, r: 0.5 });
      const tt: Totem = { group: spin, state: state.west ? TOTEM_GOAL[i] : 0, rot: 0, gem: gemM, faces: fm };
      tt.rot = -tt.state * Math.PI / 2; spin.rotation.y = tt.rot;
      this.totems.push(tt);
      const names = COLOR_NAME();
      const self = this;
      this.spots.push({ x, z, run: () => this.turn(i), get label() {
        const g = GLYPH_NAME()[self.totems[i].state];
        return t(`Girar el tótem ${names[i]} (${g})`, `Turn the ${names[i]} totem (${g})`);
      } });
    }
    this.westBeam = this.beam(root, W.x, heightAt(W.x, W.z), W.z, '#7fe0d6');

    /* ---- tablilla en el pedestal de la cueva ---- */
    const s = CAVE.room.s, fy = caveFloorY(s);
    this.tablet = new THREE.Vector3(CAVE.x + CAVE.dx * s, fy, CAVE.z + CAVE.dz * s);
    const tabMap = canvasTex(tabletCanvas());
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.4), new THREE.MeshStandardMaterial({ map: tabMap, emissiveMap: tabMap, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.9 }));
    tab.position.set(this.tablet.x, fy + 0.86, this.tablet.z);
    // tumbada sobre el pedestal, algo inclinada hacia la boca de la cueva (por donde llega el visitante)
    tab.rotation.set(-Math.PI / 2 + 0.35, Math.atan2(-CAVE.dx, -CAVE.dz), 0, 'YXZ');
    root.add(tab);
    const lamp = new THREE.PointLight('#ffe3b0', 2.2, 4.5, 1.6); lamp.position.set(this.tablet.x, fy + 1.9, this.tablet.z); root.add(lamp);
    this.spots.push({ x: this.tablet.x, z: this.tablet.z, y: fy, reach: 1.9, label: t('Leer la tablilla', 'Read the tablet'), run: () => this.readTablet() });

    /* ---- cofre de la playa ---- */
    const cy = heightAt(CHEST.x, CHEST.z), chest = new THREE.Group();
    chest.position.set(CHEST.x, cy - 0.32, CHEST.z);
    chest.rotation.set(0.18, Math.atan2(-CHEST.x, -CHEST.z) + 0.4, -0.12, 'YXZ'); // inclinado, mirando hacia tierra
    const wood = mat('#7d4a2a'), woodL = mat('#b9824f'), metal = mat('#c9a14a', { metalness: 0.5, roughness: 0.45 });
    const box = (geo: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o;
    };
    box(new THREE.BoxGeometry(1.1, 0.6, 0.7), wood, chest, 0, 0.3, 0);
    box(new THREE.BoxGeometry(1.0, 0.04, 0.6), mat('#3b2414'), chest, 0, 0.58, 0); // fondo oscuro, se ve al abrir
    for (const x of [-0.42, 0.42]) box(new THREE.BoxGeometry(0.08, 0.62, 0.72), metal, chest, x, 0.3, 0);
    // dos cerraduras de runa en el frente: izquierda = meseta oeste (turquesa), derecha = meseta este (dorada)
    for (const [x, c] of [[-0.2, '#7fe0d6'], [0.2, '#ffd27a']] as const) {
      const lm = new THREE.MeshStandardMaterial({ color: '#4a3a2c', emissive: c, emissiveIntensity: 0, roughness: 0.5 });
      box(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10), lm, chest, x, 0.38, 0.36).rotation.x = Math.PI / 2;
      this.chestLocks.push(lm);
    }
    this.chestLid.position.set(0, 0.6, -0.35); chest.add(this.chestLid);
    const top = new THREE.CylinderGeometry(0.35, 0.35, 1.1, 10, 1, false, 0, Math.PI); top.rotateZ(Math.PI / 2);
    box(top, woodL, this.chestLid, 0, 0, 0.35);
    box(new THREE.BoxGeometry(0.16, 0.18, 0.06), metal, this.chestLid, 0, -0.02, 0.72);
    this.chestGem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffb300', emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.25 }));
    this.chestGem.position.set(0, 0.62, 0); this.chestGem.visible = false; chest.add(this.chestGem);
    this.chestLight = new THREE.PointLight('#ffcc66', 0, 6, 1.5); this.chestLight.position.set(0, 1.1, 0); chest.add(this.chestLight);
    root.add(chest);
    if (state.chest) this.lidAngle = -1.9;
    this.chestLid.rotation.x = this.lidAngle;
    const st = this.state;
    this.spots.push({ x: CHEST.x, z: CHEST.z, reach: 2.3, run: () => this.openChest(), get label() {
      const n = +st.east + +st.west;
      return st.chest ? t('Cofre abierto', 'Open chest')
        : n === 2 ? t('Abrir el cofre', 'Open the chest')
          : t(`Cofre cerrado (${n}/2 runas)`, `Locked chest (${n}/2 runes)`);
    } });
  }

  private beam(root: THREE.Object3D, x: number, y: number, z: number, color: string) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    b.position.set(x, y + 15.9, z); b.visible = false; root.add(b);
    return b;
  }

  get solvedRunes() { return +this.state.east + +this.state.west; }

  private turn(i: number) {
    if (this.state.west) { this.onNote(t('Tótems del sol', 'Sun totems'), t('Los tótems ya están alineados: la runa turquesa del cofre está encendida.', 'The totems are already aligned: the teal rune on the chest is lit.')); return; }
    const tt = this.totems[i];
    tt.state = (tt.state + 1) % 4;
    if (this.totems.every((x, k) => x.state === TOTEM_GOAL[k])) {
      this.state.west = true; this.save(); this.onSolve('west');
    }
  }

  private readTablet() {
    const names = COLOR_NAME(), g = GLYPH_NAME();
    this.onNote(t('Tablilla de piedra', 'Stone tablet'),
      t(`Tres colores y tres símbolos: ${names[0]} con ${g[TOTEM_GOAL[0]]}, ${names[1]} con ${g[TOTEM_GOAL[1]]} y ${names[2]} con ${g[TOTEM_GOAL[2]]}. Parece la clave de los tótems de la meseta oeste.`,
        `Three colours and three symbols: ${names[0]} with ${g[TOTEM_GOAL[0]]}, ${names[1]} with ${g[TOTEM_GOAL[1]]} and ${names[2]} with ${g[TOTEM_GOAL[2]]}. It looks like the key to the totems on the west plateau.`),
      tabletCanvas().toDataURL());
    this.tabletRead = true;
  }
  tabletRead = false;

  private openChest() {
    if (this.state.chest) return;
    if (!(this.state.east && this.state.west)) {
      this.onNote(t('Cofre cerrado', 'Locked chest'),
        t(`Tiene dos cerraduras con forma de runa (${this.solvedRunes}/2 encendidas). Se encienden al resolver los puzles de las dos mesetas.`,
          `It has two rune-shaped locks (${this.solvedRunes}/2 lit). They light up when you solve the puzzles on both plateaus.`));
      return;
    }
    this.state.chest = true; this.save(); this.onSolve('chest');
  }

  /** Lo interactivo más cercano a `p` (tótems, tablilla, cofre) dentro de su alcance, o null. */
  nearest(p: THREE.Vector3): ZoneTarget | null {
    let best: Spot | null = null, bd = Infinity;
    for (const sp of this.spots) {
      if (sp.y !== undefined && Math.abs(p.y - sp.y) > 1.5) continue; // la tablilla está bajo la meseta
      const d = Math.hypot(p.x - sp.x, p.z - sp.z);
      if (d < (sp.reach ?? 1.6) && d < bd) { bd = d; best = sp; }
    }
    if (!best) return null;
    this.hit.d = bd; this.hit.label = best.label; this.hit.run = best.run;
    return this.hit;
  }
  private hit: ZoneTarget = { d: 0, label: '', run: () => {} };

  update(t: number, dt: number, p: THREE.Vector3) {
    // losas: el cristal repite la secuencia; pisar en orden
    const E = PLATEAUS[0];
    let on = -1; // losa que se pisa
    if (Math.hypot(p.x - E.x, p.z - E.z) < 5) for (let i = 0; i < 4; i++) if (Math.hypot(p.x - this.plates[i].x, p.z - this.plates[i].z) < 0.68 && p.y < this.plates[i].y + 0.6) on = i;
    if (this.state.east) {
      this.onPlate = on;
      this.crystalM.color.set('#ffd27a'); this.crystalM.emissive.set('#ffb340');
      for (const pl of this.plates) pl.m.emissiveIntensity = 0.9;
    } else {
      const cyc = (t % 5.2) / 0.9, k = Math.floor(cyc);
      const show = k < PLATE_SEQ.length && cyc - k < 0.75;
      const c = show ? COLORS[PLATE_SEQ[k]] : '#ffffff';
      this.crystalM.color.set(c); this.crystalM.emissive.set(c); this.crystalM.emissiveIntensity = show ? 1.6 : 0.25;
      if (on !== this.onPlate && on >= 0) {
        if (on === PLATE_SEQ[this.step]) {
          this.step++;
          if (this.step === PLATE_SEQ.length) { this.state.east = true; this.save(); this.onSolve('east'); }
        } else { this.step = on === PLATE_SEQ[0] ? 1 : 0; this.failT = t; }
      }
      this.onPlate = on;
      const fail = t - this.failT < 0.6;
      for (let i = 0; i < 4; i++) {
        const lit = PLATE_SEQ.slice(0, this.step).includes(i);
        this.plates[i].m.emissiveIntensity = fail ? 0.05 + Math.abs(Math.sin(t * 30)) * 0.6 : lit ? 1.1 : i === on ? 0.5 : 0.15;
      }
    }
    this.crystal.rotation.y = t * 0.8;
    this.crystal.position.y = heightAt(E.x, E.z) + 1.65 + Math.sin(t * 1.7) * 0.08;

    // tótems: giro suave hasta su posición (siempre en el mismo sentido)
    for (const tt of this.totems) {
      const goal = -tt.state * Math.PI / 2;
      let d = goal - tt.rot; d = ((d % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      tt.rot += d * Math.min(1, dt * 8); tt.group.rotation.y = tt.rot;
      const ok = this.state.west;
      tt.gem.emissiveIntensity = ok ? 1.4 : 0.35 + Math.sin(t * 2) * 0.1;
      for (const f of tt.faces) f.emissiveIntensity = ok ? 0.9 : 0.25;
    }

    // columnas de luz: al resolver, se ven desde lejos (y a lo lejos marcan dónde ir al cofre)
    for (const [b, on] of [[this.eastBeam, this.state.east], [this.westBeam, this.state.west]] as const) {
      b.visible = on;
      if (on) (b.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 1.3) * 0.03;
    }

    // cofre: las runas se encienden y la tapa se abre
    this.chestLocks[0].emissiveIntensity = this.state.west ? 1.8 : 0;
    this.chestLocks[1].emissiveIntensity = this.state.east ? 1.8 : 0;
    const goal = this.state.chest ? -1.9 : 0;
    this.lidAngle += (goal - this.lidAngle) * Math.min(1, dt * 2.2);
    this.chestLid.rotation.x = this.lidAngle;
    this.chestGem.visible = this.state.chest;
    if (this.state.chest) {
      this.chestGem.position.y = 0.75 + Math.min(1, -this.lidAngle / 1.9) * 0.35 + Math.sin(t * 2) * 0.05;
      this.chestGem.rotation.y = t * 1.5;
      this.chestLight.intensity = 3 + Math.sin(t * 3) * 0.6;
    }
  }

  /** Solo para pruebas: resuelve el puzle indicado como lo haría el visitante. */
  debugTotems(states: number[]) { states.forEach((s, i) => { while (this.totems[i].state !== s) this.turn(i); }); }
  get plateStep() { return this.state.east ? PLATE_SEQ.length : this.step; }
  get plateOn() { return this.onPlate; }
  get plateCenters() { return this.plates.map((p) => [p.x, p.z]); }
}
