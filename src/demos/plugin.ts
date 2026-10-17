import type { DemoHandle, PluginDemo, PluginSetting } from './types';
import { el, time, Timers } from './dom';

/** Panel de ajustes de un plugin dentro de su aplicación anfitriona, con consola en vivo que reacciona a cada cambio. */
export function mountPlugin(host: HTMLElement, spec: PluginDemo): DemoHandle {
  const timers = new Timers();
  const root = el('div', 'dm dm-plugin');
  const title = el('div', 'pl-title');
  title.append(el('b', '', spec.host), el('span', '', spec.plugin));
  const body = el('div', 'pl-body');
  const nav = el('nav', 'pl-nav');
  nav.setAttribute('aria-label', 'Secciones');
  const main = el('div', 'pl-main');
  const side = el('div', 'pl-side');
  const consoleBox = el('div', 'pl-console');
  consoleBox.setAttribute('role', 'log');
  const cmdForm = el('form', 'pl-cmd');
  const cmdInput = el('input');
  cmdInput.type = 'text'; cmdInput.placeholder = '/islandtools info'; cmdInput.autocomplete = 'off';
  cmdInput.setAttribute('aria-label', 'Comando de consola');
  cmdForm.append(el('span', '', '>'), cmdInput);
  side.append(el('h5', '', 'Consola'), consoleBox, cmdForm);
  body.append(nav, main, side);
  root.append(title, body);
  host.append(root);

  const log = (text: string, cls = '') => {
    const row = el('div', `pl-line ${cls}`);
    row.append(el('time', '', time()), document.createTextNode(` ${text}`));
    consoleBox.append(row);
    consoleBox.scrollTop = consoleBox.scrollHeight;
  };
  const state = new Map<string, string | number | boolean>();
  const fmt = (s: PluginSetting, v: string | number | boolean) => (s.kind === 'toggle' ? (v ? 'activado' : 'desactivado') : String(v));

  const control = (s: PluginSetting): HTMLElement => {
    const row = el('div', 'pl-row');
    const label = el('label', '', s.label);
    const id = `pl-${s.id}`;
    label.htmlFor = id;
    const apply = (v: string | number | boolean) => {
      state.set(s.id, v);
      log(`[${spec.plugin.split(' ')[0]}] ${s.log.replace('{value}', fmt(s, v))}`, 'ok');
    };
    if (s.kind === 'toggle') {
      const on = state.get(s.id) as boolean;
      const b = el('button', `pl-switch${on ? ' on' : ''}`);
      b.id = id; b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(on));
      b.addEventListener('click', () => {
        const next = !(state.get(s.id) as boolean);
        b.classList.toggle('on', next); b.setAttribute('aria-checked', String(next));
        apply(next);
      });
      row.append(label, b);
    } else if (s.kind === 'select') {
      const sel = el('select');
      sel.id = id;
      for (const o of s.options) { const opt = el('option', '', o); opt.value = o; opt.selected = o === state.get(s.id); sel.append(opt); }
      sel.addEventListener('change', () => apply(sel.value));
      row.append(label, sel);
    } else {
      const wrap = el('div', 'pl-num');
      const out = el('output', '', String(state.get(s.id))); out.id = id;
      const step = (d: number) => {
        const v = Math.min(s.max, Math.max(s.min, (state.get(s.id) as number) + d * s.step));
        if (v === state.get(s.id)) return;
        out.textContent = String(v); apply(v);
      };
      const minus = el('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', `Reducir ${s.label}`);
      const plus = el('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', `Aumentar ${s.label}`);
      minus.addEventListener('click', () => step(-1));
      plus.addEventListener('click', () => step(1));
      wrap.append(minus, out, plus);
      row.append(label, wrap);
    }
    return row;
  };

  const showSection = (i: number) => {
    [...nav.children].forEach((b, k) => b.classList.toggle('on', k === i));
    main.replaceChildren(...spec.sections[i].settings.map(control));
  };
  spec.sections.forEach((sec, i) => {
    const b = el('button', '', sec.name);
    b.type = 'button';
    b.addEventListener('click', () => showSection(i));
    nav.append(b);
  });
  // los valores persisten entre secciones: se guardan al crear el control
  const seen = new Map<string, boolean>();
  spec.sections.forEach((sec) => sec.settings.forEach((s) => { if (!seen.has(s.id)) { seen.set(s.id, true); state.set(s.id, s.value); } }));
  showSection(0);

  cmdForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = cmdInput.value.trim();
    cmdInput.value = '';
    if (!text) return;
    log(`> ${text}`, 'cmd');
    const hit = spec.commands.find((c) => c.cmd.toLowerCase() === text.toLowerCase());
    (hit ? hit.output : ['Comando desconocido. Prueba: ' + spec.commands.map((c) => c.cmd).join(', ')]).forEach((l, i) => timers.after(120 * (i + 1), () => log(l)));
  });
  spec.boot.forEach((l, i) => timers.after(250 * (i + 1), () => log(l)));
  return { dispose: () => timers.clear() };
}
