import type { Project } from './interactables';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const TYPE_LABEL: Record<string, string> = { web: 'Web', bot: 'Bot', plugin: 'Plugin', cli: 'Consola' };

export class UI {
  private modal = $('modal');
  private prompt = $<HTMLButtonElement>('prompt');
  private hint = $('hint');
  onClose: () => void = () => {};
  onPromptClick: () => void = () => {};

  constructor() {
    $('mClose').addEventListener('click', () => this.closeProject());
    this.modal.addEventListener('pointerdown', (e) => { if (e.target === this.modal) this.closeProject(); });
    this.prompt.addEventListener('click', () => this.onPromptClick());
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
