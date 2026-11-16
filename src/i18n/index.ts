/**
 * Idiomas de la web: español (index.html) e inglés (en.html). Cómo añadir textos nuevos en src/i18n/README.md.
 *  - t('Hola', 'Hello'): para código nuevo, los dos idiomas juntos en la misma línea.
 *  - tr('Ajustes'): traduce un texto español ya existente con el diccionario de en/ui.json (si no está, lo deja igual).
 *  - Los JSON de src/data se traducen con en/content.json, que solo lleva los campos traducidos.
 */
import { deepMerge } from './merge.mjs';

export type Lang = 'es' | 'en';
export const lang: Lang = document.documentElement.lang.startsWith('en') ? 'en' : 'es';
const KEY = 'portfolio-lang-v1';

export const t = (es: string, en: string) => (lang === 'en' ? en : es);

// los diccionarios solo se descargan en la versión inglesa (la española no paga esos bytes)
let dict: Record<string, string> = {};
let content: Record<string, unknown> = {};
export const i18nReady: Promise<void> = lang === 'en'
  ? Promise.all([import('./en/ui.json'), import('./en/content.json')]).then(([u, c]) => {
    dict = u.default as Record<string, string>;
    content = c.default as Record<string, unknown>;
  })
  : Promise.resolve();

export function tr(es: string): string {
  if (lang === 'es' || !es) return es;
  const hit = dict[es];
  if (hit !== undefined) return hit;
  // "✓ Primeros pasos", "· Logro": traduce lo que va detrás de los símbolos del principio
  const m = /^([^\p{L}¿¡]+)(.+)$/u.exec(es);
  return m && dict[m[2]] !== undefined ? m[1] + dict[m[2]] : es;
}

/** Traduce en el sitio los JSON de datos ya importados: todos los módulos que los usan ven la versión inglesa. Llamar tras i18nReady. */
export function translateData(data: { profile?: object; projects?: object; dialogue?: object }) {
  if (lang !== 'en') return;
  const c = content;
  if (data.profile) deepMerge(data.profile, c.profile);
  if (data.dialogue) deepMerge(data.dialogue, c.dialogue);
  if (Array.isArray(data.projects)) {
    const byId = (c.projects ?? {}) as Record<string, object>;
    for (const p of data.projects as { id: string }[]) if (byId[p.id]) deepMerge(p, byId[p.id]);
  }
}

export function storedLang(): Lang | null {
  try { const v = localStorage.getItem(KEY); return v === 'es' || v === 'en' ? v : null; } catch { return null; }
}
export function rememberLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* sin almacenamiento */ }
}
/** Dirección de la otra versión, conservando ?modo=3d y el ancla. */
export function langUrl(l: Lang): string {
  const u = new URL(l === 'en' ? 'en.html' : './', location.href);
  u.search = location.search; u.hash = location.hash;
  return u.toString();
}
