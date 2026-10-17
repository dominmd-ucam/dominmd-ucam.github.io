import type { DemoHandle, DeviceDemo, DeviceScreen } from './types';
import { el, Timers } from './dom';

/** Pequeña mascota en pixel art hecha con una cuadrícula de celdas (1 = relleno, 2 = ojo). */
const CRAB = [
  '0010000100',
  '0011111100',
  '0111111110',
  '1112112111',
  '1111111111',
  '0101111010',
  '0100000010',
];

/** Pantalla AMOLED simulada de un dispositivo de escritorio: varias pantallas que se cambian con un toque. */
export function mountDevice(host: HTMLElement, spec: DeviceDemo): DemoHandle {
  const timers = new Timers();
  const root = el('div', 'dm dm-device');
  const bezel = el('div', 'dv-bezel');
  const display = el('button', 'dv-display');
  display.type = 'button';
  display.setAttribute('aria-label', 'Cambiar de pantalla');
  bezel.append(display);
  const dots = el('div', 'dv-dots');
  const note = el('p', 'dv-note', `${spec.name} · simulación. Toca la pantalla para cambiar.`);
  root.append(bezel, dots);
  if (spec.credit) note.append(document.createElement('br'), document.createTextNode(spec.credit));
  root.append(note);
  host.append(root);

  let index = 0;
  let auto: number | null = null;
  let clockTimer: number | null = null;

  const render = (sc: DeviceScreen) => {
    const body = el('div', 'dv-body');
    body.append(el('h4', '', sc.title));
    if (sc.kind === 'usage') {
      sc.meters.forEach((m) => {
        const row = el('div', 'dv-meter');
        const bar = el('i'); bar.style.setProperty('--v', `${m.value}%`);
        const track = el('div', 'dv-track'); track.append(bar);
        const top = el('div', 'dv-mtop'); top.append(el('b', '', m.label), el('span', '', `${m.value}%`));
        row.append(top, track, el('small', '', m.note));
        body.append(row);
      });
    } else if (sc.kind === 'clock') {
      const t = el('div', 'dv-time');
      const upd = () => { t.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: sc.timezone }); };
      upd();
      clockTimer = timers.every(1000, upd);
      body.append(t, el('div', 'dv-city', sc.city), el('div', 'dv-temp', `${sc.temp} · ${sc.desc}`));
    } else if (sc.kind === 'status') {
      sc.items.forEach((it) => { const r = el('div', `dv-svc ${it.state}`); r.append(el('i'), el('span', '', it.name)); body.append(r); });
    } else {
      const grid = el('div', 'dv-pix');
      CRAB.forEach((row) => [...row].forEach((c) => grid.append(el('i', c === '1' ? 'on' : c === '2' ? 'eye' : ''))));
      body.append(grid, el('p', 'dv-line', sc.line));
    }
    return body;
  };

  const show = (i: number) => {
    index = (i + spec.screens.length) % spec.screens.length;
    if (clockTimer !== null) { clearInterval(clockTimer); clockTimer = null; }
    display.replaceChildren(render(spec.screens[index]));
    display.classList.remove('flip'); void display.offsetWidth; display.classList.add('flip');
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === index));
  };
  spec.screens.forEach((_, k) => { const d = el('button'); d.type = 'button'; d.setAttribute('aria-label', `Pantalla ${k + 1}`); d.addEventListener('click', () => { restart(); show(k); }); dots.append(d); });
  const restart = () => { if (auto !== null) clearInterval(auto); auto = timers.every(6000, () => show(index + 1)); };
  display.addEventListener('click', () => { restart(); show(index + 1); });
  show(0);
  restart();
  return { dispose: () => timers.clear() };
}
