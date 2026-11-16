import { h, t, Life, browser, toast } from './kit';
import './auto-match.css';

/**
 * Auto Match All Channels: la lista de canales de Dispatcharr sin guía (EPG) y el plugin que los recorre uno a uno con la misma función
 * del botón individual. El emparejamiento es real: normaliza nombres (quita calidad, país, corchetes) y compara por bigramas (Dice).
 */
const CH: [string, string][] = [
  ['ES: La 1 HD', 'España'], ['ES: La 2', 'España'], ['ES: Antena 3 FHD', 'España'], ['ES: Cuatro HD', 'España'], ['ES: Telecinco [HD]', 'España'], ['ES: laSexta', 'España'],
  ['M+ LaLiga FHD', 'Deportes'], ['M+ Liga de Campeones 1', 'Deportes'], ['DAZN 1 [ES]', 'Deportes'], ['Eurosport 1 HD', 'Deportes'], ['Teledeporte', 'Deportes'], ['GOL PLAY', 'Deportes'],
  ['M+ Estrenos 4K', 'Cine'], ['AMC Spain', 'Cine'], ['TCM HD', 'Cine'], ['Paramount Network', 'Cine'], ['Cine local (prueba)', 'Cine'],
  ['Clan TVE', 'Infantil'], ['Disney Junior ES', 'Infantil'], ['Nickelodeon', 'Infantil'], ['Boing', 'Infantil'],
  ['24h | Canal 24 Horas', 'Noticias'], ['Euronews ES', 'Noticias'], ['CNN International', 'Noticias'],
];
const EPG = ['La1.es', 'La2.es', 'Antena3.es', 'Cuatro.es', 'Telecinco.es', 'LaSexta.es', 'MLaLigaTV.es', 'MLigadeCampeones1.es', 'DAZN1.es', 'Eurosport1.es', 'Teledeporte.es', 'Gol.es',
  'MEstrenos.es', 'AMC.es', 'TCM.es', 'ParamountNetwork.es', 'ClanTVE.es', 'DisneyJunior.es', 'Nickelodeon.es', 'Boing.es', 'Canal24Horas.es', 'EuronewsSpanish.es', 'CNNInternational.us', 'Neox.es', 'Nova.es', 'Mega.es'];
const clean = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.(es|us|uk)$/, '').replace(/\b(es|spain|fhd|uhd|hd|sd|4k|tv|play)\b|\[.*?\]|^[a-z]{2}:|[^a-z0-9|]+/g, ' ').split('|').pop()!.replace(/\s+/g, '');
const grams = (s: string) => { const g = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); g.set(k, (g.get(k) ?? 0) + 1); } return g; };
function dice(a: string, b: string) {
  if (a === b) return 1; const A = grams(a), B = grams(b); let n = 0;
  for (const [k, v] of A) n += Math.min(v, B.get(k) ?? 0);
  return (2 * n) / Math.max(1, a.length - 1 + b.length - 1);
}
function best(name: string) {
  const c = clean(name); let id = '', s = 0;
  for (const e of EPG) { const d = dice(c, clean(e)); if (d > s) { s = d; id = e; } }
  return { id, s };
}
interface Row { name: string; group: string; epg: string; score: number; el: HTMLTableRowElement; state: 'none' | 'ok' | 'fail' | 'skip' | 'pre' }

