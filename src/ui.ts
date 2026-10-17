import type { Project } from './interactables';
import { ICONS } from './ui/icons';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const TYPE_LABEL: Record<string, string> = { web: 'Web', bot: 'Bot', plugin: 'Plugin', cli: 'Consola' };

/** HUD, aviso de interacción y ficha de proyecto. El menú, los diálogos y los logros viven en src/ui/. */
export class UI {
  private modal = $('modal');
  private prompt = $<HTMLButtonElement>('prompt');
  private hint = $('hint');
  private counter = $('projN');
  private muteBtn = $<HTMLButtonElement>('muteBtn');
  onClose: () => void = () => {};
  onPromptClick: () => void = () => {};
  onMute: () => boolean = () => false;
  onPause: () => void = () => {};
  onAvatar: () => void = () => {};

  constructor() {
    $('mClose').addEventListener('click', () => this.closeProject());
    this.modal.addEventListener('pointerdown', (e) => { if (e.target === this.modal || (e.target as HTMLElement).classList.contains('m-wrap')) this.closeProject(); });
    this.prompt.addEventListener('click', () => this.onPromptClick());
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.modal.hidden) this.closeProject(); });
    $('pauseBtn').innerHTML = ICONS.pause;
    $('avatarBtn').innerHTML = ICONS.avatar;
    this.setMuted(false);
    $('pauseBtn').addEventListener('click', () => this.onPause());
    $('avatarBtn').addEventListener('click', () => this.onAvatar());
    this.muteBtn.addEventListener('click', () => this.setMuted(this.onMute()));
  }

  ready() {
    $('hud').hidden = false;
    const l = $('loader');
    l.classList.add('done');
    setTimeout(() => l.remove(), 700);
    setTimeout(() => this.hint.classList.add('gone'), 10000);
  }

  setMuted(muted: boolean) { this.muteBtn.innerHTML = muted ? ICONS.muted : ICONS.sound; }
  setCounter(n: number) { this.counter.textContent = String(n); }

  setPrompt(text: string | null) {
    if (!text) { this.prompt.hidden = true; return; }
    this.prompt.hidden = false;
    this.prompt.innerHTML = '<kbd>E</kbd><span></span>';
    (this.prompt.querySelector('span') as HTMLElement).textContent = text;
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
