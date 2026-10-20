import * as THREE from 'three';
import { Avatar } from './avatar';
import { defaultConfig, saveConfig, CLOTH_COLORS, HAIR_COLORS, SKIN_COLORS, type AvatarConfig } from './config';

export interface Preset { name: string; desc: string; cfg: AvatarConfig }

/** Crea una configuración a partir de la de por defecto: solo se indican las piezas y colores que cambian. */
const preset = (name: string, desc: string, parts: AvatarConfig['parts'], colors: AvatarConfig['colors']): Preset => {
  const cfg = defaultConfig();
  Object.assign(cfg.parts, parts);
  Object.assign(cfg.colors, colors);
  return { name, desc, cfg };
};

/** Personajes listos para jugar: dos de aspecto masculino y dos femenino (índices dentro de CATEGORIES). */
export const PRESETS: Preset[] = [
  preset('Explorador', 'Barba y ganas de playa',
    { Head: 0, Eyes: 1, EyeBrow: 1, Nose: 1, Hair: 1, FacialHair: 0, Top: 0, Bottom: 1, Shoes: 2 },
    { Head: SKIN_COLORS[2], EyeBrow: HAIR_COLORS[1], Hair: HAIR_COLORS[1], FacialHair: HAIR_COLORS[1], Top: CLOTH_COLORS[2], Bottom: CLOTH_COLORS[8], Shoes: CLOTH_COLORS[0] }),
  preset('Aventurera', 'Lista para la cueva',
    { Head: 1, Eyes: 3, EyeBrow: 2, Nose: 2, Hair: 10, Earring: 0, Top: 2, Bottom: 1, Shoes: 0 },
    { Head: SKIN_COLORS[1], EyeBrow: HAIR_COLORS[3], Hair: HAIR_COLORS[3], Top: CLOTH_COLORS[0], Bottom: CLOTH_COLORS[4], Shoes: CLOTH_COLORS[7] }),
  preset('Navegante', 'Gafas y rumbo fijo',
    { Head: 2, Eyes: 5, EyeBrow: 4, Nose: 0, Hair: 2, Glasses: 0, Top: 1, Bottom: 0, Shoes: 1 },
    { Head: SKIN_COLORS[6], EyeBrow: HAIR_COLORS[0], Hair: HAIR_COLORS[0], Glasses: CLOTH_COLORS[1], Top: CLOTH_COLORS[3], Bottom: CLOTH_COLORS[7], Shoes: CLOTH_COLORS[8] }),
  preset('Inventora', 'Con lazo y mil ideas',
    { Head: 3, Eyes: 7, EyeBrow: 3, Nose: 3, Hair: 6, Bow: 0, Earring: 2, Top: 0, Bottom: 1, Shoes: 2 },
    { Head: SKIN_COLORS[4], EyeBrow: HAIR_COLORS[0], Hair: HAIR_COLORS[0], Bow: CLOTH_COLORS[6], Top: CLOTH_COLORS[5], Bottom: CLOTH_COLORS[8], Shoes: CLOTH_COLORS[1] }),
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** Ancho y alto de las miniaturas (px). */
const TW = 240, TH = 300;

/**
 * Pantalla de elección de personaje (primera visita y "Cambiar de personaje" del menú).
 * Las miniaturas se dibujan una a una con el renderer del juego en un render target pequeño y se copian a lienzos 2D:
 * así no se abre un segundo contexto WebGL.
 */
export class CharacterSelect {
  open = false;
  /** se llama al elegir un personaje ya hecho */
  onPick: (cfg: AvatarConfig) => void = () => {};
  /** se llama con "Crear el mío" */
  onCustom: () => void = () => {};
  onToggle: (open: boolean) => void = () => {};
  private root = el('div', 'cs');
  private items: HTMLButtonElement[] = [];
  private close = el('button', 'av-close cs-close', '✕');
  private sel = 0;
  private justOpened = false;
  private thumbs: Promise<void> | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'csTitle');
    const card = el('div', 'cs-card facet');
    const head = el('div', 'cs-head');
    const title = el('h2', '', 'Elige tu personaje');
    title.id = 'csTitle';
    this.close.setAttribute('aria-label', 'Cerrar');
    this.close.addEventListener('click', () => this.toggle(false));
    head.append(title, this.close);
    const sub = el('p', 'cs-sub', 'Podrás cambiarlo cuando quieras desde el menú de pausa.');

    const grid = el('div', 'cs-grid');
    PRESETS.forEach((p, i) => {
      const b = el('button', 'cs-item');
      const pic = el('span', 'cs-pic');
      const cv = el('canvas');
      cv.width = TW; cv.height = TH;
      pic.append(cv);
      b.append(pic, el('b', '', p.name), el('small', '', p.desc));
      b.addEventListener('click', () => this.choose(i));
      b.addEventListener('pointerenter', () => this.focus(i, false));
      grid.append(b);
      this.items.push(b);
    });
    const custom = el('button', 'cs-item cs-custom');
    custom.append(el('i', 'gem'), el('b', '', 'Crear el mío'), el('small', '', 'Abre el editor de avatar'));
    custom.addEventListener('click', () => this.choose(PRESETS.length));
    custom.addEventListener('pointerenter', () => this.focus(PRESETS.length, false));
    this.items.push(custom);

    card.append(head, sub, grid, custom, el('p', 'hint2', '← → ↑ ↓ elegir · Enter aceptar'));
    const wrap = el('div', 'cs-wrap');
    wrap.append(card);
    this.root.append(el('div', 'veil'), wrap);
    document.body.append(this.root);
    addEventListener('keydown', (e) => this.key(e));
  }

  /** `closable`: en la primera visita no hay botón de cerrar (hay que elegir). */
  toggle(open = !this.open, closable = true) {
    if (open === this.open) return;
    this.open = open;
    this.root.hidden = !open;
    this.close.hidden = !closable;
    if (open) {
      this.justOpened = true; // la pulsación que abre la pantalla (Enter en el menú) no debe elegir
      setTimeout(() => { this.justOpened = false; }, 0);
      this.focus(this.sel);
      this.thumbs ??= this.drawThumbs().catch((e) => console.warn('selector: sin miniaturas', e));
    }
    this.onToggle(open);
  }

  private choose(i: number) {
    if (i < PRESETS.length) {
      const cfg = structuredClone(PRESETS[i].cfg);
      saveConfig(cfg);
      this.onPick(cfg);
    } else this.onCustom();
    this.toggle(false);
  }

  private focus(i: number, move = true) {
    this.sel = i;
    this.items.forEach((b, k) => b.classList.toggle('sel', k === i));
    if (move) this.items[i].focus({ preventScroll: false });
  }

  /** Columnas reales de la rejilla (4 en escritorio, 2 en móvil). */
  private get cols() {
    const grid = this.items[0].parentElement as HTMLElement;
    return getComputedStyle(grid).gridTemplateColumns.split(' ').length || 2;
  }

  private key(e: KeyboardEvent) {
    if (!this.open || this.justOpened) return;
    const n = PRESETS.length, c = this.cols, k = e.key;
    let i = this.sel;
    if (k === 'ArrowRight') i = Math.min(n, i + 1);
    else if (k === 'ArrowLeft') i = Math.max(0, i - 1);
    else if (k === 'ArrowDown') i = i >= n ? n : Math.min(n, i + c >= n ? n : i + c);
    else if (k === 'ArrowUp') i = i >= n ? n - c : Math.max(0, i - c);
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); this.choose(this.sel); return; }
    else if (k === 'Escape' && !this.close.hidden) { this.toggle(false); return; }
    else return;
    e.preventDefault();
    this.focus(i);
  }

  /** Dibuja las miniaturas con un único avatar de muestra que va cambiando de ropa. */
  private async drawThumbs() {
    const avatar = await Avatar.create();
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x7fb5c0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 5);
    scene.add(sun, avatar.root);
    avatar.root.rotation.y = -0.35; // de tres cuartos
    avatar.root.scale.setScalar(1.7 / 2.19); // misma escala que en el juego (1,70 m)
    const cam = new THREE.PerspectiveCamera(30, TW / TH, 0.1, 20);
    cam.position.set(0, 1.05, 4.3);
    cam.lookAt(0, 0.86, 0);
    // render target en sRGB: el propio hardware convierte el color lineal al escribirlo
    const rt = new THREE.WebGLRenderTarget(TW, TH, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const px = new Uint8Array(TW * TH * 4);
    const clear = new THREE.Color();
    for (let i = 0; i < PRESETS.length; i++) {
      await avatar.apply(PRESETS[i].cfg);
      avatar.update(1 / 60, { speed: 0, swimming: false, t: 0 }); // pose de reposo
      const r = this.renderer, prev = r.getRenderTarget(), alpha = r.getClearAlpha();
      r.getClearColor(clear);
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, TW, TH, px);
      r.setRenderTarget(prev);
      r.setClearColor(clear, alpha);
      // WebGL lee de abajo arriba: se da la vuelta a las filas
      const img = new ImageData(TW, TH);
      for (let y = 0; y < TH; y++) img.data.set(px.subarray((TH - 1 - y) * TW * 4, (TH - y) * TW * 4), y * TW * 4);
      const cv = this.items[i].querySelector('canvas') as HTMLCanvasElement;
      cv.getContext('2d')?.putImageData(img, 0, 0);
      cv.classList.add('on');
      await new Promise((ok) => setTimeout(ok, 0)); // deja respirar al bucle del juego entre miniatura y miniatura
    }
    rt.dispose();
  }
}
