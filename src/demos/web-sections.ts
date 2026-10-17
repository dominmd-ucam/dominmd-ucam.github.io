import type { WebSection } from './types';
import { el, Timers } from './dom';

type Extra = Extract<WebSection, { kind: 'chat' | 'form' | 'pixelart' | 'feed' | 'status' | 'board' }>;

/** Secciones interactivas del demo web que van más allá de tarjetas y gráficos. Devuelve null si `s` no es de estas. */
export function extraSection(s: WebSection, timers: Timers): HTMLElement | null {
  switch (s.kind) {
    case 'chat': return chat(s, timers);
    case 'form': return form(s, timers);
    case 'pixelart': return pixelart(s);
    case 'feed': return feed(s);
    case 'status': return status(s);
    case 'board': return board(s);
    default: return null;
  }
}

/* ---------- chat con respuestas sugeridas ---------- */
function chat(s: Extract<Extra, { kind: 'chat' }>, timers: Timers) {
  const box = el('section', 'wb wb-chat');
  box.append(el('h5', '', s.title));
  const log = el('div', 'wc-log');
  const add = (text: string, me: boolean) => { const b = el('div', `wc-msg${me ? ' me' : ''}`, text); log.append(b); log.scrollTop = log.scrollHeight; return b; };
  add(s.intro, false);
  const chips = el('div', 'wc-chips');
  for (const qa of s.qa) {
    const b = el('button', 'wb-btn small ghost', qa.q);
    b.type = 'button';
    b.addEventListener('click', () => {
      add(qa.q, true);
      const t = add('…', false);
      timers.after(700, () => { t.textContent = qa.a; log.scrollTop = log.scrollHeight; });
    });
    chips.append(b);
  }
  box.append(log, chips);
  return box;
}

/* ---------- formulario con resultados ---------- */
function form(s: Extract<Extra, { kind: 'form' }>, timers: Timers) {
  const box = el('section', 'wb wb-form');
  box.append(el('h5', '', s.title));
  const grid = el('div', 'wf-fields');
  for (const f of s.fields) {
    const l = el('label', '', f.label);
    const i = el('input'); i.type = 'text'; i.value = f.value;
    l.append(i); grid.append(l);
  }
  const run = el('button', 'wb-btn', s.button); run.type = 'button';
  const out = el('div', 'wf-out');
  run.addEventListener('click', () => {
    out.replaceChildren(el('p', 'wf-wait', 'Procesando…'));
    timers.after(900, () => {
      const table = el('table');
      const head = el('tr'); s.columns.forEach((c) => head.append(el('th', '', c))); table.append(head);
      s.rows.forEach((r, k) => {
        const tr = el('tr'); tr.style.animationDelay = `${k * 90}ms`;
        r.forEach((c) => tr.append(el('td', '', c))); table.append(tr);
      });
      out.replaceChildren(el('h6', '', s.resultTitle), table);
    });
  });
  box.append(grid, run, out);
  return box;
}

/* ---------- convertidor de imagen a pixel art (funciona de verdad sobre una escena de muestra) ---------- */
function pixelart(s: Extract<Extra, { kind: 'pixelart' }>) {
  const box = el('section', 'wb wb-pixel');
  box.append(el('h5', '', s.title));
  const W = 320, H = 180;
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const g = src.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H * 0.65); sky.addColorStop(0, '#6ec6f5'); sky.addColorStop(1, '#ffd9b0');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffc857'; g.beginPath(); g.arc(250, 48, 26, 0, 7); g.fill();
  g.fillStyle = '#1fb5b0'; g.fillRect(0, H * 0.62, W, H * 0.38);
  g.fillStyle = '#7fe0d6'; for (let i = 0; i < 9; i++) g.fillRect(20 + i * 34, H * 0.72 + (i % 3) * 14, 22, 3);
  g.fillStyle = '#f3d9a4'; g.beginPath(); g.ellipse(120, H * 0.7, 110, 26, 0, 0, 7); g.fill();
  g.fillStyle = '#9b6b43'; g.fillRect(114, 70, 8, 70);
  g.fillStyle = '#3aa65b';
  for (const [x, y, w, h, r] of [[100, 70, 44, 12, -0.5], [124, 66, 46, 12, 0.5], [112, 52, 40, 12, -1.1], [118, 54, 40, 12, 1.1]] as number[][]) { g.save(); g.translate(x, y); g.rotate(r); g.fillRect(0, 0, w, h); g.restore(); }
  const out = document.createElement('canvas'); out.width = W; out.height = H; out.className = 'wp-canvas';
  const o = out.getContext('2d')!;
  const row = el('label', 'wp-row');
  const val = el('b', '', '');
  const range = el('input'); range.type = 'range'; range.min = '2'; range.max = '24'; range.value = '10'; range.setAttribute('aria-label', 'Tamaño de píxel');
  row.append(document.createTextNode('Tamaño de píxel '), range, val);
  const draw = () => {
    const px = Number(range.value);
    val.textContent = `${px}`;
    const sw = Math.ceil(W / px), sh = Math.ceil(H / px);
    const tiny = document.createElement('canvas'); tiny.width = sw; tiny.height = sh;
    tiny.getContext('2d')!.drawImage(src, 0, 0, sw, sh);
    o.imageSmoothingEnabled = false;
    o.clearRect(0, 0, W, H);
    o.drawImage(tiny, 0, 0, sw, sh, 0, 0, sw * px, sh * px);
  };
  range.addEventListener('input', draw);
  draw();
  box.append(out, row);
  if (s.hint) box.append(el('p', 'wp-hint', s.hint));
  return box;
}

