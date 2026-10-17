import { CATEGORIES, defaultConfig, randomConfig, saveConfig, type AvatarConfig } from './config';
import type { Avatar } from './avatar';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** Panel lateral para personalizar el avatar. El mundo sigue visible y la cámara se pone delante del personaje. */
export class AvatarUI {
  open = false;
  onToggle: (open: boolean) => void = () => {};
  private panel = document.getElementById('avatarPanel') as HTMLElement;
  private cfg: AvatarConfig;
  private current = CATEGORIES[0].name;
  private tabs = el('div', 'av-tabs');
  private grid = el('div', 'av-grid');
  private swatches = el('div', 'av-swatches');
  private status = el('span', 'av-status');
  private busy = 0;

  constructor(private avatar: Avatar) {
    this.cfg = avatar.getConfig();
    const head = el('div', 'av-head');
    head.append(el('h3', '', 'Tu avatar'), this.status);
    const close = el('button', 'av-close', '✕');
    close.setAttribute('aria-label', 'Cerrar');
    close.addEventListener('click', () => this.toggle(false));
    head.append(close);

    const foot = el('div', 'av-foot');
    const rnd = el('button', '', '🎲 Aleatorio');
    rnd.addEventListener('click', () => void this.set(randomConfig()));
    const rst = el('button', '', 'Restablecer');
    rst.addEventListener('click', () => void this.set(defaultConfig()));
    foot.append(rnd, rst);

    const credit = el('p', 'av-credit');
    credit.innerHTML = 'Sistema y modelos del avatar: <a href="https://github.com/wass08/r3f-ultimate-character-configurator" target="_blank" rel="noopener">Wawa Sensei</a>';
    this.panel.append(head, this.tabs, this.grid, this.swatches, foot, credit);
    this.renderTabs();
    this.renderGrid();
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.open) this.toggle(false); });
  }

  toggle(open = !this.open) {
    this.open = open;
    this.panel.hidden = !open;
    this.onToggle(open);
  }

  private async set(cfg: AvatarConfig) {
    this.cfg = cfg;
    saveConfig(cfg);
    this.renderGrid();
    this.busy++;
    this.status.textContent = 'cargando…';
    await this.avatar.apply(cfg);
    if (--this.busy === 0) this.status.textContent = '';
  }

  private renderTabs() {
    this.tabs.replaceChildren(...CATEGORIES.map((c) => {
      const b = el('button', c.name === this.current ? 'on' : '', c.label);
      b.addEventListener('click', () => { this.current = c.name; this.renderTabs(); this.renderGrid(); });
      return b;
    }));
  }

  private renderGrid() {
    const c = CATEGORIES.find((x) => x.name === this.current)!;
    const items: HTMLElement[] = [];
    if (c.removable) {
      const none = el('button', this.cfg.parts[c.name] == null ? 'on' : '', 'Ninguno');
      none.addEventListener('click', () => void this.set({ ...this.cfg, parts: { ...this.cfg.parts, [c.name]: null } }));
      items.push(none);
    }
    c.files.forEach((_, i) => {
      const b = el('button', this.cfg.parts[c.name] === i ? 'on' : '', String(i + 1));
      b.addEventListener('click', () => void this.set({ ...this.cfg, parts: { ...this.cfg.parts, [c.name]: i } }));
      items.push(b);
    });
    this.grid.replaceChildren(...items);

    this.swatches.replaceChildren(...(c.colors ?? []).map((hex) => {
      const s = el('button', this.cfg.colors[c.name] === hex ? 'sw on' : 'sw');
      s.style.background = hex;
      s.setAttribute('aria-label', hex);
      s.addEventListener('click', () => void this.set({ ...this.cfg, colors: { ...this.cfg.colors, [c.name]: hex } }));
      return s;
    }));
    this.swatches.hidden = !c.colors;
  }
}
