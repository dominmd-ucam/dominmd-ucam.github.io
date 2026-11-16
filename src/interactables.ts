import * as THREE from 'three';
import data from './data/projects.json';
import { heightAt, PLOTS, type Plot } from './world/terrain';
import type { Obstacle, ProjectType } from './world/props';
import type { Tier } from './quality';
import { t } from './i18n';

export interface Project {
  id: string;
  type: ProjectType;
  title: string;
  short: string;
  credit?: string;
  note?: string;
  description: string;
  tech: string[];
  repo: string | null;
  /** parcela de zones.json donde está su puesto */
  plot: string;
}

interface Station { project: Project; group: THREE.Group; label: THREE.Sprite; screen: THREE.Mesh; x: number; z: number }
interface PlotMark { beam: THREE.Mesh; marker: THREE.Mesh; baseY: number }

const REACH = 2.3;
/** Temática de cada parcela: se lee en el cartel de la entrada y flotando sobre ella. */
export const PLOT_THEMES: Record<string, { name: string; color: string }> = {
  'parcela-1': { name: t('Gestión y negocio', 'Business apps'), color: '#ff7a59' },
  'parcela-2': { name: t('Web y datos', 'Web & data'), color: '#1fb5b0' },
  'parcela-3': { name: t('IA y automatización', 'AI & automation'), color: '#a77bff' },
  'parcela-4': { name: t('Apps y dispositivos', 'Apps & devices'), color: '#ffc857' },
};
const TYPE_ICON: Record<string, string> = { web: '🌐', bot: '🤖', plugin: '🧩', cli: '⌨', mobile: '📱', device: '📟' };

/** Cartel de texto en una textura (nombre flotante de la parcela o del proyecto). */
export function makeLabel(text: string, opts: { bg?: string; fg?: string; scale?: number } = {}): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg ?? 'rgba(255,250,240,.94)';
  g.beginPath(); g.roundRect(8, 16, 496, 96, 36); g.fill();
  g.fillStyle = opts.fg ?? '#0f3440'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 54;
  do { g.font = `700 ${size}px system-ui, sans-serif`; size -= 2; } while (g.measureText(text).width > 440 && size > 20);
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
  const s = opts.scale ?? 3.4;
  sp.scale.set(s, s / 4, 1);
  return sp;
}

/** Pantalla provisional mientras llega la captura (o si no existe): icono, nombre y tecnologías. */
function placeholderTexture(p: Project, color: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 512, 320); grd.addColorStop(0, '#0f3440'); grd.addColorStop(1, color);
  g.fillStyle = grd; g.fillRect(0, 0, 512, 320);
  g.font = '90px system-ui'; g.textAlign = 'center'; g.fillText(TYPE_ICON[p.type] ?? '★', 256, 140);
  g.fillStyle = '#fff'; g.font = '700 40px system-ui'; g.fillText(p.short, 256, 220);
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '24px system-ui'; g.fillText(p.tech.slice(0, 3).join(' · '), 256, 262);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const stoneMat = new THREE.MeshStandardMaterial({ color: '#b9b1a3', roughness: 0.9, flatShading: true });
const woodMat = new THREE.MeshStandardMaterial({ color: '#7d4a2a', roughness: 0.8, flatShading: true });
const frameMat = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.5, metalness: 0.2 });

/**
 * Puestos de proyectos: en cada parcela de proyectos de zones.json, un semicírculo de atriles de piedra con una pantalla que
 * enseña la captura del proyecto (public/projects/<id>.webp). Un haz de luz por parcela y su nombre flotando la hacen visible
 * de lejos; el cartel de la entrada dice su temática. Al acercarte a un atril se abre su ficha con el demo.
 */
export class Interactables {
  stations: Station[] = [];
  nearest: Station | null = null;
  private plots: PlotMark[] = [];
  private pulseUntil = 0;
  private boost = 0;

  pulse(seconds: number, now: number) { this.pulseUntil = now + seconds; }

