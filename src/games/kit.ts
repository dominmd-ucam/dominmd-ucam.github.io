/** Piezas comunes de los minijuegos de proyectos: creación de nodos, temporizadores que se cancelan al cerrar y marcos (navegador, ventana, móvil). */
export { t } from '../i18n';

type Child = Node | string | null | undefined | false;
/** h('div.clase.otra', { onclick, title }, hijos…): crea un nodo sin innerHTML (seguro con texto del usuario). */
type TagOf<S extends string> = S extends `${infer T}.${string}` ? T : S;
type ElOf<S extends string> = TagOf<S> extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[TagOf<S>] : HTMLElement;
export function h<S extends string>(sel: S, props: Record<string, unknown> | null = null, ...kids: Child[]): ElOf<S> {
  const [tag, ...cls] = sel.split('.');
  const e = document.createElement(tag) as ElOf<S>;
  if (cls.length) e.className = cls.join(' ');
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'style') e.setAttribute('style', String(v));
    else if (k in e && k !== 'list') (e as unknown as Record<string, unknown>)[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) e.append(c);
  if (tag === 'button' && !props?.type) (e as HTMLButtonElement).type = 'button';
  return e;
}

/** Temporizadores y animaciones agrupados: se cancelan todos al cerrar la ficha. */
export class Life {
  private ids = new Set<number>();
  private raf = new Set<number>();
  private offs: (() => void)[] = [];
  alive = true;
  after(ms: number, fn: () => void) { const id = window.setTimeout(() => { this.ids.delete(id); if (this.alive) fn(); }, ms); this.ids.add(id); return id; }
  every(ms: number, fn: () => void) { const id = window.setInterval(() => this.alive && fn(), ms); this.ids.add(id); return id; }
  cancel(id: number) { clearTimeout(id); clearInterval(id); this.ids.delete(id); }
  /** bucle de animación con dt en segundos; se para solo si el nodo sale del documento */
  loop(fn: (dt: number, t: number) => void) {
    let last = performance.now();
    const step = (now: number) => {
      if (!this.alive) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      fn(dt, now / 1000);
      id = requestAnimationFrame(step); this.raf.add(id);
    };
    let id = requestAnimationFrame(step); this.raf.add(id);
  }
  on<E extends Event>(target: EventTarget, type: string, fn: (e: E) => void) { target.addEventListener(type, fn as EventListener); this.offs.push(() => target.removeEventListener(type, fn as EventListener)); }
  wait(ms: number) { return new Promise<void>((r) => this.after(ms, r)); }
  dispose() { this.alive = false; for (const id of this.ids) { clearTimeout(id); clearInterval(id); } for (const id of this.raf) cancelAnimationFrame(id); this.offs.forEach((f) => f()); this.ids.clear(); }
}

/** Ventana de navegador con pestaña, barra de direcciones y botones de recarga. */
export function browser(url: string, title: string, body: HTMLElement, cls = '') {
  const urlBox = h('div.gk-url', null, h('span.gk-lock', { 'aria-hidden': 'true' }, '🔒'), h('span', null, url));
  const root = h(`div.gk.gk-browser.${cls || 'x'}`, null,
    h('div.gk-bar', null, h('span.gk-dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span.gk-tab', null, title), urlBox),
    body);
  return { root, setUrl: (u: string) => { (urlBox.lastChild as HTMLElement).textContent = u; } };
}

/** Ventana de aplicación de escritorio (IDE, cliente de chat…). */
export function appWindow(title: string, body: HTMLElement, cls = '') {
  return h(`div.gk.gk-app.${cls || 'x'}`, null, h('div.gk-bar', null, h('span.gk-dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span.gk-title', null, title)), body);
}

/** Teléfono con barra de estado (la hora es la real). */
export function phone(body: HTMLElement, cls = '', dark = false) {
  const clock = h('b', null, new Date().toTimeString().slice(0, 5));
  const screen = h(`div.gk-screen${dark ? '.dark' : ''}`, null, h('div.gk-status', null, clock, h('span', { 'aria-hidden': 'true' }, '▂▄▆ 🔋')), body);
  return h(`div.gk.gk-phonewrap.${cls || 'x'}`, null, h('div.gk-phone', null, h('div.gk-notch', { 'aria-hidden': 'true' }), screen));
}

/** Aviso breve dentro del minijuego (no usa alert). */
export function toast(host: HTMLElement, text: string, life: Life, kind: 'ok' | 'warn' | 'info' = 'info') {
  let box = host.querySelector<HTMLElement>(':scope > .gk-toasts');
  if (!box) { box = h('div.gk-toasts', { 'aria-live': 'polite' }); host.append(box); }
  const n = h(`div.gk-toast.${kind}`, null, text);
  box.append(n);
  life.after(2600, () => { n.classList.add('out'); life.after(300, () => n.remove()); });
}

/** Lienzo nítido en pantallas de alta densidad; `draw` recibe el contexto ya escalado y el tamaño en px CSS. */
export function crispCanvas(cls = '') {
  const c = h(`canvas.${cls || 'x'}`);
  const ctx = c.getContext('2d')!;
  const fit = () => {
    const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width)), hh = Math.max(1, Math.round(r.height));
    if (c.width !== w * d || c.height !== hh * d) { c.width = w * d; c.height = hh * d; }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { w, h: hh };
  };
  return { c, ctx, fit };
}

export const fmt = (n: number, d = 0) => n.toLocaleString(document.documentElement.lang.startsWith('en') ? 'en-GB' : 'es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
