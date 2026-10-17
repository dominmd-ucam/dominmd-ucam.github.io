import type { BotDemo, BotReply, DemoHandle } from './types';
import { el, richText, Timers } from './dom';

/** Chat simulado tipo Discord: el bot responde a comandos con retardo, "escribiendo…" y tarjetas con campos. */
export function mountBot(host: HTMLElement, spec: BotDemo): DemoHandle {
  const timers = new Timers();
  const root = el('div', 'dm dm-chat');
  const head = el('div', 'ch-head');
  head.append(el('span', 'ch-hash', '#'), el('b', '', spec.channel), el('span', 'ch-sub', `${spec.name} está en línea`));
  const list = el('div', 'ch-list');
  list.setAttribute('role', 'log');
  list.setAttribute('aria-live', 'polite');
  const chips = el('div', 'ch-chips');
  const form = el('form', 'ch-form');
  const input = el('input');
  input.type = 'text'; input.placeholder = `Escribe un comando (p. ej. ${spec.commands[0]?.cmd ?? '/ayuda'})`; input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Mensaje');
  const send = el('button', '', 'Enviar'); send.type = 'submit';
  form.append(input, send);
  root.append(head, list, chips, form);
  host.append(root);

  const scroll = () => { list.scrollTop = list.scrollHeight; };
  const message = (who: string, bot: boolean): HTMLElement => {
    const m = el('div', 'ch-msg');
    const av = el('span', `ch-av${bot ? ' bot' : ''}`, who.slice(0, 1).toUpperCase());
    const body = el('div', 'ch-body');
    body.append(el('b', '', who));
    m.append(av, body);
    list.append(m);
    scroll();
    return body;
  };
  const typing = () => {
    const t = el('div', 'ch-typing', `${spec.name} está escribiendo`);
    t.append(el('i'), el('i'), el('i'));
    list.append(t); scroll();
    return t;
  };
  const botSay = (r: BotReply) => {
    const body = message(spec.name, true);
    if (r.text) { const p = el('p'); richText(p, r.text); body.append(p); }
    if (r.title) {
      const e = el('div', 'ch-embed');
      e.append(el('h6', '', r.title));
      for (const f of r.fields ?? []) { const row = el('div', 'ch-field'); row.append(el('b', '', f.name), el('span', '', f.value)); e.append(row); }
      body.append(e);
    }
    scroll();
  };
  const replySequence = (replies: BotReply[]) => {
    let delay = 0;
    replies.forEach((r) => {
      const t = typing();
      delay += 750;
      timers.after(delay, () => { t.remove(); botSay(r); });
    });
  };

  const run = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const me = message('Tú', false);
    me.append(el('p', '', text));
    const hit = spec.commands.find((c) => c.cmd.toLowerCase() === text.toLowerCase());
    replySequence(hit ? hit.replies : [{ text: spec.fallback }]);
  };

  for (const c of spec.commands) {
    const b = el('button', '', c.cmd);
    b.type = 'button';
    b.addEventListener('click', () => run(c.cmd));
    chips.append(b);
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); run(input.value); input.value = ''; input.focus(); });
  replySequence(spec.intro.map((text) => ({ text })));
  return { dispose: () => timers.clear() };
}
