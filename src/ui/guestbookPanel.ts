import { mountContact, mountGuestbook } from '../net/forms';

/** Panel del juego con el libro de visitas y el formulario de contacto (mismos formularios que la versión clásica). */
export class GuestbookPanel {
  private root = document.getElementById('gbPanel') as HTMLElement;
  private body: HTMLElement;
  private tabs: HTMLButtonElement[];
  onClose: () => void = () => {};

  constructor() {
    this.root.innerHTML = `
      <div class="gb-wrap"><div class="gb-card facet" role="dialog" aria-modal="true" aria-labelledby="gbTitle">
        <button class="gb-close" aria-label="Cerrar">✕</button>
        <h2 id="gbTitle">Libro de visitas</h2>
        <div class="gb-tabs"><button type="button" data-tab="book" class="on">Libro de visitas</button><button type="button" data-tab="contact">Escríbeme</button></div>
        <div class="gb-body"></div>
      </div></div>`;
    this.body = this.root.querySelector('.gb-body') as HTMLElement;
    this.tabs = [...this.root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
    this.tabs.forEach((b) => b.addEventListener('click', () => this.render(b.dataset.tab as 'book' | 'contact')));
    (this.root.querySelector('.gb-close') as HTMLElement).addEventListener('click', () => this.close());
    this.root.addEventListener('pointerdown', (e) => { const t = e.target as HTMLElement; if (t === this.root || t.classList.contains('gb-wrap')) this.close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.open) setTimeout(() => this.close(), 0); });
  }

  get open() { return !this.root.hidden; }

  private render(tab: 'book' | 'contact') {
    this.tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    (this.root.querySelector('#gbTitle') as HTMLElement).textContent = tab === 'book' ? 'Libro de visitas' : 'Escríbeme';
    if (tab === 'book') mountGuestbook(this.body); else mountContact(this.body);
  }

  openPanel(tab: 'book' | 'contact' = 'book') {
    this.root.hidden = false;
    this.render(tab);
    (this.root.querySelector('.gb-close') as HTMLElement).focus();
  }

  close() {
    if (!this.open) return;
    this.root.hidden = true;
    this.body.replaceChildren();
    this.onClose();
  }
}
