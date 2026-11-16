import { lang, tr } from './index';

const ATTRS = ['aria-label', 'title', 'placeholder'];

function translateNode(n: Node) {
  if (n.nodeType === Node.TEXT_NODE) {
    const s = n.nodeValue ?? '';
    const core = s.trim();
    if (!core) return;
    const out = tr(core);
    if (out !== core) n.nodeValue = s.replace(core, out);
    return;
  }
  if (!(n instanceof Element) || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'CANVAS') return;
  for (const a of ATTRS) {
    const v = n.getAttribute(a);
    if (v) { const out = tr(v); if (out !== v) n.setAttribute(a, out); }
  }
  for (const c of n.childNodes) translateNode(c);
}

/**
 * En la versión inglesa traduce los textos que el juego y la interfaz escriben en el DOM (menús, avisos, paneles…)
 * con el diccionario de en/ui.json. Así los módulos del juego no necesitan saber nada de idiomas.
 */
export function autoTranslateDom(root: HTMLElement = document.body) {
  if (lang !== 'en') return;
  translateNode(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode);
      else translateNode(m.target);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
