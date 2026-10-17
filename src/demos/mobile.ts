import type { DemoHandle, MobileDemo, MobileTab } from './types';
import { el, Timers } from './dom';

/** Teléfono simulado con barra de pestañas: tarjetas para deslizar, listas y chat con respuestas rápidas. */
export function mountMobile(host: HTMLElement, spec: MobileDemo): DemoHandle {
  const timers = new Timers();
  const root = el('div', 'dm dm-mobile');
  const phone = el('div', 'mb-phone');
  const notch = el('div', 'mb-notch');
  const head = el('div', 'mb-head', spec.app);
  const screen = el('div', 'mb-screen');
  const tabbar = el('nav', 'mb-tabs');
  tabbar.setAttribute('aria-label', 'Secciones de la app');
  phone.append(notch, head, screen, tabbar);
  root.append(phone);
  host.append(root);

  const swipe = (t: Extract<MobileTab, { kind: 'swipe' }>) => {
    const wrap = el('div', 'mb-swipe');
    let i = 0;
    const draw = () => {
      wrap.replaceChildren();
      const c = t.cards[i];
      if (!c) { wrap.append(el('p', 'mb-empty', 'Has visto todos los perfiles por hoy. ¡Vuelve mañana!')); return; }
      const card = el('div', 'mb-card');
      const av = el('div', 'mb-avatar', c.name.slice(0, 1)); av.setAttribute('aria-hidden', 'true');
      card.append(av, el('h4', '', c.name), el('p', '', c.bio));
      const tags = el('div', 'mb-tags'); c.tags.forEach((x) => tags.append(el('span', '', x))); card.append(tags);
      const act = el('div', 'mb-actions');
      const no = el('button', 'no', '✕'); no.type = 'button'; no.setAttribute('aria-label', 'Descartar');
      const yes = el('button', 'yes', '♥'); yes.type = 'button'; yes.setAttribute('aria-label', 'Me gusta');
      const fly = (dir: number, then: () => void) => { card.style.transform = `translateX(${dir * 140}%) rotate(${dir * 18}deg)`; card.style.opacity = '0'; timers.after(260, then); };
      no.addEventListener('click', () => fly(-1, () => { i++; draw(); }));
      yes.addEventListener('click', () => fly(1, () => {
        if (c.match) { wrap.replaceChildren(el('div', 'mb-match', `¡Match con ${c.name}! 🎉`)); timers.after(1400, () => { i++; draw(); }); }
        else { i++; draw(); }
      }));
      act.append(no, yes);
      wrap.append(card, act);
    };
    draw();
    return wrap;
  };

  const list = (t: Extract<MobileTab, { kind: 'list' }>) => {
    const box = el('div', 'mb-list');
    box.append(el('h4', '', t.title));
    for (const it of t.items) {
      const r = el('div', 'mb-item');
      const txt = el('div'); txt.append(el('b', '', it.title), el('span', '', it.sub));
      r.append(txt);
      if (it.tag) r.append(el('em', '', it.tag));
      box.append(r);
    }
    return box;
  };

  const chat = (t: Extract<MobileTab, { kind: 'chat' }>) => {
    const box = el('div', 'mb-chat');
    box.append(el('h4', '', t.with));
    const log = el('div', 'mb-log');
    const add = (text: string, me: boolean) => { log.append(el('div', `mb-bubble${me ? ' me' : ''}`, text)); log.scrollTop = log.scrollHeight; };
    t.messages.forEach((m) => add(m.text, m.from === 'me'));
    const quick = el('div', 'mb-quick');
    t.replies.forEach((r) => {
      const b = el('button', '', r); b.type = 'button';
      b.addEventListener('click', () => { add(r, true); timers.after(700, () => add('😄', false)); });
      quick.append(b);
    });
    box.append(log, quick);
    return box;
  };

  const show = (i: number) => {
    const t = spec.tabs[i];
    [...tabbar.children].forEach((b, k) => b.classList.toggle('on', k === i));
    screen.replaceChildren(t.kind === 'swipe' ? swipe(t) : t.kind === 'list' ? list(t) : chat(t));
  };
  spec.tabs.forEach((t, i) => {
    const b = el('button');
    b.type = 'button';
    b.append(el('span', '', t.icon), el('small', '', t.name));
    b.addEventListener('click', () => show(i));
    tabbar.append(b);
  });
  show(0);
  return { dispose: () => timers.clear() };
}