/* ---------- lector de feeds con favoritos y dos vistas ---------- */
function feed(s: Extract<Extra, { kind: 'feed' }>) {
  const box = el('section', 'wb wb-feed');
  const head = el('div', 'wfd-head');
  head.append(el('h5', '', s.title));
  const tools = el('div', 'wfd-tools');
  const view = el('button', 'wb-btn small ghost', 'Vista: tarjetas'); view.type = 'button';
  const favBtn = el('button', 'wb-btn small ghost', 'Solo favoritos'); favBtn.type = 'button';
  tools.append(view, favBtn); head.append(tools);
  const list = el('div', 'wfd-list cards');
  const favs = new Set<number>();
  let asList = false, onlyFav = false;
  const render = () => {
    list.className = `wfd-list ${asList ? 'rows' : 'cards'}`;
    list.replaceChildren(...s.items.flatMap((it, i) => {
      if (onlyFav && !favs.has(i)) return [];
      const a = el('article', 'wfd-item');
      const star = el('button', 'wfd-star', favs.has(i) ? '★' : '☆'); star.type = 'button'; star.setAttribute('aria-label', 'Favorito');
      star.addEventListener('click', () => { favs.has(i) ? favs.delete(i) : favs.add(i); render(); });
      a.append(el('h6', '', it.title), el('p', '', it.text), star);
      if (it.tag) a.append(el('span', 'wfd-tag', it.tag));
      return [a];
    }));
    if (!list.children.length) list.append(el('p', 'wp-hint', 'Aún no hay favoritos: pulsa ☆ en un artículo.'));
  };
  view.addEventListener('click', () => { asList = !asList; view.textContent = `Vista: ${asList ? 'lista' : 'tarjetas'}`; render(); });
  favBtn.addEventListener('click', () => { onlyFav = !onlyFav; favBtn.classList.toggle('on', onlyFav); render(); });
  render();
  box.append(head, list);
  return box;
}

/* ---------- estado de servicios con simulador de incidencias ---------- */
function status(s: Extract<Extra, { kind: 'status' }>) {
  const box = el('section', 'wb wb-status');
  box.append(el('h5', '', s.title));
  const rows = el('div', 'ws-rows');
  const alerts = el('div', 'ws-alerts');
  const states = s.items.map((i) => ({ ...i }));
  const LABEL = { ok: 'Operativo', warn: 'Degradado', down: 'Caído' } as const;
  const render = () => {
    rows.replaceChildren(...states.map((it) => {
      const r = el('div', `ws-row ${it.state}`);
      r.append(el('i'), el('b', '', it.name), el('span', '', it.state === 'ok' ? it.detail : LABEL[it.state]));
      return r;
    }));
  };
  const btn = el('button', 'wb-btn small', s.incidentLabel ?? 'Simular incidencia'); btn.type = 'button';
  btn.addEventListener('click', () => {
    const bad = states.find((x) => x.state !== 'ok');
    const stamp = new Date().toTimeString().slice(0, 5);
    if (bad) { bad.state = 'ok'; alerts.prepend(el('div', 'ws-alert ok', `${stamp} · ${bad.name} recuperado`)); }
    else {
      const t = states[Math.floor(Math.random() * states.length)];
      t.state = Math.random() < 0.5 ? 'warn' : 'down';
      alerts.prepend(el('div', `ws-alert ${t.state}`, `${stamp} · Alerta: ${t.name} ${t.state === 'down' ? 'no responde' : 'va lento'}`));
    }
    btn.textContent = states.some((x) => x.state !== 'ok') ? 'Resolver incidencia' : (s.incidentLabel ?? 'Simular incidencia');
    render();
  });
  render();
  box.append(rows, btn, alerts);
  return box;
}

/* ---------- tablero por columnas: pulsar una tarjeta la avanza ---------- */
function board(s: Extract<Extra, { kind: 'board' }>) {
  const box = el('section', 'wb wb-board');
  box.append(el('h5', '', s.title));
  const cols = el('div', 'wbd-cols');
  const cards = s.cards.map((c) => ({ ...c }));
  const render = () => {
    cols.replaceChildren(...s.columns.map((name, ci) => {
      const col = el('div', 'wbd-col');
      const n = cards.filter((c) => c.col === ci).length;
      col.append(el('h6', '', `${name} · ${n}`));
      cards.filter((c) => c.col === ci).forEach((c) => {
        const b = el('button', 'wbd-card');
        b.type = 'button';
        b.append(el('span', '', c.text));
        if (c.meta) b.append(el('small', '', c.meta));
        b.title = 'Pulsa para avanzar';
        b.addEventListener('click', () => { c.col = (c.col + 1) % s.columns.length; render(); });
        col.append(b);
      });
      return col;
    }));
  };
  render();
  box.append(cols, el('p', 'wp-hint', 'Pulsa una tarjeta para moverla a la siguiente columna.'));
  return box;
}
