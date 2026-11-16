import { h, t, Life, browser, toast } from './kit';
import './webscraping.css';

/** WebScraping: XPath de verdad (document.evaluate) sobre páginas de ejemplo, con la página a la vista y los nodos resaltados. */
interface Sample { url: string; html: string; tries: { label: string; xp: string }[] }
const css = `body{font:14px system-ui,sans-serif;margin:0;padding:14px;color:#222;background:#fafafa}h1{font-size:20px;margin:0 0 10px}
.p,.post,tr{transition:background .2s}.hl{outline:2px solid #f59e0b;background:#fff4d6!important}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.p{background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px}.p h3{font-size:14px;margin:0 0 4px}.price{color:#0a7d38;font-weight:700}.old{text-decoration:line-through;color:#999;font-size:12px}
.post{border-bottom:1px solid #ddd;padding:8px 0}.post a{color:#1d4ed8}.meta{font-size:12px;color:#777}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:5px;text-align:left}`;
const SAMPLES: Sample[] = [
  {
    url: 'https://tienda-ejemplo.test/ofertas',
    html: `<h1>${t('Ofertas de la semana', 'Deals of the week')}</h1><div class="grid">${[
      ['Teclado mecánico TKL', 'Mechanical TKL keyboard', '49,90 €', '69,90 €', 'teclado'], ['Ratón inalámbrico', 'Wireless mouse', '19,50 €', '24,99 €', 'raton'],
      ['Monitor 27" QHD', '27" QHD monitor', '229,00 €', '279,00 €', 'monitor'], ['Auriculares ANC', 'ANC headphones', '89,00 €', '129,00 €', 'auriculares'],
      ['Webcam 1080p', '1080p webcam', '34,90 €', '', 'webcam'], ['Hub USB-C 7 en 1', '7-in-1 USB-C hub', '27,99 €', '39,99 €', 'hub'],
    ].map(([es, en, p, o, s]) => `<div class="p" data-sku="${s}"><h3>${t(es, en)}</h3><span class="price">${p}</span> ${o ? `<span class="old">${o}</span>` : ''}<br><a href="/producto/${s}">${t('Ver', 'View')}</a></div>`).join('')}</div>`,
    tries: [
      { label: t('Nombres', 'Names'), xp: "//div[@class='p']/h3" },
      { label: t('Precios', 'Prices'), xp: "//span[@class='price']" },
      { label: t('Enlaces', 'Links'), xp: '//div[@class="p"]/a/@href' },
      { label: t('Con descuento', 'Discounted'), xp: "//div[span[@class='old']]/h3" },
      { label: 'SKU', xp: '//div/@data-sku' },
    ],
  },
  {
    url: 'https://blog.example/noticias',
    html: `<h1>${t('Últimas noticias', 'Latest news')}</h1>${[
      ['Lanzamos la versión 2.0', 'Version 2.0 is out', 'Ana', '12/11/2026'], ['Cómo usar XPath sin morir en el intento', 'XPath without tears', 'Luis', '05/11/2026'],
      ['Novedades de seguridad', 'Security updates', 'Ana', '28/10/2026'], ['Entrevista al equipo', 'Meet the team', 'Marta', '15/10/2026'],
    ].map(([es, en, a, d], i) => `<article class="post"><a href="/post/${i + 1}">${t(es, en)}</a><div class="meta">${t('por', 'by')} <b class="author">${a}</b> · <time>${d}</time></div></article>`).join('')}`,
    tries: [
      { label: t('Titulares', 'Headlines'), xp: '//article/a' },
      { label: t('Autores', 'Authors'), xp: "//b[@class='author']" },
      { label: t('De Ana', 'By Ana'), xp: "//article[.//b='Ana']/a" },
      { label: t('Fechas', 'Dates'), xp: '//time/text()' },
    ],
  },
  {
    url: 'https://liga.example/clasificacion',
    html: `<h1>${t('Clasificación', 'Standings')}</h1><table><tr><th>#</th><th>${t('Equipo', 'Team')}</th><th>PJ</th><th>${t('Pts', 'Pts')}</th></tr>${[
      ['Atlético Costa', 12, 28], ['Real Meseta', 12, 26], ['CD Bahía', 12, 21], ['UD Pinar', 12, 17], ['Club Faro', 12, 12],
    ].map(([n, pj, p], i) => `<tr><td>${i + 1}</td><td>${n}</td><td>${pj}</td><td>${p}</td></tr>`).join('')}</table>`,
    tries: [
      { label: t('Equipos', 'Teams'), xp: '//tr/td[2]' },
      { label: t('Puntos', 'Points'), xp: '//tr/td[4]' },
      { label: t('Más de 20 pts', 'Over 20 pts'), xp: '//tr[td[4] > 20]/td[2]' },
      { label: t('Nº de equipos', 'Team count'), xp: 'count(//tr[td])' },
    ],
  },
];

