import data from '../data/dialogue.json';

interface Choice { label: string; next: string | null; action?: string }
interface Node { text: string; choices: Choice[] }

const PORTRAIT = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <polygon points="0,0 100,0 100,58 0,42" fill="#7fe0d6"/><polygon points="0,42 100,58 100,100 0,100" fill="#1fb5b0"/>
  <polygon points="0,80 100,72 100,100 0,100" fill="#f3d9a4"/><polygon points="0,80 40,76 0,100" fill="#e6c689"/>
  <image class="head" href="${import.meta.env.BASE_URL}models/characters/misu-portrait.webp" x="4" y="8" width="92" height="92"/>
</svg>`; // retrato renderizado del mismo modelo 3D de Misu (scripts/blender/misu.py)

/** Caja de diálogo con retrato, escritura letra a letra y opciones navegables (teclado, ratón y toque). */
export class Dialogue {
  private root = document.getElementById('dialogue') as HTMLElement;
  private textEl!: HTMLElement;
  private choicesEl!: HTMLElement;
  private box!: HTMLElement;
  private portrait!: HTMLElement;
  private sel = 0;
  private node: Node | null = null;
  private typing: number | null = null;
  private full = '';
  private shown = 0;
  /** milisegundos por letra */
  speed = 24;
  open = false;
  private justOpened = false;
  onAction: (action: string) => void = () => {};
  onClose: () => void = () => {};
  onStart: () => void = () => {};

  constructor() {
    this.root.innerHTML = `
      <div class="dl-wrap">
        <span class="name"></span>
        <div class="portrait">${PORTRAIT}</div>
        <div class="dbox facet"><p class="dtext"></p><div class="choices"></div><span class="next"></span></div>
      </div>`;
    this.textEl = this.root.querySelector('.dtext') as HTMLElement;
    this.choicesEl = this.root.querySelector('.choices') as HTMLElement;
    this.box = this.root.querySelector('.dbox') as HTMLElement;
    this.portrait = this.root.querySelector('.portrait') as HTMLElement;
    (this.root.querySelector('.name') as HTMLElement).textContent = data.npc.name;
    this.box.addEventListener('click', () => { if (this.typing !== null) this.finishTyping(); });
    addEventListener('keydown', (e) => this.key(e));
  }

  start() {
    this.open = true;
    this.justOpened = true; // la misma pulsación de E que abre el diálogo no debe saltarse la escritura
    setTimeout(() => { this.justOpened = false; }, 0);
    this.root.hidden = false;
    this.root.classList.remove('closing');
    this.onStart();
    this.go(data.start);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('closing');
    this.stopTyping();
    setTimeout(() => { if (!this.open) this.root.hidden = true; }, 300);
    this.onClose();
  }

  private go(id: string | null) {
    if (id === null) { this.close(); return; }
    const node = (data.nodes as Record<string, Node>)[id];
    this.node = node;
    this.choicesEl.replaceChildren();
    this.box.classList.remove('done');
    this.full = node.text;
    this.shown = 0;
    this.textEl.replaceChildren();
    this.portrait.classList.add('talking');
    this.stopTyping();
    this.typing = window.setInterval(() => {
      this.shown++;
      this.render();
      if (this.shown >= this.full.length) this.finishTyping();
    }, this.speed);
  }

  private render() {
    this.textEl.textContent = this.full.slice(0, this.shown);
  }

  private stopTyping() {
    if (this.typing !== null) { clearInterval(this.typing); this.typing = null; }
  }

  private finishTyping() {
    this.stopTyping();
    this.shown = this.full.length;
    this.render();
    this.portrait.classList.remove('talking');
    this.box.classList.add('done');
    this.sel = 0;
    const items = (this.node?.choices ?? []).map((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.style.setProperty('--i', String(i));
      b.innerHTML = '<i class="gem"></i><span></span>';
      (b.querySelector('span') as HTMLElement).textContent = c.label;
      b.addEventListener('mouseenter', () => { this.sel = i; this.highlight(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); this.pick(i); });
      return b;
    });
    this.choicesEl.replaceChildren(...items);
    this.highlight();
  }

  private highlight() {
    [...this.choicesEl.children].forEach((c, i) => c.classList.toggle('sel', i === this.sel));
  }

  private pick(i: number) {
    const c = this.node?.choices[i];
    if (!c) return;
    if (c.action) this.onAction(c.action);
    this.go(c.next);
  }

  private key(e: KeyboardEvent) {
    if (!this.open || this.justOpened) return;
    const k = e.key.toLowerCase();
    if (this.typing !== null) {
      if (k === 'e' || k === 'enter' || k === ' ') { this.finishTyping(); e.preventDefault(); }
      return;
    }
    const n = this.node?.choices.length ?? 0;
    if (!n) return;
    if (k === 'arrowdown' || k === 's' || k === 'arrowright' || k === 'd') { this.sel = (this.sel + 1) % n; this.highlight(); }
    else if (k === 'arrowup' || k === 'w' || k === 'arrowleft' || k === 'a') { this.sel = (this.sel - 1 + n) % n; this.highlight(); }
    else if (k === 'enter' || k === 'e' || k === ' ') { this.pick(this.sel); e.preventDefault(); }
  }
}
