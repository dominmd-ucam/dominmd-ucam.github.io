import { h, t, Life, browser, toast, fmt } from './kit';
import './ganaderia.css';

/**
 * Ganadería: el recorrido completo de un animal. Registras un albarán, ubicas los animales en cuadras, los trasladas o das de baja
 * con foto como evidencia, y el stock, los kilos y los informes se recalculan al momento.
 */
interface Animal { id: string; breed: string; kg: number; pen: string | null }
interface Move { at: Date; kind: string; text: string; photo?: string }
const BREEDS = ['Limusín', 'Charolés', 'Avileña', t('Cruzado', 'Crossbreed')];
const SUPPLIERS = ['Ganados Hnos. Pérez', 'Cooperativa del Valle', 'Agropecuaria Sur'];

/** «Foto» de evidencia: un ternero dibujado, con fecha, hora y coordenadas sobreimpresas como en la app real. */
function photo(label: string) {
  const c = h('canvas', { width: 320, height: 200 }); const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 120); sky.addColorStop(0, '#9cc9e8'); sky.addColorStop(1, '#e6eef2'); g.fillStyle = sky; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#8f7a55'; g.fillRect(0, 120, 320, 80); g.fillStyle = '#6d5a3d'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 320, 125 + Math.random() * 75, 6, 2);
  g.fillStyle = '#7b5b3a'; for (let x = 0; x < 320; x += 40) g.fillRect(x, 92, 5, 40); g.fillRect(0, 98, 320, 4); g.fillRect(0, 114, 320, 4);
  const hue = 20 + Math.random() * 20, col = `hsl(${hue},45%,${30 + Math.random() * 30}%)`;
  g.fillStyle = col; g.beginPath(); g.ellipse(160, 130, 62, 30, 0, 0, 7); g.fill();
  g.fillRect(112, 140, 10, 38); g.fillRect(132, 145, 10, 34); g.fillRect(180, 145, 10, 34); g.fillRect(200, 140, 10, 38);
  g.beginPath(); g.ellipse(225, 112, 22, 16, -.4, 0, 7); g.fill();
  g.fillStyle = '#e8c9a6'; g.beginPath(); g.ellipse(240, 118, 9, 7, 0, 0, 7); g.fill();
  g.fillStyle = '#f0c419'; g.fillRect(215, 99, 7, 9);
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 172, 320, 28);
  g.fillStyle = '#fff'; g.font = '11px monospace';
  g.fillText(new Date().toLocaleString('es-ES'), 8, 184); g.fillText('38.0912 N, -1.2843 W · ' + label, 8, 196);
  return c.toDataURL('image/jpeg', .8);
}