  constructor(scene: THREE.Scene, obstacles: Obstacle[], tier: Tier) {
    const projects = data as unknown as Project[];
    const loader = new THREE.TextureLoader();
    const aniso = tier === 'low' ? 1 : 4;
    for (const plot of PLOTS.filter((p) => p.kind === 'project')) {
      const theme = PLOT_THEMES[plot.id] ?? { name: plot.id, color: '#4cc9f0' };
      const list = projects.filter((p) => p.plot === plot.id);
      this.buildPlotMarks(scene, plot, theme);
      const gate = Math.atan2(-plot.z, -plot.x); // la entrada mira al centro de la isla
      const ring = plot.r * 0.6, spread = Math.min(Math.PI * 1.15, 0.95 * list.length);
      list.forEach((project, i) => {
        // repartidos en arco enfrente de la entrada, mirando al centro de la parcela
        const a = gate + Math.PI + (list.length === 1 ? 0 : (i / (list.length - 1) - 0.5) * spread);
        const x = plot.x + Math.cos(a) * ring, z = plot.z + Math.sin(a) * ring, y = heightAt(x, z);
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.rotation.y = Math.atan2(plot.x - x, plot.z - z);
        scene.add(group);
        const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
          const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; group.add(o); return o;
        };
        add(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 7), stoneMat, 0, 0.05, 0); // peana
        add(new THREE.BoxGeometry(0.22, 1.1, 0.22), woodMat, 0, 0.65, -0.05); // pie
        const head = new THREE.Group(); head.position.set(0, 1.35, 0); head.rotation.x = -0.32; head.scale.setScalar(1.35); group.add(head); // atril inclinado
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.74, 0.06), frameMat); frame.castShadow = true; head.add(frame);
        const screenMat = new THREE.MeshBasicMaterial({ map: placeholderTexture(project, theme.color), toneMapped: false });
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.65), screenMat); screen.position.z = 0.032; head.add(screen);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.05, 0.065), new THREE.MeshBasicMaterial({ color: theme.color, toneMapped: false }));
        strip.position.y = -0.39; head.add(strip);
        loader.load(`${import.meta.env.BASE_URL}projects/${project.id}.webp`, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
          screenMat.map?.dispose(); screenMat.map = tex; screenMat.needsUpdate = true;
        }, undefined, () => { /* sin captura: se queda la pantalla provisional */ });
        obstacles.push({ x, z, r: 0.55 });
        const label = makeLabel(project.short, { scale: 2.2 });
        label.position.set(x, y + 2.55, z);
        scene.add(label);
        this.stations.push({ project, group, label, screen, x, z });
      });
    }
  }

  private buildPlotMarks(scene: THREE.Scene, plot: Plot, theme: { name: string; color: string }) {
    const y = heightAt(plot.x, plot.z);
    const color = new THREE.Color(theme.color);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 7, 20, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.set(plot.x, y + 3.5, plot.z);
    scene.add(beam);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3) }));
    marker.position.set(plot.x, y + 4.2, plot.z);
    scene.add(marker);
    const title = makeLabel(theme.name, { bg: 'rgba(15,52,64,.9)', fg: '#fffaf0', scale: 4 });
    title.position.set(plot.x, y + 5.3, plot.z);
    scene.add(title);
    // el cartel de madera de la entrada (zones.ts) lleva ahora la temática, por las dos caras
    const gate = Math.atan2(-plot.z, -plot.x);
    const sx = Math.cos(gate + 0.75) * (plot.r + 0.5), sz = Math.sin(gate + 0.75) * (plot.r + 0.5), sy = heightAt(plot.x + sx, plot.z + sz);
    const sign = new THREE.Group();
    sign.position.set(plot.x + sx, sy + 1.25, plot.z + sz);
    sign.rotation.y = Math.atan2(-sx, -sz) + Math.PI;
    const c = document.createElement('canvas'); c.width = 256; c.height = 156;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c99561'; g.fillRect(0, 0, 256, 156);
    g.fillStyle = '#3b2414'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = theme.name.split(' ');
    const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [theme.name];
    let size = 40; do { g.font = `700 ${size}px system-ui, sans-serif`; size -= 2; } while (Math.max(...lines.map((l) => g.measureText(l).width)) > 236);
    lines.forEach((l, k) => g.fillText(l, 128, 78 + (k - (lines.length - 1) / 2) * (size + 8)));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.51), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      face.position.z = 0.032 * side; if (side < 0) face.rotation.y = Math.PI;
      sign.add(face);
    }
    scene.add(sign);
    this.plots.push({ beam, marker, baseY: y + 4.2 });
  }

  update(time: number, player: THREE.Vector3) {
    this.boost += ((time < this.pulseUntil ? 1 : 0) - this.boost) * 0.06;
    for (const p of this.plots) {
      p.marker.position.y = p.baseY + Math.sin(time * 2 + p.baseY) * 0.15;
      p.marker.rotation.y = time * 1.2;
      (p.beam.material as THREE.MeshBasicMaterial).opacity = 0.09 + this.boost * 0.3;
      p.beam.scale.set(1 + this.boost * 0.6, 1 + this.boost * 1.6, 1 + this.boost * 0.6);
      p.beam.position.y = p.baseY - 4.2 + 3.5 * p.beam.scale.y; // la base del haz sigue en el suelo al estirarse
    }
    let best: Station | null = null, bd = REACH;
    for (const s of this.stations) {
      const d = Math.hypot(player.x - s.x, player.z - s.z);
      if (d < bd) { bd = d; best = s; }
      (s.label.material as THREE.SpriteMaterial).opacity = d > 26 ? 0 : Math.min(1, Math.max(0.25, (d - 1.5) / 3));
    }
    for (const s of this.stations) s.screen.scale.setScalar(s === best ? 1 + Math.sin(time * 6) * 0.015 : 1);
    this.nearest = best;
  }
}
