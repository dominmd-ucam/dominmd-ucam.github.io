import type { Project } from './interactables';
import { ProjectModal } from './ui/projectModal';
import { ICONS } from './ui/icons';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** HUD y aviso de interacción del juego. La ficha de proyecto y su demo se comparten con la versión clásica. */
export class UI {
  private modal = ProjectModal.get();
  private prompt = $<HTMLButtonElement>('prompt');
  private hint = $('hint');
  private counter = $('projN');
  private total = $('projT');
  private muteBtn = $<HTMLButtonElement>('muteBtn');
  onPromptClick: () => void = () => {};
  onMute: () => boolean = () => false;
  onPause: () => void = () => {};
  onAvatar: () => void = () => {};

  constructor() {
    this.prompt.addEventListener('click', () => this.onPromptClick());
    $('pauseBtn').innerHTML = ICONS.pause;
    $('avatarBtn').innerHTML = ICONS.avatar;
    this.setMuted(false);
    $('pauseBtn').addEventListener('click', () => this.onPause());
    $('avatarBtn').addEventListener('click', () => this.onAvatar());
    this.muteBtn.addEventListener('click', () => this.setMuted(this.onMute()));
  }

  set onClose(fn: () => void) { this.modal.onClose = fn; }

  /** Avance real de la carga (0–1) y el texto que se ve debajo de la barra. */
  setLoad(frac: number, text?: string) {
    const bar = document.getElementById('ldBar'), label = document.getElementById('ldText');
    bar?.style.setProperty('--p', String(Math.max(0.05, Math.min(1, frac))));
    bar?.parentElement?.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    if (text && label) label.textContent = text;
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
  setTotal(n: number) { this.total.textContent = String(n); }

  setPrompt(text: string | null) {
    if (!text) { this.prompt.hidden = true; return; }
    this.prompt.hidden = false;
    this.prompt.innerHTML = '<kbd>E</kbd><span></span>';
    (this.prompt.querySelector('span') as HTMLElement).textContent = text;
  }

  get isOpen() { return this.modal.isOpen; }
  openProject(p: Project) { this.modal.open(p); }
  closeProject() { this.modal.close(); }
}
