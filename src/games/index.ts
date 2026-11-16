import './games.css';
import { h } from './kit';

/**
 * Minijuegos de los proyectos: uno por proyecto (por `id` de projects.json), cada uno en su módulo y cargado al abrir la ficha.
 * Cada módulo exporta `mount(host)` y devuelve la función que lo limpia al cerrar.
 */
export type Mount = (host: HTMLElement) => () => void;
const GAMES: Record<string, () => Promise<{ mount: Mount }>> = {
  clawdmeter: () => import('./clawdmeter'),
  studens: () => import('./studens'),
  'vs-immediate': () => import('./vs-immediate'),
  'auto-match': () => import('./auto-match'),
  elsaview: () => import('./elsaview'),
  ganaderia: () => import('./ganaderia'),
  mantenimiento: () => import('./mantenimiento'),
  fitpro: () => import('./fitpro'),
  hosteleria: () => import('./hosteleria'),
  webscraping: () => import('./webscraping'),
  atom: () => import('./atom'),
  pixelart: () => import('./pixelart'),
  'obsidian-rag': () => import('./obsidian-rag'),
  streambot: () => import('./streambot'),
};

export const hasGame = (id: string) => id in GAMES;

/** Monta el minijuego de `id` en `host`. Devuelve la función de limpieza (vale llamarla antes de que termine de cargar). */
export function mountGame(host: HTMLElement, id: string): () => void {
  let dispose: (() => void) | null = null, closed = false;
  host.replaceChildren(h('div.gk-loading', null, '…'));
  GAMES[id]?.().then((m) => {
    if (closed) return;
    host.replaceChildren();
    dispose = m.mount(host);
  }).catch((e) => { console.warn('minijuego no disponible', e); host.replaceChildren(); });
  return () => { closed = true; dispose?.(); };
}
