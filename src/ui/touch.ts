import { t } from '../i18n';

/** Pantalla táctil como puntero principal: ahí no hay teclado, así que las pistas de teclas no sirven. */
export const isTouch = matchMedia('(pointer: coarse)').matches;

const KEY = 'portfolio-touch-tips-v1';
const seen = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { return []; } };

/**
 * Pistas de una sola vez para los gestos que el joystick no explica solo: el esprint (arrastrar el stick bastante más
 * lejos) y la voltereta (agacharse esprintando). Solo en táctil, nunca con un menú o ficha abiertos, y no se repiten.
 */
export class TouchTips {
  private el = document.createElement('div');
  private done = new Set(seen());
  private walkT = 0;
  private hideT = 0;
  private timer: number | undefined;

  constructor() {
    this.el.id = 'tip';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    document.getElementById('hud')?.append(this.el);
  }

  /** Llamar cada fotograma. `moving` = el stick mueve al personaje; `sprinting` = va esprintando; `blocked` = hay UI encima. */
  update(dt: number, moving: boolean, sprinting: boolean, blocked: boolean) {
    if (!isTouch || (this.done.has('sprint') && this.done.has('roll'))) return;
    if (sprinting) {
      this.walkT = 0;
      // quien ya esprinta no necesita la pista del esprint; sí la de la voltereta
      if (!this.done.has('sprint')) this.mark('sprint');
      if (!blocked && !this.done.has('roll')) this.show('roll', t('Toca ⌄ mientras esprintas para dar una voltereta', 'Tap ⌄ while sprinting to do a roll'));
    } else if (moving && !blocked) {
      this.walkT += dt;
      if (this.walkT > 5 && !this.done.has('sprint') && this.el.hidden) this.show('sprint', t('Arrastra el stick más lejos para esprintar', 'Drag the stick further to sprint'));
    }
    if (blocked && !this.el.hidden && !this.el.classList.contains('out')) this.hide();
  }

  private mark(id: string) {
    this.done.add(id);
    try { localStorage.setItem(KEY, JSON.stringify([...this.done])); } catch { /* sin almacenamiento */ }
  }

  private show(id: string, text: string) {
    if (!this.el.hidden && this.el.dataset.id === id) return;
    this.mark(id);
    window.clearTimeout(this.hideT);
    this.el.classList.remove('out');
    this.el.dataset.id = id;
    this.el.textContent = text;
    this.el.hidden = false;
    this.el.classList.remove('out'); void this.el.offsetWidth; // reinicia la animación de entrada
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), 4500);
  }

  private hide() {
    clearTimeout(this.timer);
    this.el.classList.add('out');
    window.clearTimeout(this.hideT);
    this.hideT = window.setTimeout(() => { this.el.hidden = true; }, 300);
  }
}
