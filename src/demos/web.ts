import type { DemoHandle, WebDemo, WebSection } from './types';
import { el, Timers } from './dom';

/** Navegador simulado con páginas navegables, carrito, estadísticas y gráficos animados. */
export function mountWeb(host: HTMLElement, spec: WebDemo): DemoHandle {
  const timers = new Timers();
  const root = el('div', 'dm dm-browser');
  const bar = el('div', 'br-bar');
  const dots = el('span', 'br-dots');
  dots.append(el('i'), el('i'), el('i'));
  const tabs = el('div', 'br-tabs', '');
  tabs.setAttribute('role', 'tablist');
  const url = el('div', 'br-url');
  const cart = el('span', 'br-cart', `${spec.cartLabel ?? 'Carrito'}: 0`);
  bar.append(dots, tabs, url, cart);
  const page = el('div', 'br-page');
  page.tabIndex = 0;
  root.append(bar, page);
  host.append(root);

  let items = 0;
  let current = 0;

  const section = (s: WebSection): HTMLElement => {
    const box = el('section', `wb wb-${s.kind}`);
    if (s.kind === 'hero') {
      box.append(el('h4', '', s.title), el('p', '', s.text));
      if (s.cta) {
        const b = el('button', 'wb-btn', s.cta);
        b.type = 'button';
        b.addEventListener('click', () => { b.classList.add('pulse'); timers.after(500, () => b.classList.remove('pulse')); });
        box.append(b);
      }
    } else if (s.kind === 'cards') {
      const grid = el('div', 'wb-grid');
      for (const it of s.items) {
        const c = el('article', 'wb-card');
        const img = el('div', 'wb-img'); img.setAttribute('aria-hidden', 'true');
        const add = el('button', 'wb-btn small', 'Añadir');
        add.type = 'button';
        add.addEventListener('click', () => {
          items++;
          cart.textContent = `${spec.cartLabel ?? 'Carrito'}: ${items}`;
          cart.classList.remove('bump'); void cart.offsetWidth; cart.classList.add('bump');
          add.textContent = '✓ Añadido';
        });
        c.append(img, el('h5', '', it.title), el('p', '', it.text), el('div', 'wb-price', it.price), add);
        grid.append(c);
      }
      box.append(grid);
    } else if (s.kind === 'stats') {
      for (const it of s.items) {
        const t = el('div', 'wb-stat');
        t.append(el('b', '', it.value), el('span', '', it.label));
        box.append(t);
      }
    } else if (s.kind === 'chart') {
      box.append(el('h5', '', s.title));
      const bars = el('div', 'wb-bars');
      const max = Math.max(...s.values);
      s.values.forEach((v, i) => {
        const col = el('div', 'wb-col');
        const bar = el('i');
        bar.style.setProperty('--h', `${(v / max) * 100}%`);
        bar.title = `${s.labels[i]}: ${v}`;
        col.append(bar, el('span', '', s.labels[i]));
        bars.append(col);
      });
      box.append(bars);
    } else {
      box.append(el('h5', '', s.title));
      for (const it of s.items) {
        const r = el('div', 'wb-row');
        r.append(el('span', '', it.label), el('b', '', it.value));
        box.append(r);
      }
    }
    return box;
  };

  const show = (i: number) => {
    current = i;
    const p = spec.pages[i];
    url.textContent = `https://${spec.url}/${p.slug}`;
    [...tabs.children].forEach((t, k) => { t.classList.toggle('on', k === i); t.setAttribute('aria-selected', String(k === i)); });
    page.replaceChildren(...p.sections.map(section));
    page.classList.remove('in'); void page.offsetWidth; page.classList.add('in');
    page.scrollTop = 0;
  };

  spec.pages.forEach((p, i) => {
    const t = el('button', '', p.title);
    t.type = 'button';
    t.setAttribute('role', 'tab');
    t.addEventListener('click', () => show(i));
    tabs.append(t);
  });
  show(current);
  return { dispose: () => timers.clear() };
}
