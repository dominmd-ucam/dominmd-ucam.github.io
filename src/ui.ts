import type { Project } from './interactables';
import type { Preset } from './world/dayCycle';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const TYPE_LABEL: Record<string, string> = { web: 'Web', bot: 'Bot', plugin: 'Plugin', cli: 'Consola' };

export class UI {
  private modal = $('modal');
  private prompt = $<HTMLButtonElement>('prompt');
  private hint = $('hint');
  onClose: () => void = () => {};
  onPromptClick: () => void = () => {};
  onTime: (p: Preset | 'auto') => void = () => {};
  onMute: () => boolean = () => false;
  private clockEl = $('clock');
  private timeBtns = [...document.querySelectorAll<HTMLButtonElement>('#timebar button[data-preset]')];
  private lastClock = '';
  private lastAuto: boolean | null = null;

  constructor() {
    $('mClose').addEventListener('click', () => this.closeProject());
    this.modal.addEventListener('pointerdown', (e) => { if (e.target === this.modal) this.closeProject(); });
    this.prompt.addEventListener('click', () => this.onPromptClick());
    for (const b of this.timeBtns) b.addEventListener('click', () => this.onTime(b.dataset.preset as Preset | 'auto'));
    const mute = $('muteBtn');
    mute.addEventListener('click', () => { mute.textContent = this.onMute() ? '🔇' : '🔊'; });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.modal.hidden) this.closeProject(); });
  }

  ready() {
    $('hud').hidden = false;
    const l = $('loader');
    l.classList.add('done');
    setTimeout(() => l.remove(), 700);
    setTimeout(() => this.hint.classList.add('gone'), 9000);
  }

  setPrompt(p: Project | null) {
    if (!p) { this.prompt.hidden = true; return; }
    this.prompt.hidden = false;
    this.prompt.innerHTML = `<kbd>E</kbd> ${p.title}`;
  }

  setClock(text: string, auto: boolean) {
    if (text !== this.lastClock) { this.clockEl.textContent = text; this.lastClock = text; }
    if (auto !== this.lastAuto) {
      this.lastAuto = auto;
      for (const b of this.timeBtns) if (b.dataset.preset === 'auto') b.classList.toggle('on', auto);
    }
  }

  get isOpen() { return !this.modal.hidden; }

  openProject(p: Project) {
    $('mTag').textContent = TYPE_LABEL[p.type] ?? p.type;
    $('mTag').dataset.type = p.type;
    $('mTitle').textContent = p.title;
    $('mDesc').textContent = p.description;
    $('mDemo').innerHTML = '<span>Demo simulado próximamente</span>';
    const chips = $('mChips'); chips.replaceChildren();
    for (const t of p.tech) { const s = document.createElement('span'); s.textContent = t; chips.append(s); }
    const repo = $<HTMLAnchorElement>('mRepo'); repo.href = p.repo;
    this.modal.hidden = false;
    $('mClose').focus();
  }

  closeProject() {
    if (this.modal.hidden) return;
    this.modal.hidden = true;
    this.onClose();
  }
}
