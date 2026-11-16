import { h, t, Life, browser, toast, crispCanvas, pick } from './kit';
import './elsaview.css';

/**
 * ElsaView: panel tipo Portainer para varias instancias de un motor de workflows. Métricas en vivo, ejecuciones que llegan solas,
 * alertas cuando un agente deja de responder y detalle de cada ejecución. Puedes tirar una instancia y ver cómo salta la alerta.
 */
interface Inst { name: string; env: string; up: boolean; cpu: number[]; ram: number[]; running: number; agent: string; card?: HTMLElement }
interface Exec { id: number; wf: string; inst: string; state: 'ok' | 'fail' | 'run' | 'susp'; ms: number; at: Date }
const WF = ['AltaCliente', 'FacturaMensual', 'SincronizarERP', 'EnviarRecordatorios', 'ImportarPedidos', 'BackupNocturno', 'AprobarGasto'];

export function mount(host: HTMLElement) {
  const life = new Life();
  const N = 40;
  const series = (base: number) => Array.from({ length: N }, (_, i) => base + Math.sin(i / 3) * 6 + Math.random() * 5);
  const inst: Inst[] = [
    { name: 'elsa-prod-01', env: t('Producción', 'Production'), up: true, cpu: series(42), ram: series(61), running: 7, agent: 'v1.4.2' },
    { name: 'elsa-prod-02', env: t('Producción', 'Production'), up: true, cpu: series(35), ram: series(55), running: 5, agent: 'v1.4.2' },
    { name: 'elsa-pre', env: t('Preproducción', 'Staging'), up: true, cpu: series(18), ram: series(40), running: 1, agent: 'v1.4.3-rc' },
    { name: 'elsa-clientes-eu', env: 'Cloud EU', up: true, cpu: series(27), ram: series(48), running: 3, agent: 'v1.4.2' },
  ];
  const execs: Exec[] = [];
  let nextId = 18240, filter: Exec['state'] | '' = '', alerts = 0;
  const kpis = h('div.ev-kpis');
  const cards = h('div.ev-cards');
  const chart = crispCanvas('ev-chart');
  const tbody = h('tbody');
  const alertList = h('div.ev-alerts.gk-scroll');
  const detail = h('div.ev-detail', { hidden: true });
  const fsel = h('select', { 'aria-label': t('Estado', 'Status') }, ...[['', t('Todas', 'All')], ['ok', t('Completadas', 'Completed')], ['fail', t('Fallidas', 'Failed')], ['run', t('En curso', 'Running')], ['susp', t('Suspendidas', 'Suspended')]].map(([v, l]) => h('option', { value: v }, l)));
  fsel.addEventListener('change', () => { filter = fsel.value as Exec['state'] | ''; renderTable(); });
  const main = h('div.ev-main.gk-scroll', null, kpis, cards,
    h('div.ev-row', null,
      h('section.ev-box.ev-cpu', null, h('h5', null, t('CPU por instancia (último minuto)', 'CPU per instance (last minute)')), chart.c),
      h('section.ev-box', null, h('h5', null, t('Alertas', 'Alerts')), alertList)),
    h('section.ev-box', null, h('div.ev-head', null, h('h5', null, t('Ejecuciones recientes', 'Recent executions')), fsel), h('div.ev-table', null, h('table', null, h('thead', null, h('tr', null, ...['ID', 'Workflow', t('Instancia', 'Instance'), t('Estado', 'Status'), t('Duración', 'Duration')].map((s) => h('th', null, s)))), tbody))),
    detail);
  const body = h('div.gk-body.ev', null, h('nav.ev-nav', null, h('b', null, '◈ ElsaView'), ...[t('Panel', 'Dashboard'), t('Instancias', 'Instances'), 'Workflows', t('Alertas', 'Alerts'), t('Agentes', 'Agents')].map((s, i) => h(`span${i ? '' : '.on'}`, null, s))), main);
  const { root } = browser('elsaview.interno/dashboard', 'ElsaView', body);
  host.append(root);
  const colors = ['#5b8def', '#26b37a', '#e0a020', '#c55df0'];

  function renderCards() {
    cards.replaceChildren(...inst.map((it, i) => {
      const last = it.cpu[N - 1], ram = it.ram[N - 1];
      const btn = h('button.btn.sm' + (it.up ? '.ghost' : ''), { onclick: () => toggle(it) }, it.up ? t('Simular caída', 'Simulate outage') : t('Reiniciar agente', 'Restart agent'));
      return it.card = h(`article.ev-card${it.up ? '' : '.down'}`, null,
        h('div.ev-ch', null, h('i', { style: `background:${colors[i]}` }), h('b', null, it.name), h(`span.pill.${it.up ? 'ok' : 'bad'}`, null, it.up ? t('En línea', 'Online') : t('Sin conexión', 'Offline'))),
        h('div.muted', null, `${it.env} · ${t('agente', 'agent')} ${it.agent} · WebSocket ${it.up ? '✓' : '✗'}`),
        h('div.ev-meters', null, meter('CPU', it.up ? last : 0), meter('RAM', it.up ? ram : 0)),
        h('div.ev-cf', null, h('span', null, `${it.up ? it.running : 0} ${t('en curso', 'running')}`), btn));
    }));
  }
  const meter = (l: string, v: number) => h('div.ev-m', null, h('span', null, l), h('div', null, h('i', { style: `width:${v.toFixed(0)}%;background:${v > 80 ? '#e5484d' : v > 60 ? '#e0a020' : '#26b37a'}` })), h('b', null, v.toFixed(0) + '%'));
  function renderKpis() {
    const up = inst.filter((i) => i.up).length, last = execs.slice(0, 30), fails = last.filter((e) => e.state === 'fail').length;
    kpis.replaceChildren(...[[t('Instancias en línea', 'Instances online'), `${up}/${inst.length}`, up < inst.length ? 'bad' : ''], [t('Workflows en curso', 'Running workflows'), String(inst.reduce((s, i) => s + (i.up ? i.running : 0), 0)), ''],
      [t('Tasa de error (30 últ.)', 'Error rate (last 30)'), `${last.length ? Math.round((fails / last.length) * 100) : 0}%`, fails / Math.max(1, last.length) > .15 ? 'bad' : ''], [t('Alertas abiertas', 'Open alerts'), String(alerts), alerts ? 'bad' : '']]
      .map(([l, v, c]) => h(`div.ev-kpi${c ? '.' + c : ''}`, null, h('b', null, v), h('span', null, l))));
  }
  function renderTable() {
    const fmt = (d: Date) => d.toTimeString().slice(0, 8);
    tbody.replaceChildren(...execs.filter((e) => !filter || e.state === filter).slice(0, 14).map((e) => {
      const st = { ok: ['ok', t('Completado', 'Completed')], fail: ['bad', t('Fallido', 'Failed')], run: ['', t('En curso', 'Running')], susp: ['warn', t('Suspendido', 'Suspended')] }[e.state];
      return h('tr.ev-tr', { onclick: () => showDetail(e), tabindex: 0 }, h('td.muted', null, '#' + e.id), h('td', null, e.wf), h('td', null, e.inst), h('td', null, h(`span.pill${st[0] ? '.' + st[0] : ''}`, null, st[1])), h('td', null, e.state === 'run' ? '…' : `${(e.ms / 1000).toFixed(1)} s · ${fmt(e.at)}`));
    }));
  }
  function showDetail(e: Exec) {
    const acts = ['HttpEndpoint', t('Validar datos', 'Validate data'), 'SqlQuery', e.wf === 'AprobarGasto' ? t('Esperar aprobación', 'Wait for approval') : 'SendEmail', t('Fin', 'End')];
    const failAt = e.state === 'fail' ? 2 + (e.id % 2) : 99;
    detail.hidden = false;
    detail.replaceChildren(h('div.ev-head', null, h('h5', null, `#${e.id} · ${e.wf}`), h('button.btn.ghost.sm', { onclick: () => { detail.hidden = true; } }, '✕')),
      h('ol.ev-steps', null, ...acts.map((a, i) => h(`li.${i < failAt ? (e.state === 'run' && i === 2 ? 'run' : e.state === 'susp' && i === 3 ? 'susp' : 'ok') : i === failAt ? 'fail' : 'skip'}`, null, a,
        i === failAt ? h('small', null, ' — ' + pick(['SqlException: timeout expired', 'HTTP 502 Bad Gateway (ERP)', 'NullReferenceException en MapCliente'])) : ''))));
    detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function alert(msg: string, sev: 'bad' | 'warn' | 'ok') {
    if (sev !== 'ok') alerts++;
    alertList.prepend(h(`div.ev-al.${sev}`, null, h('b', null, new Date().toTimeString().slice(0, 8)), ' ', msg));
    renderKpis();
  }
  function toggle(it: Inst) {
    it.up = !it.up;
    if (!it.up) { alert(t(`${it.name}: el agente no responde al latido (WebSocket cerrado)`, `${it.name}: agent missed heartbeat (WebSocket closed)`), 'bad'); toast(root, t(`Alerta: ${it.name} sin conexión`, `Alert: ${it.name} offline`), life, 'warn'); }
    else { alerts = Math.max(0, alerts - 1); alert(t(`${it.name}: agente reconectado`, `${it.name}: agent reconnected`), 'ok'); }
    renderCards(); renderKpis();
  }
  function tick() {
    for (const it of inst) {
      const v = it.up ? Math.max(3, Math.min(97, it.cpu[N - 1] + (Math.random() - .5) * 12 + (40 - it.cpu[N - 1]) * .08)) : 0;
      it.cpu.push(v); it.cpu.shift(); it.ram.push(it.up ? Math.max(20, Math.min(95, it.ram[N - 1] + (Math.random() - .5) * 3)) : 0); it.ram.shift();
      if (it.up) it.running = Math.max(0, it.running + Math.round((Math.random() - .5) * 2));
      if (it.up && v > 85 && Math.random() < .3) alert(t(`${it.name}: CPU por encima del 85 %`, `${it.name}: CPU above 85%`), 'warn');
    }
    drawChart(); updateMeters();
  }
  function updateMeters() {
    for (const it of inst) {
      const ms = it.card?.querySelectorAll<HTMLElement>('.ev-m'); if (!ms) continue;
      [it.cpu[N - 1], it.ram[N - 1]].forEach((v, k) => { const i = ms[k].querySelector('i')!; i.style.width = v.toFixed(0) + '%'; i.style.background = v > 80 ? '#e5484d' : v > 60 ? '#e0a020' : '#26b37a'; ms[k].querySelector('b')!.textContent = v.toFixed(0) + '%'; });
      const run = it.card?.querySelector('.ev-cf span'); if (run) run.textContent = `${it.up ? it.running : 0} ${t('en curso', 'running')}`;
    }
  }
  function newExec() {
    const live = inst.filter((i) => i.up); if (!live.length) return;
    const running = execs.find((e) => e.state === 'run');
    if (running) { running.state = Math.random() < .2 ? 'fail' : 'ok'; running.ms = 800 + Math.random() * 9000; if (running.state === 'fail') alert(t(`Workflow ${running.wf} #${running.id} falló en ${running.inst}`, `Workflow ${running.wf} #${running.id} failed on ${running.inst}`), 'warn'); }
    execs.unshift({ id: nextId++, wf: pick(WF), inst: pick(live).name, state: Math.random() < .1 ? 'susp' : 'run', ms: 0, at: new Date() });
    if (execs.length > 60) execs.pop();
    renderTable(); renderKpis();
  }
  function drawChart() {
    const { ctx: g, fit } = chart, { w, h: H } = fit();
    g.clearRect(0, 0, w, H);
    g.strokeStyle = '#eef1f4'; g.lineWidth = 1;
    for (let y = 0; y <= 4; y++) { g.beginPath(); g.moveTo(0, H * y / 4 + .5); g.lineTo(w, H * y / 4 + .5); g.stroke(); }
    inst.forEach((it, k) => {
      g.strokeStyle = colors[k]; g.lineWidth = 2; g.beginPath();
      it.cpu.forEach((v, i) => { const x = (i / (N - 1)) * w, y = H - (v / 100) * (H - 4) - 2; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    });
  }
  // historial inicial
  for (let i = 0; i < 16; i++) execs.push({ id: nextId - 16 + i, wf: pick(WF), inst: pick(inst).name, state: Math.random() < .15 ? 'fail' : Math.random() < .08 ? 'susp' : 'ok', ms: 600 + Math.random() * 8000, at: new Date(Date.now() - (16 - i) * 47e3) });
  execs.reverse();
  alert(t('elsa-pre: versión de agente distinta a producción (v1.4.3-rc)', 'elsa-pre: agent version differs from production (v1.4.3-rc)'), 'warn');
  renderCards(); renderTable(); renderKpis();
  requestAnimationFrame(drawChart);
  life.every(1000, tick);
  life.every(2300, newExec);
  life.on(window, 'resize', drawChart);
  return () => life.dispose();
}