export function mount(host: HTMLElement) {
  const life = new Life();
  let sample = SAMPLES[0];
  const frame = h('iframe.ws-frame', { title: t('Página descargada', 'Downloaded page'), sandbox: 'allow-same-origin' }) as HTMLIFrameElement;
  const urlSel = h('select.ws-url', { 'aria-label': 'URL' }, ...SAMPLES.map((s, i) => h('option', { value: String(i) }, s.url)));
  const xpIn = h('input.ws-xp', { type: 'text', spellcheck: false, value: sample.tries[0].xp, 'aria-label': 'XPath' });
  const chips = h('div.ws-chips');
  const status = h('div.ws-status.muted', null, t('Elige una URL, escribe una expresión XPath y pulsa Extraer.', 'Pick a URL, type an XPath expression and press Extract.'));
  const out = h('div.ws-out.gk-scroll');
  const csvBtn = h('button.btn.ghost.sm', { disabled: true }, t('Exportar CSV', 'Export CSV'));
  let rows: string[] = [];
  const run = h('button.btn', { type: 'submit' }, t('Extraer', 'Extract'));
  const form = h('form.ws-form', { onsubmit: (e: Event) => { e.preventDefault(); extract(); } },
    h('label', null, h('span', null, 'URL'), urlSel),
    h('label', null, h('span', null, 'XPath'), xpIn), h('div.ws-actions', null, run, csvBtn), chips);
  const tabs = h('div.ws-tabs', null);
  const panel = h('div.ws-panel', null, form, status, out);
  const view = h('div.ws-view', null, frame);
  const body = h('div.gk-body.ws', null, panel, view);
  const tabBtn = (label: string, show: 'panel' | 'view') => h('button', { onclick: () => { body.dataset.show = show; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === label)); } }, label);
  tabs.append(tabBtn(t('Extractor', 'Extractor'), 'panel'), tabBtn(t('Página', 'Page'), 'view'));
  (tabs.firstChild as HTMLElement).classList.add('on');
  body.dataset.show = 'panel';
  const { root, setUrl } = browser('localhost:5173/scraper', 'WebScraping · XPath', h('div.ws-wrap', null, tabs, body));
  host.append(root);

  const load = () => {
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>${css}</style><body>${sample.html}</body>`;
    chips.replaceChildren(h('span.muted', null, t('Prueba:', 'Try:')), ...sample.tries.map((tr) => h('button.ws-chip', { title: tr.xp, onclick: () => { xpIn.value = tr.xp; extract(); } }, tr.label)));
    setUrl('localhost:5173/scraper?url=' + encodeURIComponent(sample.url));
  };
  urlSel.addEventListener('change', () => { sample = SAMPLES[Number(urlSel.value)]; xpIn.value = sample.tries[0].xp; out.replaceChildren(); rows = []; csvBtn.disabled = true; load(); });
  load();

  function extract() {
    const doc = frame.contentDocument;
    if (!doc?.body) { life.after(150, extract); return; }
    doc.querySelectorAll('.hl').forEach((n) => n.classList.remove('hl'));
    status.className = 'ws-status';
    run.disabled = true; run.textContent = t('Descargando…', 'Fetching…');
    life.after(380, () => {
      run.disabled = false; run.textContent = t('Extraer', 'Extract');
      const t0 = performance.now();
      let res: XPathResult;
      try { res = doc.evaluate(xpIn.value, doc, null, XPathResult.ANY_TYPE, null); } catch (e) {
        status.className = 'ws-status err';
        status.textContent = t('Expresión XPath no válida: ', 'Invalid XPath expression: ') + (e as Error).message.split('\n')[0].slice(0, 120);
        out.replaceChildren(); rows = []; csvBtn.disabled = true; return;
      }
      const ms = (performance.now() - t0).toFixed(1);
      if (res.resultType === XPathResult.NUMBER_TYPE || res.resultType === XPathResult.STRING_TYPE || res.resultType === XPathResult.BOOLEAN_TYPE) {
        const v = res.resultType === XPathResult.NUMBER_TYPE ? String(res.numberValue) : res.resultType === XPathResult.STRING_TYPE ? res.stringValue : String(res.booleanValue);
        rows = [v];
        status.textContent = t(`Resultado escalar en ${ms} ms`, `Scalar result in ${ms} ms`);
        out.replaceChildren(h('div.ws-scalar', null, v)); csvBtn.disabled = false; return;
      }
      const nodes: Node[] = [];
      for (let n = res.iterateNext(); n; n = res.iterateNext()) nodes.push(n);
      rows = nodes.map((n) => (n.textContent ?? '').trim().replace(/\s+/g, ' '));
      for (const n of nodes) {
        const elx = n.nodeType === 1 ? n as Element : n.nodeType === 2 ? (n as Attr).ownerElement : n.parentElement;
        elx?.classList.add('hl');
      }
      (nodes[0]?.nodeType === 1 ? nodes[0] as Element : null)?.scrollIntoView?.({ block: 'nearest' });
      status.textContent = nodes.length
        ? t(`${nodes.length} nodos encontrados en ${ms} ms (resaltados en la página)`, `${nodes.length} nodes found in ${ms} ms (highlighted on the page)`)
        : t('La expresión es válida pero no encuentra nada.', 'The expression is valid but matches nothing.');
      out.replaceChildren(h('table', null, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, t('Tipo', 'Type')), h('th', null, t('Valor', 'Value')))),
        h('tbody', null, ...nodes.map((n, i) => h('tr', null, h('td', null, String(i + 1)), h('td.muted', null, n.nodeType === 2 ? '@' + n.nodeName : n.nodeType === 3 ? 'text()' : '<' + n.nodeName.toLowerCase() + '>'), h('td', null, rows[i]))))));
      csvBtn.disabled = !nodes.length;
    });
  }
  csvBtn.addEventListener('click', () => {
    const csv = 'valor\n' + rows.map((r) => `"${r.replace(/"/g, '""')}"`).join('\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'resultados.csv' });
    a.click(); life.after(1000, () => URL.revokeObjectURL(a.href));
    toast(root, t('CSV descargado', 'CSV downloaded'), life, 'ok');
  });
  frame.addEventListener('load', () => extract(), { once: true });
  return () => life.dispose();
}
