export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** **negrita** muy básico y seguro (sin innerHTML con texto del usuario). */
export function richText(parent: HTMLElement, text: string) {
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (part.startsWith('**') && part.endsWith('**')) parent.append(el('strong', '', part.slice(2, -2)));
    else if (part) parent.append(document.createTextNode(part));
  });
}

export const time = () => new Date().toTimeString().slice(0, 8);

/** Temporizadores agrupados para cancelarlos todos al cerrar el demo. */
export class Timers {
  private ids = new Set<number>();
  after(ms: number, fn: () => void) {
    const id = window.setTimeout(() => { this.ids.delete(id); fn(); }, ms);
    this.ids.add(id);
    return id;
  }
  every(ms: number, fn: () => void) {
    const id = window.setInterval(fn, ms);
    this.ids.add(id);
    return id;
  }
  clear() { for (const id of this.ids) { clearTimeout(id); clearInterval(id); } this.ids.clear(); }
}
