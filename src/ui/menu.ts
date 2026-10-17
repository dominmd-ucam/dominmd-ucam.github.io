export type Row =
  | { type: 'action'; label: string; run: () => void; warn?: boolean }
  | { type: 'toggle'; label: string; get: () => boolean; set: (v: boolean) => void }
  | { type: 'select'; label: string; options: string[]; get: () => number; set: (i: number) => void }
  | { type: 'bar'; label: string; max: number; get: () => number; set: (n: number) => void }
  | { type: 'info'; label: string; value?: string };

export interface View { title: string; sub: string; rows: Row[]; hint?: string }

/** Menú de pausa con barra de selección que se desliza, filas de valores (◀ ▶), interruptores y submenús. */
export class Menu {
  open = false;
  private root = document.getElementById('pause') as HTMLElement;
  private stack: View[] = [];
  private sel = 0;
  private list!: HTMLElement;
  private hl!: HTMLElement;
  private title!: HTMLElement;
  private sub!: HTMLElement;
  private hint!: HTMLElement;
  private items: HTMLElement[] = [];
  private justOpened = false;
  onClose: () => void = () => {};

  constructor(private mainView: () => View) {
    this.root.innerHTML = `
      <div class="veil"></div>
      <div class="menu-wrap"><div class="menu facet" role="menu">
        <div class="menu-head"><h2></h2><p></p></div>
        <div class="menu-list"><span class="hl"></span><ul></ul></div>
        <p class="hint2"></p>
      </div></div>`;
    this.title = this.root.querySelector('h2') as HTMLElement;
    this.sub = this.root.querySelector('.menu-head p') as HTMLElement;
    this.list = this.root.querySelector('ul') as HTMLElement;
    this.hl = this.root.querySelector('.hl') as HTMLElement;
    this.hint = this.root.querySelector('.hint2') as HTMLElement;
    (this.root.querySelector('.veil') as HTMLElement).addEventListener('pointerdown', () => this.close());
    addEventListener('keydown', (e) => this.key(e));
  }

  show() {
    this.stack = [this.mainView()];
    this.open = true;
    this.justOpened = true; // la pulsación de Esc que abre el menú no debe cerrarlo
    setTimeout(() => { this.justOpened = false; }, 0);
    this.root.hidden = false;
    this.root.classList.remove('closing');
    this.sel = 0;
    this.render();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('closing');
    setTimeout(() => { if (!this.open) this.root.hidden = true; }, 350);
    this.onClose();
  }

  push(view: View) { this.stack.push(view); this.sel = 0; this.render(); }

  back() {
    if (this.stack.length > 1) { this.stack.pop(); this.sel = 0; this.render(); }
    else this.close();
  }

  private get view() { return this.stack[this.stack.length - 1]; }

  private render() {
    const v = this.view;
    this.title.textContent = v.title;
    this.title.classList.remove('pop'); void this.title.offsetWidth; this.title.classList.add('pop');
    this.sub.textContent = v.sub;
    this.hint.textContent = v.hint ?? '↑ ↓ elegir · ← → cambiar · Enter aceptar · Esc volver';
    this.items = v.rows.map((r, i) => {
      const li = document.createElement('li');
      li.className = 'mi' + (r.type === 'action' && r.warn ? ' warn' : '');
      li.style.setProperty('--i', String(i));
      li.innerHTML = '<i class="gem"></i><span class="ml"></span><span class="mv"></span>';
      (li.querySelector('.ml') as HTMLElement).textContent = r.label;
      li.addEventListener('pointerenter', () => { this.sel = i; this.highlight(); });
      li.addEventListener('click', () => this.activate(i));
      return li;
    });
    this.list.replaceChildren(...this.items);
    v.rows.forEach((_, i) => this.renderValue(i));
    this.highlight();
  }

  private renderValue(i: number) {
    const r = this.view.rows[i], mv = this.items[i].querySelector('.mv') as HTMLElement;
    mv.replaceChildren();
    const arrow = (dir: -1 | 1) => {
      const a = document.createElement('i');
      a.className = 'arr ' + (dir < 0 ? 'l' : 'r');
      a.addEventListener('click', (e) => { e.stopPropagation(); this.sel = i; this.adjust(dir); });
      return a;
    };
    if (r.type === 'toggle') {
      const t = document.createElement('span'); t.className = 'tog' + (r.get() ? ' on' : ''); mv.append(t);
    } else if (r.type === 'select') {
      const v = document.createElement('span'); v.className = 'val'; v.textContent = r.options[r.get()];
      mv.append(arrow(-1), v, arrow(1));
    } else if (r.type === 'bar') {
      const w = document.createElement('span'); w.className = 'waves';
      for (let k = 0; k < r.max; k++) { const b = document.createElement('i'); b.style.height = `${35 + (k / (r.max - 1)) * 65}%`; if (k < r.get()) b.className = 'on'; w.append(b); }
      mv.append(arrow(-1), w, arrow(1));
    } else if (r.type === 'info' && r.value) {
      const v = document.createElement('span'); v.className = 'val'; v.textContent = r.value; mv.append(v);
    }
  }

  private highlight() {
    this.items.forEach((li, i) => li.classList.toggle('sel', i === this.sel));
    const li = this.items[this.sel];
    if (!li) return;
    this.hl.style.setProperty('--y', `${li.offsetTop}px`);
    this.hl.style.setProperty('--h', `${li.offsetHeight}px`);
  }

  private move(d: number) {
    const n = this.items.length;
    this.sel = (this.sel + d + n) % n;
    this.highlight();
  }

  private adjust(dir: -1 | 1) {
    const r = this.view.rows[this.sel];
    if (r.type === 'toggle') r.set(!r.get());
    else if (r.type === 'select') r.set((r.get() + dir + r.options.length) % r.options.length);
    else if (r.type === 'bar') r.set(Math.max(0, Math.min(r.max, r.get() + dir)));
    else return;
    this.renderValue(this.sel);
  }

  private activate(i: number) {
    this.sel = i;
    const r = this.view.rows[i];
    if (r.type === 'action') r.run();
    else this.adjust(1);
  }

  /** Para volver a pintar valores tras un cambio externo. */
  refresh() { if (this.open) this.view.rows.forEach((_, i) => this.renderValue(i)); }

  private key(e: KeyboardEvent) {
    if (!this.open || this.justOpened) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 's') { this.move(1); e.preventDefault(); }
    else if (k === 'arrowup' || k === 'w') { this.move(-1); e.preventDefault(); }
    else if (k === 'arrowleft' || k === 'a') this.adjust(-1);
    else if (k === 'arrowright' || k === 'd') this.adjust(1);
    else if (k === 'enter' || k === ' ') { this.activate(this.sel); e.preventDefault(); }
    else if (k === 'escape') this.back();
  }
}
