import { h, t, Life, browser, toast } from './kit';
import './atom.css';

/** ATOM Processor: analiza feeds ATOM y RSS de verdad (DOMParser), en tarjetas o lista, con búsqueda y favoritos guardados. */
const day = (d: number) => new Date(Date.now() - d * 864e5).toUTCString();
const iso = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FEEDS: { name: string; xml: string }[] = [
  {
    name: t('Blog de desarrollo (ATOM)', 'Dev blog (ATOM)'),
    xml: `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${t('Diario de un desarrollador', 'A developer\'s diary')}</title>
  <link href="https://blog.example/"/>
${[
    [t('Migrar de REST a eventos sin romper nada', 'Moving from REST to events without breaking things'), t('Una estrategia por fases con colas y doble escritura.', 'A phased strategy with queues and dual writes.'), 1, 'arquitectura'],
    [t('Cinco trucos de XPath que uso a diario', 'Five XPath tricks I use every day'), t('Predicados, ejes y funciones que ahorran código.', 'Predicates, axes and functions that save code.'), 3, 'xml'],
    [t('PWA sin conexión: lo que nadie te cuenta', 'Offline PWAs: what nobody tells you'), t('Service workers, colas de sincronización y conflictos.', 'Service workers, sync queues and conflicts.'), 6, 'web'],
    [t('Medir antes de optimizar', 'Measure before you optimise'), t('Perfiles de rendimiento en el navegador paso a paso.', 'Step-by-step browser performance profiling.'), 9, 'rendimiento'],
    [t('Pruebas de humo con Playwright en CI', 'Smoke tests with Playwright in CI'), t('Que el despliegue no salga si la web no arranca.', 'Don\'t deploy if the site doesn\'t start.'), 14, 'testing'],
  ].map(([ti, su, d, c], i) => `  <entry><title>${esc(String(ti))}</title><link href="https://blog.example/p/${i + 1}"/><id>urn:post:${i + 1}</id><updated>${iso(Number(d))}</updated><author><name>Domingo</name></author><category term="${c}"/><summary>${esc(String(su))}</summary></entry>`).join('\n')}
</feed>`,
  },
  {
    name: t('Noticias de tecnología (RSS 2.0)', 'Tech news (RSS 2.0)'),
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${t('Tecnología Hoy', 'Tech Today')}</title><link>https://noticias.example</link><description>${t('Titulares del día', 'Today\'s headlines')}</description>
${[
    [t('Los navegadores adoptan un nuevo estándar de vista previa', 'Browsers adopt a new preview standard'), 0, t('Web', 'Web')],
    [t('Un microcontrolador de 2 € con Wi-Fi y Bluetooth LE', 'A €2 microcontroller with Wi-Fi and Bluetooth LE'), 1, 'Hardware'],
    [t('Los asistentes de código ya depuran en el IDE', 'Code assistants now debug inside the IDE'), 2, t('IA', 'AI')],
    [t('Guía rápida de feeds: ATOM frente a RSS', 'Quick guide to feeds: ATOM vs RSS'), 4, 'XML'],
    [t('Bases de datos vectoriales en local', 'Local vector databases'), 5, t('IA', 'AI')],
    [t('Tailwind CSS cumple otra versión mayor', 'Tailwind CSS ships another major'), 8, t('Web', 'Web')],
  ].map(([ti, d, c], i) => `  <item><title>${esc(String(ti))}</title><link>https://noticias.example/${i}</link><pubDate>${day(Number(d))}</pubDate><category>${c}</category><description>${t('Resumen de la noticia número', 'Summary of story number')} ${i + 1}.</description></item>`).join('\n')}
</channel></rss>`,
  },
  {
    name: t('XML roto (para ver el error)', 'Broken XML (to see the error)'),
    xml: `<?xml version="1.0"?>\n<rss version="2.0"><channel>\n  <title>Feed roto</title>\n  <item><title>Falta cerrar esta etiqueta</item>\n</channel></rss>`,
  },
];
interface Item { id: string; title: string; link: string; date: Date | null; author: string; cat: string; text: string }
const KEY = 'portfolio-atom-favs';

export function mount(host: HTMLElement) {
  const life = new Life();
  let favs = new Set<string>();
  try { favs = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { /* sin almacenamiento */ }
  let items: Item[] = [], view: 'cards' | 'list' = 'cards', onlyFav = false, q = '';
  const src = h('select', { 'aria-label': t('Fuente', 'Source') }, ...FEEDS.map((f, i) => h('option', { value: String(i) }, f.name)), h('option', { value: 'url' }, t('Desde una URL…', 'From a URL…')));
  const url = h('input', { type: 'text', placeholder: 'https://…/feed.xml', hidden: true, 'aria-label': 'URL' });
  const xml = h('textarea.at-xml', { spellcheck: false, 'aria-label': 'XML' });
  const go = h('button.btn', null, t('Procesar', 'Process'));
  const info = h('div.at-info');
  const search = h('input', { type: 'search', placeholder: t('Buscar…', 'Search…'), 'aria-label': t('Buscar', 'Search') });
  const vBtn = h('button.btn.ghost.sm', null, t('Vista: tarjetas', 'View: cards'));
  const fBtn = h('button.btn.ghost.sm', null, '☆ ' + t('Favoritos', 'Favourites'));
  const list = h('div.at-list.cards');
  const editor = h('details.at-src', null, h('summary', null, t('Ver / editar el XML', 'View / edit the XML')), xml);
  const body = h('div.gk-body.at', null, h('div.at-top', null, h('div.at-row', null, src, url, go), editor, info, h('div.at-row', null, search, vBtn, fBtn)), list);
  const { root } = browser('localhost:8080/atom-processor', 'ATOM Processor', body);
  host.append(root);

  const setSrc = () => {
    const isUrl = src.value === 'url';
    url.hidden = !isUrl;
    if (!isUrl) { xml.value = FEEDS[Number(src.value)].xml; process(); }
  };
  src.addEventListener('change', setSrc);
  search.addEventListener('input', () => { q = search.value.toLowerCase(); render(); });
  vBtn.addEventListener('click', () => { view = view === 'cards' ? 'list' : 'cards'; vBtn.textContent = view === 'cards' ? t('Vista: tarjetas', 'View: cards') : t('Vista: lista', 'View: list'); list.className = 'at-list ' + view; });
  fBtn.addEventListener('click', () => { onlyFav = !onlyFav; fBtn.textContent = (onlyFav ? '★ ' : '☆ ') + t('Favoritos', 'Favourites'); render(); });
  go.addEventListener('click', async () => {
    if (src.value !== 'url') return process();
    go.disabled = true; info.className = 'at-info'; info.textContent = t('Descargando…', 'Downloading…');
    try {
      const r = await fetch(url.value, { mode: 'cors' });
      xml.value = await r.text(); process();
    } catch {
      info.className = 'at-info err';
      info.textContent = t('El navegador no deja leer esa URL desde otra web (CORS). Abre el feed, copia su XML y pégalo en «Ver / editar el XML».', 'The browser won\'t let this page read that URL (CORS). Open the feed, copy its XML and paste it into “View / edit the XML”.');
      editor.open = true;
    } finally { go.disabled = false; }
  });

  function text(n: Element | null | undefined, sel: string) { return n?.getElementsByTagName(sel)[0]?.textContent?.trim() ?? ''; }
  function process() {
    const doc = new DOMParser().parseFromString(xml.value, 'application/xml');
    const err = doc.getElementsByTagName('parsererror')[0];
    if (err) {
      items = []; render();
      info.className = 'at-info err';
      info.textContent = t('XML no válido: ', 'Invalid XML: ') + (err.textContent ?? '').replace(/\s+/g, ' ').replace(/^.*?error[^:]*:\s*/i, '').slice(0, 140);
      return;
    }
    const rootEl = doc.documentElement;
    const atom = rootEl.localName === 'feed';
    if (!atom && rootEl.localName !== 'rss' && rootEl.localName !== 'RDF') { info.className = 'at-info err'; info.textContent = t('No es un feed ATOM ni RSS.', 'Not an ATOM or RSS feed.'); items = []; render(); return; }
    const nodes = [...doc.getElementsByTagName(atom ? 'entry' : 'item')];
    items = nodes.map((n, i) => {
      const link = atom ? (n.getElementsByTagName('link')[0]?.getAttribute('href') ?? '') : text(n, 'link');
      const d = text(n, atom ? 'updated' : 'pubDate') || text(n, 'published');
      return {
        id: (atom ? text(n, 'id') : text(n, 'guid')) || link || String(i), title: text(n, 'title'), link,
        date: d ? new Date(d) : null, author: atom ? text(n.getElementsByTagName('author')[0], 'name') : text(n, 'author'),
        cat: atom ? n.getElementsByTagName('category')[0]?.getAttribute('term') ?? '' : text(n, 'category'),
        text: (atom ? text(n, 'summary') || text(n, 'content') : text(n, 'description')).replace(/<[^>]+>/g, ''),
      };
    });
    const feedTitle = text(rootEl, 'title');
    info.className = 'at-info ok';
    info.textContent = `${atom ? 'ATOM 1.0' : 'RSS ' + (rootEl.getAttribute('version') ?? '')} · «${feedTitle}» · ${items.length} ${t('entradas', 'entries')}`;
    render();
  }
  function render() {
    const fmt = new Intl.DateTimeFormat(document.documentElement.lang || 'es', { day: 'numeric', month: 'short' });
    const shown = items.filter((i) => (!onlyFav || favs.has(i.id)) && (!q || (i.title + i.text + i.cat).toLowerCase().includes(q)));
    list.replaceChildren(...shown.map((it) => {
      const star = h('button.at-star', { 'aria-pressed': String(favs.has(it.id)), title: t('Favorito', 'Favourite') }, favs.has(it.id) ? '★' : '☆');
      star.addEventListener('click', () => {
        favs.has(it.id) ? favs.delete(it.id) : favs.add(it.id);
        try { localStorage.setItem(KEY, JSON.stringify([...favs])); } catch { /* */ }
        toast(root, favs.has(it.id) ? t('Guardado en favoritos (en tu navegador)', 'Saved to favourites (in your browser)') : t('Quitado de favoritos', 'Removed from favourites'), life, 'ok');
        render();
      });
      return h('article.at-item', null, star, h('div.at-meta', null, it.cat && h('span.pill', null, it.cat), it.date && !isNaN(+it.date) ? fmt.format(it.date) : '', it.author && ' · ' + it.author),
        h('h4', null, h('a', { href: it.link, target: '_blank', rel: 'noopener', onclick: (e: Event) => e.preventDefault() }, it.title)), h('p', null, it.text));
    }));
    if (!shown.length) list.append(h('p.muted.at-empty', null, items.length ? t('Nada coincide con el filtro.', 'Nothing matches the filter.') : t('Sin entradas.', 'No entries.')));
  }
  setSrc();
  return () => life.dispose();
}