export function mount(host: HTMLElement) {
  const life = new Life();
  let seq = 4310, alb = 87;
  const crotal = () => `ES0130${String(++seq).padStart(6, '0')}`;
  const pens = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map((id, i) => ({ id, cap: i < 4 ? 10 : 6, name: i < 4 ? t(`Cuadra ${i + 1} · Engorde`, `Pen ${i + 1} · Fattening`) : t(`Cuadra ${i + 1} · Recría`, `Pen ${i + 1} · Rearing`) }));
  const animals: Animal[] = [];
  [6, 8, 4, 9, 3, 2].forEach((n, k) => { for (let i = 0; i < n; i++) animals.push({ id: crotal(), breed: BREEDS[(i + k) % 4], kg: Math.round(k < 4 ? 380 + Math.random() * 160 : 190 + Math.random() * 80), pen: pens[k].id }); });
  const moves: Move[] = [{ at: new Date(Date.now() - 864e5 * 2), kind: t('Entrada', 'Intake'), text: `ALB-2026-0086 · Cooperativa del Valle · 9 ${t('animales', 'animals')}` }];
  let sel: Animal | null = null, view = 'pens';

  const views: Record<string, HTMLElement> = { intake: h('div.gn-v'), pens: h('div.gn-v'), moves: h('div.gn-v'), report: h('div.gn-v') };
  const navItems: [string, string][] = [['intake', '📄 ' + t('Albaranes', 'Delivery notes')], ['pens', '🏠 ' + t('Cuadras', 'Pens')], ['moves', '🔁 ' + t('Movimientos', 'Movements')], ['report', '📊 ' + t('Informes', 'Reports')]];
  const nav = h('nav.gn-nav', null, ...navItems.map(([k, l]) => h('button', { 'data-k': k, onclick: () => go(k) }, l)));
  const main = h('div.gn-main.gk-scroll', null, ...Object.values(views));
  const sheet = h('div.gn-sheet', { hidden: true });
  const { root } = browser('ganaderia.app/cuadras', t('Gestión ganadera', 'Livestock management'), h('div.gk-body.gn', null, nav, main, sheet));
  host.append(root);

  function go(k: string) { view = k; nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); Object.entries(views).forEach(([n, v]) => { v.hidden = n !== k; }); render(); main.scrollTop = 0; }
  const live = () => animals.filter((a) => a.pen !== 'baja');
  const inPen = (id: string | null) => animals.filter((a) => a.pen === id);
  const kg = (l: Animal[]) => l.reduce((s, a) => s + a.kg, 0);

  function render() {
    if (view === 'intake') renderIntake(); else if (view === 'pens') renderPens(); else if (view === 'moves') renderMoves(); else renderReport();
  }
  function renderIntake() {
    const n = h('input', { type: 'number', min: '1', max: '10', value: '6' }), w = h('input', { type: 'number', min: '60', max: '700', value: '245' });
    const sup = h('select', null, ...SUPPLIERS.map((s) => h('option', null, s))), br = h('select', null, ...BREEDS.map((s) => h('option', null, s)));
    const num = `ALB-2026-${String(alb + 1).padStart(4, '0')}`;
    views.intake.replaceChildren(h('h4', null, t('Registrar albarán de entrada', 'Register an incoming delivery note')),
      h('form.gn-form', { onsubmit: (e: Event) => {
        e.preventDefault(); alb++;
        const count = Math.max(1, Math.min(10, Number(n.value) || 1)), avg = Number(w.value) || 245;
        for (let i = 0; i < count; i++) animals.push({ id: crotal(), breed: br.value, kg: Math.round(avg * (0.9 + Math.random() * 0.2)), pen: null });
        moves.unshift({ at: new Date(), kind: t('Entrada', 'Intake'), text: `${num} · ${sup.value} · ${count} ${t('animales', 'animals')} · ${fmt(count * avg)} kg` });
        toast(root, t(`${count} animales registrados. Ubícalos en una cuadra.`, `${count} animals registered. Place them in a pen.`), life, 'ok');
        go('pens');
      } },
        h('label', null, t('Nº de albarán', 'Note number'), h('input', { type: 'text', value: num, readonly: true })), h('label', null, t('Proveedor', 'Supplier'), sup),
        h('label', null, t('Raza', 'Breed'), br), h('label', null, t('Nº de animales', 'Animals'), n), h('label', null, t('Peso medio (kg)', 'Average weight (kg)'), w),
        h('button.btn', { type: 'submit' }, t('Registrar entrada', 'Register intake'))),
      h('p.muted', null, t('Cada animal recibe su crotal y queda pendiente de ubicar.', 'Each animal gets its ear tag and waits to be placed.')));
  }
  function chip(a: Animal) {
    return h(`button.gn-chip${sel === a ? '.sel' : ''}`, { title: `${a.id} · ${a.breed} · ${a.kg} kg`, onclick: (e: Event) => { e.stopPropagation(); sel = sel === a ? null : a; render(); } }, h('b', null, a.id.slice(-4)), h('small', null, `${a.kg} kg`));
  }
  function renderPens() {
    const pend = inPen(null);
    const bar = sel ? h('div.gn-selbar', null, h('span', null, h('b', null, sel.id), ` · ${sel.breed} · ${sel.kg} kg · `, sel.pen ? t(`en ${sel.pen}`, `in ${sel.pen}`) : t('sin ubicar', 'not placed')),
      h('span.muted', null, sel.pen ? t('Toca otra cuadra para trasladarlo', 'Tap another pen to transfer it') : t('Toca una cuadra para ubicarlo', 'Tap a pen to place it')),
      sel.pen && h('button.btn.sm.gn-bad', { onclick: () => askLoss(sel!) }, t('Dar de baja', 'Record loss'))) : null;
    views.pens.replaceChildren(
      h('div.gn-top', null, h('h4', null, t('Cuadras', 'Pens')), h('span.muted', null, `${live().filter((a) => a.pen).length} ${t('animales', 'animals')} · ${fmt(kg(live().filter((a) => a.pen)))} kg`)),
      pend.length ? h('div.gn-pend', null, h('b', null, t(`Pendientes de ubicar (${pend.length})`, `Waiting to be placed (${pend.length})`)), h('div.gn-chips', null, ...pend.map(chip))) : '',
      bar ?? h('p.muted.gn-tip', null, t('Toca un animal para seleccionarlo; después toca una cuadra.', 'Tap an animal to select it, then tap a pen.')),
      h('div.gn-pens', null, ...pens.map((p) => {
        const l = inPen(p.id), full = l.length >= p.cap;
        return h(`section.gn-pen${sel && sel.pen !== p.id ? (full ? '.full' : '.target') : ''}`, { onclick: () => place(p.id, full) },
          h('div.gn-ph', null, h('b', null, p.name), h('span', null, `${l.length}/${p.cap}`)),
          h('div.gn-occ', null, h('i', { style: `width:${(l.length / p.cap) * 100}%` })),
          h('div.gn-pk.muted', null, `${fmt(kg(l))} kg · ${t('media', 'avg')} ${l.length ? fmt(kg(l) / l.length) : 0} kg`),
          h('div.gn-chips', null, ...l.map(chip)));
      })));
  }
  function place(pen: string, full: boolean) {
    if (!sel || sel.pen === pen) return;
    if (full) { toast(root, t('Cuadra completa', 'Pen is full'), life, 'warn'); return; }
    const a = sel;
    if (!a.pen) { a.pen = pen; moves.unshift({ at: new Date(), kind: t('Ubicación', 'Placement'), text: `${a.id} → ${pen}` }); sel = null; render(); return; }
    evidence(t(`Traslado ${a.id}: ${a.pen} → ${pen}`, `Transfer ${a.id}: ${a.pen} → ${pen}`), null, (img) => {
      moves.unshift({ at: new Date(), kind: t('Traslado', 'Transfer'), text: `${a.id}: ${a.pen} → ${pen}`, photo: img }); a.pen = pen; sel = null; render();
      toast(root, t('Traslado registrado con evidencia', 'Transfer recorded with evidence'), life, 'ok');
    });
  }
  function askLoss(a: Animal) {
    const cause = h('select', null, ...[t('Venta a matadero', 'Sold to abattoir'), t('Muerte natural', 'Natural death'), t('Sacrificio sanitario', 'Health cull'), t('Venta a otra explotación', 'Sold to another farm')].map((c) => h('option', null, c)));
    evidence(t(`Baja de ${a.id} (${a.pen})`, `Loss of ${a.id} (${a.pen})`), cause, (img) => {
      moves.unshift({ at: new Date(), kind: t('Baja', 'Loss'), text: `${a.id} · ${a.pen} · ${cause.value} · ${a.kg} kg`, photo: img }); a.pen = 'baja'; sel = null; render();
      toast(root, t('Baja registrada', 'Loss recorded'), life, 'ok');
    });
  }
  function evidence(title: string, extra: HTMLElement | null, done: (img: string) => void) {
    let img = '';
    const shot = h('div.gn-shot', null, h('span.muted', null, t('Sin foto', 'No photo')));
    const ok = h('button.btn', { disabled: true, onclick: () => { sheet.hidden = true; done(img); } }, t('Confirmar', 'Confirm'));
    sheet.hidden = false;
    sheet.replaceChildren(h('div.gn-modal', null, h('h4', null, title), extra && h('label', null, t('Causa', 'Cause'), extra), shot,
      h('div.gn-mb', null, h('button.btn.ghost', { onclick: () => {
        shot.replaceChildren(h('div.gn-flash')); life.after(250, () => { img = photo(sel?.id ?? ''); shot.replaceChildren(h('img', { src: img, alt: t('Foto de evidencia', 'Evidence photo') })); ok.disabled = false; });
      } }, '📷 ' + t('Hacer foto', 'Take photo')), h('button.btn.ghost', { onclick: () => { sheet.hidden = true; } }, t('Cancelar', 'Cancel')), ok),
      h('p.muted', null, t('La foto es obligatoria: queda como evidencia del movimiento.', 'The photo is required: it stays as evidence of the movement.'))));
  }
  function renderMoves() {
    views.moves.replaceChildren(h('h4', null, t('Movimientos', 'Movements')), h('div.gn-list', null, ...moves.map((m) => h('div.gn-mv', null,
      h('span.pill', null, m.kind), h('span', null, m.text), h('small.muted', null, m.at.toLocaleString(document.documentElement.lang || 'es', { dateStyle: 'short', timeStyle: 'short' })), m.photo ? h('img', { src: m.photo, alt: '' }) : ''))));
  }
  function renderReport() {
    const all = live().filter((a) => a.pen), max = Math.max(...pens.map((p) => kg(inPen(p.id))), 1);
    const losses = animals.filter((a) => a.pen === 'baja').length;
    views.report.replaceChildren(h('h4', null, t('Informe de stock', 'Stock report')),
      h('div.gn-kpis', null, ...[[t('Animales', 'Animals'), String(all.length)], [t('Kilos en granja', 'Kg on farm'), fmt(kg(all))], [t('Peso medio', 'Average weight'), fmt(kg(all) / Math.max(1, all.length)) + ' kg'], [t('Bajas', 'Losses'), String(losses)]].map(([l, v]) => h('div', null, h('b', null, v), h('span', null, l)))),
      h('div.gn-bars', null, ...pens.map((p) => { const k = kg(inPen(p.id)); return h('div.gn-bar', null, h('span', null, p.id), h('div', null, h('i', { style: `width:${(k / max) * 100}%` })), h('b', null, fmt(k) + ' kg')); })),
      h('p.muted', null, t('Peso total por cuadra. Se recalcula con cada entrada, traslado o baja.', 'Total weight per pen. Recalculated on every intake, transfer or loss.')));
  }
  go('intake');
  return () => life.dispose();
}
