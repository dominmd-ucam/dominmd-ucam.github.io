import { h, t, Life, phone, toast } from './kit';
import './mantenimiento.css';

/**
 * PWA de mantenimiento: la app del operario en el móvil. Tareas del día con su formulario y foto, niveles de sal de los
 * descalcificadores que bajan con los días (con aviso de nivel bajo), recargas que descuentan stock, y modo sin conexión:
 * lo que haces sin cobertura queda en cola y se sincroniza al volver.
 */
interface Task { id: number; building: string; title: string; fields: { label: string; unit: string; min: number; max: number; val: string }[]; done: boolean; photo: string | null; synced: boolean }
interface Softener { building: string; level: number; perDay: number }

function photo(text: string) {
  const c = h('canvas', { width: 240, height: 160 }); const g = c.getContext('2d')!;
  g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, 240, 160);
  g.fillStyle = '#8d9299'; g.fillRect(0, 110, 240, 50);
  g.fillStyle = '#2f6fb1'; g.fillRect(70, 30, 50, 95); g.fillStyle = '#e8e8e8'; g.fillRect(135, 50, 40, 75);
  g.fillStyle = '#1d1d1d'; g.fillRect(80, 40, 30, 14); g.fillStyle = '#7CFC00'; g.font = '10px monospace'; g.fillText('2.4', 86, 51);
  g.strokeStyle = '#555'; g.lineWidth = 5; g.beginPath(); g.moveTo(95, 30); g.lineTo(95, 10); g.lineTo(240, 10); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 140, 240, 20); g.fillStyle = '#fff'; g.fillText(new Date().toLocaleString('es-ES').slice(0, 17) + ' · ' + text, 6, 154);
  return c.toDataURL('image/jpeg', .8);
}

