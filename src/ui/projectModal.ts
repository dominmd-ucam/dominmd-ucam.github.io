import { mountGame, hasGame } from '../games';
import { t } from '../i18n';

export interface ProjectLike {
  id: string;
  type: string;
  title: string;
  description: string;
  tech: string[];
  repo: string | null;
  credit?: string;
  note?: string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TYPE_LABEL: Record<string, string> = { web: 'Web', bot: 'Bot', plugin: 'Plugin', cli: 'Consola', mobile: 'Móvil', device: 'Dispositivo' };

/** Ficha de proyecto con su demo interactivo (src/games). La usan la versión clásica y el juego. */
export class ProjectModal {
  private root = $('modal');
  private dispose: (() => void) | null = null;
  private returnFocus: HTMLElement | null = null;
  onClose: () => void = () => {};
  private static inst: ProjectModal | null = null;
  /** una sola ficha para toda la página (clásica y juego comparten el mismo HTML) */
  static get() { return (this.inst ??= new ProjectModal()); }

  private constructor() {
    $('mClose').addEventListener('click', () => this.close());
    this.root.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.root || t.classList.contains('m-wrap')) this.close();
    });
    // con setTimeout, el resto de manejadores de Esc (el menú del juego) aún ven la ficha abierta en este mismo evento
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) setTimeout(() => this.close(), 0); });
  }

  get isOpen() { return !this.root.hidden; }

  open(p: ProjectLike) {
    this.returnFocus = document.activeElement as HTMLElement | null;
    $('mTag').textContent = TYPE_LABEL[p.type] ?? p.type;
    $('mTag').dataset.type = p.type;
    $('mTitle').textContent = p.title;
    $('mDesc').textContent = p.description;
    const chips = $('mChips');
    chips.replaceChildren(...p.tech.map((t) => { const s = document.createElement('span'); s.textContent = t; return s; }));
    const repo = $('mRepo') as HTMLAnchorElement;
    if (p.repo) { repo.href = p.repo; repo.textContent = 'Ver código en GitHub'; repo.hidden = false; } else repo.hidden = true;
    const notes = [p.credit, p.note].filter(Boolean).join(' ');
    $('mNote').textContent = notes || (p.repo ? '' : 'Repositorio privado.');
    $('mNote').hidden = !$('mNote').textContent;
    this.dispose?.();
    const host = $('mDemo');
    host.classList.toggle('empty', !hasGame(p.id));
    if (hasGame(p.id)) this.dispose = mountGame(host, p.id);
    else { this.dispose = null; host.textContent = t('Demo próximamente', 'Demo coming soon'); }
    this.root.hidden = false;
    $('mClose').focus();
  }

  close() {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.dispose?.();
    this.dispose = null;
    $('mDemo').replaceChildren();
    this.returnFocus?.focus();
    this.onClose();
  }
}
