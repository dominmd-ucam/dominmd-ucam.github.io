import type { CliDemo, DemoHandle } from './types';
import { el, Timers } from './dom';

/** Terminal simulada: acepta los comandos del catálogo, historial (↑ ↓), tabulador y reproducción automática de una sesión. */
export function mountCli(host: HTMLElement, spec: CliDemo): DemoHandle {
  const timers = new Timers();
  const root = el('div', 'dm dm-term');
  const bar = el('div', 'tm-bar');
  const dots = el('span', 'br-dots'); dots.append(el('i'), el('i'), el('i'));
  bar.append(dots, el('span', '', spec.prompt.replace(/[$#]\s*$/, '').trim() || 'terminal'));
  const out = el('div', 'tm-out');
  out.setAttribute('role', 'log');
  const line = el('form', 'tm-line');
  const prompt = el('span', 'tm-prompt', spec.prompt);
  const input = el('input');
  input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', 'Comando');
  line.append(prompt, input);
  const tools = el('div', 'tm-tools');
  const names = Object.keys(spec.commands);
  const play = el('button', 'tm-play', '▶ Reproducir demo'); play.type = 'button';
  tools.append(play);
  for (const n of names) { const b = el('button', '', n); b.type = 'button'; b.addEventListener('click', () => { if (!busy) exec(n); }); tools.append(b); }
  root.append(bar, out, line, tools);
  host.append(root);

  let busy = false;
  const history: string[] = [];
  let hIndex = 0;

  const print = (text: string, cls = '') => { out.append(el('div', `tm-row ${cls}`, text || ' ')); out.scrollTop = out.scrollHeight; };
  spec.banner.forEach((b) => print(b, 'dim'));

  const exec = (cmd: string) => {
    const name = cmd.trim();
    if (!name) return;
    history.push(name); hIndex = history.length;
    print(`${spec.prompt} ${name}`, 'cmd');
    if (name === 'clear') { out.replaceChildren(); return; }
    const res = spec.commands[name] ?? [`bash: ${name}: comando no encontrado (prueba 'help')`];
    busy = true;
    res.forEach((l, i) => timers.after(90 * (i + 1), () => { print(l, spec.commands[name] ? '' : 'err'); if (i === res.length - 1) busy = false; }));
  };

  line.addEventListener('submit', (e) => { e.preventDefault(); if (busy) return; const v = input.value; input.value = ''; exec(v); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && history.length) { hIndex = Math.max(0, hIndex - 1); input.value = history[hIndex] ?? ''; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { hIndex = Math.min(history.length, hIndex + 1); input.value = history[hIndex] ?? ''; e.preventDefault(); }
    else if (e.key === 'Tab') {
      const m = names.filter((n) => n.startsWith(input.value));
      if (m.length === 1) input.value = m[0];
      e.preventDefault();
    }
  });
  out.addEventListener('click', () => input.focus());

  // reproducción automática: escribe cada comando letra a letra y lo ejecuta
  play.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    input.value = '';
    let t = 300;
    spec.autoplay.forEach((cmd) => {
      for (let i = 1; i <= cmd.length; i++) timers.after((t += 55), () => { input.value = cmd.slice(0, i); });
      timers.after((t += 350), () => { input.value = ''; busy = false; exec(cmd); busy = true; });
      t += 90 * ((spec.commands[cmd]?.length ?? 1) + 1) + 700;
    });
    timers.after(t, () => { busy = false; });
  });
  return { dispose: () => timers.clear() };
}