export function mount(host: HTMLElement) {
  const life = new Life();
  const tbody = h('tbody');
  const rows: Row[] = CH.map(([name, group], i) => ({ name, group, epg: i === 3 || i === 14 ? best(name).id : '', score: 0, el: h('tr'), state: i === 3 || i === 14 ? 'pre' : 'none' }));
  const group = h('select', { 'aria-label': t('Grupo', 'Group') }, h('option', { value: '' }, t('Todos los grupos', 'All groups')), ...[...new Set(CH.map((c) => c[1]))].map((g) => h('option', null, g)));
  const thr = h('input', { type: 'range', min: '40', max: '90', value: '62', 'aria-label': t('Umbral', 'Threshold') });
  const thrV = h('b', null, '0,62');
  const overwrite = h('input', { type: 'checkbox' });
  const run = h('button.btn.am-run', null, '▶ ' + t('Ejecutar Auto Match', 'Run Auto Match'));
  const stop = h('button.btn.ghost.sm', { hidden: true }, t('Detener', 'Stop'));
  const bar = h('div.am-bar', null, h('i'));
  const prog = h('div.am-prog', { hidden: true }, bar, h('span.am-pt'));
  const log = h('div.am-log.gk-scroll');
  const summary = h('div.am-sum', { hidden: true });
  const plugin = h('aside.am-plugin.gk-scroll', null,
    h('h4', null, '🧩 Auto Match All Channels'), h('p.muted', null, t('Recorre los canales sin EPG uno a uno con la misma función del botón «Auto Match» y no bloquea la interfaz.', 'Walks through channels without EPG one by one using the same function as the “Auto Match” button, without blocking the UI.')),
    h('label', null, t('Filtrar por grupo', 'Filter by group'), group),
    h('label', null, h('span', null, t('Umbral de similitud ', 'Similarity threshold '), thrV), thr),
    h('label.am-check', null, overwrite, t('Reemplazar también los que ya tienen EPG', 'Also replace channels that already have EPG')),
    h('div.am-btns', null, run, stop), prog, summary, log);
  const table = h('div.am-table.gk-scroll', null, h('table', null, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, t('Canal', 'Channel')), h('th', null, t('Grupo', 'Group')), h('th', null, 'EPG'), h('th'))), tbody));
  const tabs = h('div.am-tabs', null, h('button.on', { onclick: (e: Event) => sw(e, 'list') }, t('Canales', 'Channels')), h('button', { onclick: (e: Event) => sw(e, 'plugin') }, 'Plugin'));
  const body = h('div.gk-body.am', null, h('nav.am-nav', null, h('b', null, 'Dispatcharr'), ...[t('Canales', 'Channels'), 'M3U', 'EPG', 'Plugins', t('Ajustes', 'Settings')].map((s, i) => h(`span${i === 0 ? '.on' : ''}`, null, s))), table, plugin);
  body.dataset.show = 'list';
  function sw(e: Event, k: string) { body.dataset.show = k; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); }
  const { root } = browser('dispatcharr.local:9191/channels', 'Dispatcharr', h('div.am-wrap', null, tabs, body), 'dark-bar');
  host.append(root);

  const paint = (r: Row, i: number) => {
    const btn = h('button.btn.ghost.sm', { onclick: () => { match(r, true); paint(r, i); } }, 'Auto Match');
    r.el.className = 'st-' + r.state;
    r.el.replaceChildren(h('td.muted', null, String(i + 1)), h('td', null, r.name), h('td', null, h('span.pill', null, r.group)),
      h('td.am-epg', null, r.epg ? h('span', null, r.epg, r.score ? h('small', null, ' ' + r.score.toFixed(2)) : '') : h('span.muted', null, '—')), h('td', null, btn));
  };
  rows.forEach((r, i) => { paint(r, i); tbody.append(r.el); });
  thr.addEventListener('input', () => { thrV.textContent = (Number(thr.value) / 100).toFixed(2).replace('.', ','); });

  /** lo mismo que hace el botón individual */
  function match(r: Row, single = false) {
    const { id, s } = best(r.name);
    if (s >= Number(thr.value) / 100) { r.epg = id; r.score = s; r.state = 'ok'; }
    else { r.state = 'fail'; r.score = s; if (single) toast(root, t(`Sin coincidencia para «${r.name}» (mejor: ${id}, ${s.toFixed(2)})`, `No match for “${r.name}” (best: ${id}, ${s.toFixed(2)})`), life, 'warn'); }
  }
  let running = false;
  stop.addEventListener('click', () => { running = false; });
  run.addEventListener('click', async () => {
    if (running) return;
    running = true; run.disabled = true; stop.hidden = false; prog.hidden = false; summary.hidden = true; log.replaceChildren();
    const todo = rows.filter((r) => !group.value || r.group === group.value);
    const c = { ok: 0, fail: 0, skip: 0 };
    const line = (s: string, cls = '') => { log.prepend(h(`div.${cls || 'x'}`, null, s)); };
    line(t(`Iniciando: ${todo.length} canales${group.value ? ' del grupo ' + group.value : ''}`, `Starting: ${todo.length} channels${group.value ? ' in group ' + group.value : ''}`));
    for (let k = 0; k < todo.length && running && life.alive; k++) {
      const r = todo[k], i = rows.indexOf(r);
      r.el.classList.add('busy'); r.el.scrollIntoView({ block: 'nearest' });
      (bar.firstChild as HTMLElement).style.width = `${((k + 1) / todo.length) * 100}%`;
      (prog.lastChild as HTMLElement).textContent = `${k + 1} / ${todo.length}`;
      await life.wait(170);
      if (r.epg && !overwrite.checked) { r.state = r.state === 'ok' ? 'ok' : 'skip'; c.skip++; line(`↷ ${r.name}: ${t('ya tenía EPG', 'already had EPG')}`, 'skip'); }
      else { match(r); if (r.state === 'ok') { c.ok++; line(`✓ ${r.name} → ${r.epg} (${r.score.toFixed(2)})`, 'ok'); } else { c.fail++; line(`✗ ${r.name}: ${t('sin coincidencia', 'no match')} (${r.score.toFixed(2)})`, 'fail'); } }
      paint(r, i);
    }
    summary.hidden = false;
    summary.replaceChildren(h('b', null, running ? t('Resumen', 'Summary') : t('Detenido', 'Stopped')), h('span.pill.ok', null, `${c.ok} ${t('emparejados', 'matched')}`), h('span.pill.bad', null, `${c.fail} ${t('sin coincidencia', 'no match')}`), h('span.pill', null, `${c.skip} ${t('omitidos', 'skipped')}`));
    toast(root, t(`Auto Match terminado: ${c.ok} canales con guía`, `Auto Match finished: ${c.ok} channels with a guide`), life, 'ok');
    running = false; run.disabled = false; stop.hidden = true;
  });
  return () => life.dispose();
}
