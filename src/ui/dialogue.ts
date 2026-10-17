import data from '../data/dialogue.json';

interface Choice { label: string; next: string | null; action?: string }
interface Node { text: string; choices: Choice[] }

const PORTRAIT = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <polygon points="0,0 100,0 100,58 0,42" fill="#7fe0d6"/><polygon points="0,42 100,58 100,100 0,100" fill="#1fb5b0"/>
  <polygon points="0,80 100,72 100,100 0,100" fill="#f3d9a4"/><polygon points="0,80 40,76 0,100" fill="#e6c689"/>
  <g class="head">
    <polygon points="22,18 38,34 62,34 78,18 86,52 50,86 14,52" fill="#2d3748"/>
    <polygon points="22,18 38,34 26,40" fill="#ff9ac1"/><polygon points="78,18 62,34 74,40" fill="#ff9ac1"/>
    <polygon points="14,52 30,50 50,86" fill="#232c3a"/><polygon points="86,52 70,50 50,86" fill="#3a465c"/>
    <polygon points="50,60 62,60 50,74 38,60" fill="#fbf7ee" opacity=".9"/>
    <g class="eyes"><polygon points="30,46 42,48 36,56" fill="#ffc857"/><polygon points="70,46 58,48 64,56" fill="#ffc857"/>
    <polygon points="34,48 38,49 36,54" fill="#0f3440"/><polygon points="66,48 62,49 64,54" fill="#0f3440"/></g>
    <polygon points="46,62 54,62 50,68" fill="#ff9ac1"/>
    <polyline points="40,70 50,76 60,70" fill="none" stroke="#fbf7ee" stroke-width="2" stroke-linejoin="round"/>
    <path d="M14,60 L34,64 M14,70 L34,68 M86,60 L66,64 M86,70 L66,68" fill="none" stroke="#fbf7ee" stroke-width="1.6"/>
  </g></svg>`;

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