export function mount(host: HTMLElement) {
  const life = new Life();
  let online = true, tab = 'tasks', open: Task | null = null, day = 0, sacks = 14;
  const queue: string[] = [];
  const f = (label: string, unit: string, min: number, max: number) => ({ label, unit, min, max, val: '' });
  const tasks: Task[] = [
    { id: 1, building: t('Edificio Alameda', 'Alameda building'), title: t('Revisión de grupo de presión', 'Pressure pump check'), fields: [f(t('Presión de salida', 'Outlet pressure'), 'bar', 2, 4), f(t('Horas de bomba', 'Pump hours'), 'h', 0, 99999)], done: false, photo: null, synced: true },
    { id: 2, building: t('Residencial Mar Menor', 'Mar Menor residence'), title: t('Control de cloro en piscina', 'Pool chlorine check'), fields: [f(t('Cloro libre', 'Free chlorine'), 'ppm', 0.5, 2), f('pH', '', 7.2, 7.8)], done: false, photo: null, synced: true },
    { id: 3, building: t('Oficinas Centro', 'City-centre offices'), title: t('Limpieza de filtros de climatización', 'HVAC filter cleaning'), fields: [f(t('Filtros cambiados', 'Filters replaced'), 'ud', 0, 20)], done: false, photo: null, synced: true },
  ];
  const soft: Softener[] = [{ building: 'Alameda', level: 64, perDay: 6 }, { building: 'Mar Menor', level: 31, perDay: 8 }, { building: t('Oficinas', 'Offices'), level: 82, perDay: 4 }];
  const screen = h('div.mt-app');
  const ph = phone(screen, 'mt-phone');
  const side = h('aside.mt-side', null,
    h('h4', null, t('Cómo funciona', 'How it works')),
    h('p', null, t('Esta es la app del operario. Rellena una tarea con su foto, recarga sal cuando avise y prueba a quitar la cobertura: todo queda en cola y se sincroniza al volver.', 'This is the technician\'s app. Fill in a task with its photo, refill salt when warned, and try turning coverage off: everything is queued and syncs when you\'re back.')),
    h('div.mt-ctrls', null,
      h('label.mt-sw', null, h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => { online = (e.target as HTMLInputElement).checked; if (online) sync(); render(); } }), h('span', null, t('Con cobertura', 'Online'))),
      h('button.btn.sm', { onclick: () => advance() }, '⏩ ' + t('Avanzar un día', 'Skip a day'))),
    h('div.mt-server', null, h('b', null, t('Servidor', 'Server')), h('div.mt-srv')));
  host.append(h('div.gk.mt-root', null, h('div.gk-body.mt', null, ph, side)));
  const srv = side.querySelector('.mt-srv') as HTMLElement;
  const srvLog = (s: string) => { srv.prepend(h('div', null, new Date().toTimeString().slice(0, 5) + ' ' + s)); };

  function send(what: string) {
    if (online) { srvLog('✓ ' + what); return true; }
    queue.push(what); return false;
  }
  function sync() {
    if (!queue.length) return;
    const n = queue.length;
    life.after(600, () => { while (queue.length) srvLog('⟳ ' + queue.shift()); tasks.forEach((x) => { x.synced = true; }); toast(ph, t(`${n} cambios sincronizados`, `${n} changes synced`), life, 'ok'); render(); });
  }
  function advance() {
    day++;
    for (const s of soft) { const before = s.level; s.level = Math.max(0, s.level - s.perDay - Math.round(Math.random() * 3)); if (before >= 25 && s.level < 25) { toast(ph, t(`🔔 Sal baja en ${s.building} (${s.level} %)`, `🔔 Low salt at ${s.building} (${s.level}%)`), life, 'warn'); } }
    render();
  }
  function render() {
    const low = soft.filter((s) => s.level < 25).length;
    const head = h('header.mt-head', null, h('div', null, h('b', null, t('Mantenimientos', 'Maintenance')), h('small', null, t(`Juan · ${day ? `día +${day}` : 'hoy'}`, `Juan · ${day ? `day +${day}` : 'today'}`))),
      h(`span.mt-net${online ? '' : '.off'}`, null, online ? '● Online' : t('✈ Sin conexión', '✈ Offline')));
    const bar = queue.length ? h('div.mt-queue', null, t(`${queue.length} cambios pendientes de sincronizar`, `${queue.length} changes waiting to sync`)) : null;
    let content: HTMLElement;
    if (open) content = taskView(open);
    else if (tab === 'tasks') content = h('div.mt-list.gk-scroll', null, ...tasks.map((x) => h(`button.mt-task${x.done ? '.done' : ''}`, { onclick: () => { open = x; render(); } },
      h('span.mt-ic', null, x.done ? '✓' : '🔧'), h('div', null, h('b', null, x.title), h('small', null, x.building)), x.done && !x.synced ? h('span.pill.warn', null, '⟳') : h('span.mt-chev', null, '›'))));
    else content = h('div.mt-list.gk-scroll', null, h('div.mt-stock', null, t(`Stock en furgoneta: ${sacks} sacos de 25 kg`, `Stock in van: ${sacks} × 25 kg sacks`)), ...soft.map((s) => h(`div.mt-salt${s.level < 25 ? '.low' : ''}`, null,
      h('div.mt-tank', null, h('i', { style: `height:${s.level}%` })), h('div', null, h('b', null, s.building), h('small', null, `${s.level} % · ${t('≈', '≈')} ${Math.floor(s.level / s.perDay)} ${t('días', 'days')}`), s.level < 25 ? h('span.pill.bad', null, t('Nivel bajo', 'Low level')) : ''),
      h('button.btn.sm', { disabled: sacks < 2 || s.level > 90, onclick: () => { const add = Math.min(2, sacks); sacks -= add; s.level = Math.min(100, s.level + add * 22); const ok = send(t(`Recarga ${s.building}: ${add} sacos`, `Refill ${s.building}: ${add} sacks`)); toast(ph, ok ? t('Recarga registrada', 'Refill recorded') : t('Guardado sin conexión', 'Saved offline'), life, ok ? 'ok' : 'info'); render(); } }, '+2 ' + t('sacos', 'sacks')))));
    const nav = h('nav.mt-nav', null, h(`button${tab === 'tasks' && !open ? '.on' : ''}`, { onclick: () => { open = null; tab = 'tasks'; render(); } }, '📋', h('small', null, t('Tareas', 'Tasks'))),
      h(`button${tab === 'salt' && !open ? '.on' : ''}`, { onclick: () => { open = null; tab = 'salt'; render(); } }, '🧂', h('small', null, t('Sal', 'Salt')), low ? h('i', null, String(low)) : ''));
    screen.replaceChildren(head, ...(bar ? [bar] : []), content, nav);
  }
  function taskView(x: Task) {
    const inputs = x.fields.map((fl) => { const i = h('input', { type: 'number', step: 'any', value: fl.val, disabled: x.done, inputmode: 'decimal' }); i.addEventListener('input', () => { fl.val = i.value; check(); }); return { fl, i }; });
    const warn = h('div.mt-warn');
    const shot = h('div.mt-shot', null, x.photo ? h('img', { src: x.photo, alt: t('Foto', 'Photo') }) : h('span', null, '📷 ' + t('Añadir foto', 'Add photo')));
    shot.addEventListener('click', () => { if (x.done) return; x.photo = photo(x.building); shot.replaceChildren(h('img', { src: x.photo, alt: t('Foto', 'Photo') })); check(); });
    const done = h('button.btn.mt-done', { disabled: true, onclick: () => { x.done = true; x.synced = send(`${t('Tarea', 'Task')} #${x.id} ${t('completada', 'completed')} (${x.fields.map((fl) => fl.val + fl.unit).join(', ')})`); toast(ph, x.synced ? t('Tarea enviada', 'Task sent') : t('Sin conexión: se enviará al volver', 'Offline: will be sent later'), life, x.synced ? 'ok' : 'info'); open = null; render(); } }, x.done ? t('Completada', 'Completed') : t('Completar tarea', 'Complete task'));
    function check() {
      const out = inputs.filter(({ fl }) => fl.val !== '' && (Number(fl.val) < fl.min || Number(fl.val) > fl.max)).map(({ fl }) => `${fl.label}: ${t('fuera de rango', 'out of range')} (${fl.min}–${fl.max} ${fl.unit})`);
      warn.textContent = out.join(' · ');
      done.disabled = x.done || !inputs.every(({ fl }) => fl.val !== '') || !x.photo;
    }
    check();
    return h('div.mt-detail.gk-scroll', null, h('button.mt-back', { onclick: () => { open = null; render(); } }, '‹ ' + t('Tareas', 'Tasks')), h('h5', null, x.title), h('small.muted', null, x.building),
      ...inputs.map(({ fl, i }) => h('label', null, `${fl.label}${fl.unit ? ` (${fl.unit})` : ''}`, i)), warn, shot, done);
  }
  srvLog(t('Sincronizado', 'Synced'));
  render();
  return () => life.dispose();
}
