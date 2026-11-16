import { h, t, Life, phone, toast } from './kit';
import './studens.css';

/** Studens: deslizar perfiles de verdad (arrastrando o con botones), match con animación, chat que responde y eventos del campus. */
interface Profile { name: string; age: number; degree: string; bio: string; tags: string[]; likesYou: boolean; hue: number; reply: string[] }
const PROFILES: Profile[] = [
  { name: 'Lucía', age: 21, degree: t('Diseño gráfico', 'Graphic design'), bio: t('Fotografía analógica y cafés largos. ¿Quedamos a estudiar en la biblio?', 'Film photography and long coffees. Study session at the library?'), tags: ['📷 Foto', '🎬 Cine', '☕ Café'], likesYou: true, hue: 330, reply: [t('¡Holaa! Vi que también te gusta la foto 📷', 'Hiii! I saw you\'re into photography too 📷'), t('¿Te vienes el sábado a hacer fotos al puerto?', 'Fancy taking photos at the harbour on Saturday?'), t('¡Genial! Te escribo el viernes 😊', 'Great! I\'ll message you on Friday 😊')] },
  { name: 'Marcos', age: 22, degree: t('Ing. Informática', 'Computer Eng.'), bio: t('Busco equipo para el hackathon de diciembre. Back-end y mucho café.', 'Looking for a team for the December hackathon. Back-end and lots of coffee.'), tags: ['💻 Código', '🎸 Rock', '🏆 Hackathons'], likesYou: true, hue: 210, reply: [t('¡Ey! ¿Te apuntas al hackathon?', 'Hey! Up for the hackathon?'), t('Somos tres, nos falta alguien de front 👀', 'We\'re three, we need a front-end person 👀'), t('Te paso el enlace del grupo 🚀', 'I\'ll send you the group link 🚀')] },
  { name: 'Pablo', age: 20, degree: 'ADE', bio: t('Pádel los jueves y pachangas de fútbol. Siempre falta uno.', 'Padel on Thursdays and casual football. We\'re always one short.'), tags: ['🎾 Pádel', '⚽ Fútbol'], likesYou: false, hue: 140, reply: [] },
  { name: 'Irene', age: 23, degree: t('Medicina', 'Medicine'), bio: t('Senderismo los domingos y series coreanas el resto de la semana.', 'Hiking on Sundays and K-dramas the rest of the week.'), tags: ['🥾 Monte', '📺 Series'], likesYou: true, hue: 25, reply: [t('¡Hola! ¿Haces senderismo?', 'Hi! Do you hike?'), t('Este domingo subimos a la Fuensanta, ¡vente!', 'We\'re hiking up Fuensanta this Sunday, come along!'), t('¡Perfecto, nos vemos! 🥾', 'Perfect, see you! 🥾')] },
  { name: 'Hugo', age: 21, degree: t('Biología', 'Biology'), bio: t('Voluntario en la protectora. Si te gustan los perros, hablamos.', 'Volunteer at the animal shelter. If you like dogs, let\'s talk.'), tags: ['🐶 Perros', '🌱 Naturaleza'], likesYou: false, hue: 95, reply: [] },
];
const EVENTS = [
  { title: t('Bienvenida de curso', 'Welcome party'), sub: t('Jueves 18:00 · Campus', 'Thursday 18:00 · Campus'), going: 142, tag: t('Hoy', 'Today') },
  { title: t('Torneo de pádel', 'Padel tournament'), sub: t('Sábado 10:00 · Pistas', 'Saturday 10:00 · Courts'), going: 28, tag: t('12 plazas', '12 spots') },
  { title: t('Charla: IA en la empresa', 'Talk: AI at work'), sub: t('Martes 17:00 · Aula 3', 'Tuesday 17:00 · Room 3'), going: 64 },
  { title: t('Intercambio de idiomas', 'Language exchange'), sub: t('Miércoles 20:00 · Cafetería', 'Wednesday 20:00 · Cafeteria'), going: 37 },
];

export function mount(host: HTMLElement) {
  const life = new Life();
  let i = 0, tab = 'swipe', chatWith: Profile | null = null;
  const matches: Profile[] = [];
  const convo = new Map<Profile, { me: boolean; text: string }[]>();
  const going = new Set<number>();
  const app = h('div.st-app');
  const ph = phone(app, 'st-phone');
  host.append(ph);

  function render() {
    const nav = h('nav.st-nav', null, ...([['swipe', '🔥', t('Descubrir', 'Discover')], ['chat', '💬', 'Chat'], ['events', '📅', t('Eventos', 'Events')]] as const).map(([k, ic, l]) =>
      h(`button${tab === k ? '.on' : ''}`, { onclick: () => { tab = k; chatWith = null; render(); } }, ic, h('small', null, l), k === 'chat' && matches.length ? h('i', null, String(matches.length)) : '')));
    const head = h('header.st-head', null, h('b', null, 'studens'), h('span', null, t('UMU · Campus Espinardo', 'UMU · Espinardo campus')));
    app.replaceChildren(head, tab === 'swipe' ? swipe() : tab === 'chat' ? (chatWith ? chat(chatWith) : chats()) : events(), nav);
  }
  function card(p: Profile) {
    const initials = p.name[0];
    return h('div.st-card', null, h('div.st-photo', { style: `background:linear-gradient(160deg,hsl(${p.hue},70%,70%),hsl(${p.hue + 40},60%,45%))` }, h('span', null, initials),
      h('i.st-stamp.like', null, 'LIKE'), h('i.st-stamp.nope', null, 'NOPE')),
      h('div.st-info', null, h('b', null, `${p.name}, ${p.age}`), h('small', null, p.degree), h('p', null, p.bio), h('div.st-tags', null, ...p.tags.map((tg) => h('span', null, tg)))));
  }
  function swipe() {
    const box = h('div.st-deck');
    if (i >= PROFILES.length) {
      box.append(h('div.st-empty', null, h('b', null, t('¡Has visto a todos!', 'You\'ve seen everyone!')), h('p', null, t('Vuelve mañana para más perfiles de tu campus.', 'Come back tomorrow for more people from your campus.')), h('button.btn', { onclick: () => { i = 0; render(); } }, t('Volver a empezar', 'Start over'))));
      return box;
    }
    if (PROFILES[i + 1]) { const back = card(PROFILES[i + 1]); back.classList.add('back'); box.append(back); }
    const top = card(PROFILES[i]); box.append(top);
    let x0 = 0, dx = 0, drag = false;
    top.addEventListener('pointerdown', (e) => { drag = true; x0 = e.clientX; top.setPointerCapture(e.pointerId); top.style.transition = 'none'; });
    top.addEventListener('pointermove', (e) => { if (!drag) return; dx = e.clientX - x0; top.style.transform = `translateX(${dx}px) rotate(${dx / 14}deg)`; top.style.setProperty('--like', String(Math.max(0, dx / 90))); top.style.setProperty('--nope', String(Math.max(0, -dx / 90))); });
    const end = () => { if (!drag) return; drag = false; top.style.transition = ''; if (Math.abs(dx) > 80) decide(dx > 0, top); else { top.style.transform = ''; top.style.setProperty('--like', '0'); top.style.setProperty('--nope', '0'); } dx = 0; };
    top.addEventListener('pointerup', end); top.addEventListener('pointercancel', end);
    const btns = h('div.st-btns', null, h('button.nope', { onclick: () => decide(false, top), 'aria-label': t('No', 'Pass') }, '✕'), h('button.like', { onclick: () => decide(true, top), 'aria-label': t('Me gusta', 'Like') }, '♥'));
    return h('div.st-swipe', null, box, btns);
  }
  function decide(like: boolean, el: HTMLElement) {
    const p = PROFILES[i];
    el.style.transform = `translateX(${like ? 420 : -420}px) rotate(${like ? 24 : -24}deg)`; el.style.opacity = '0';
    el.style.setProperty(like ? '--like' : '--nope', '1');
    life.after(260, () => {
      i++;
      if (like && p.likesYou && !matches.includes(p)) { matches.push(p); convo.set(p, []); render(); showMatch(p); }
      else render();
    });
  }
  function showMatch(p: Profile) {
    const ov = h('div.st-match', null, h('b', null, t('¡Es un match!', 'It\'s a match!')), h('p', null, t(`A ${p.name} también le gustas`, `${p.name} likes you too`)),
      h('div.st-pair', null, h('span', null, '🙂'), h('span', { style: `background:hsl(${p.hue},60%,55%)` }, p.name[0])),
      h('button.btn', { onclick: () => { tab = 'chat'; chatWith = p; render(); } }, t('Enviar mensaje', 'Send a message')), h('button.btn.ghost', { onclick: () => ov.remove() }, t('Seguir deslizando', 'Keep swiping')));
    app.append(ov);
  }
  function chats() {
    return h('div.st-list.gk-scroll', null, ...(matches.length ? matches.map((p) => {
      const last = convo.get(p)!.slice(-1)[0];
      return h('button.st-row', { onclick: () => { chatWith = p; render(); } }, h('span.st-av', { style: `background:hsl(${p.hue},60%,55%)` }, p.name[0]), h('div', null, h('b', null, p.name), h('small', null, last ? last.text : t('¡Nuevo match! Di hola 👋', 'New match! Say hi 👋'))));
    }) : [h('p.st-none', null, t('Aún no tienes matches. Desliza a la derecha en Descubrir: Lucía, Marcos e Irene también te darán like.', 'No matches yet. Swipe right in Discover: Lucía, Marcos and Irene will like you back.'))]));
  }
  function chat(p: Profile) {
    const msgs = convo.get(p)!;
    const list = h('div.st-msgs.gk-scroll', null, ...msgs.map((m) => h(`div.st-m.${m.me ? 'me' : 'them'}`, null, m.text)));
    const input = h('input', { type: 'text', placeholder: t('Escribe un mensaje…', 'Type a message…'), 'aria-label': t('Mensaje', 'Message') });
    const quick = [t('¡Hola! 👋', 'Hi! 👋'), t('¡Me apunto!', 'Count me in!'), t('¿Cuándo quedamos?', 'When shall we meet?')];
    const sendMsg = (text: string) => {
      text = text.trim(); if (!text) return;
      msgs.push({ me: true, text }); list.append(h('div.st-m.me', null, text)); list.scrollTop = list.scrollHeight; input.value = '';
      const n = msgs.filter((m) => !m.me).length;
      if (n >= p.reply.length) return;
      const typing = h('div.st-m.them.typing', null, h('i'), h('i'), h('i'));
      life.after(500, () => { list.append(typing); list.scrollTop = list.scrollHeight; });
      life.after(1500 + Math.random() * 700, () => { typing.remove(); msgs.push({ me: false, text: p.reply[n] }); if (chatWith === p) { list.append(h('div.st-m.them', null, p.reply[n])); list.scrollTop = list.scrollHeight; } });
    };
    life.after(0, () => { list.scrollTop = list.scrollHeight; });
    return h('div.st-chat', null, h('div.st-chead', null, h('button', { onclick: () => { chatWith = null; render(); }, 'aria-label': t('Atrás', 'Back') }, '‹'), h('span.st-av', { style: `background:hsl(${p.hue},60%,55%)` }, p.name[0]), h('b', null, p.name), h('small', null, t('en línea', 'online'))),
      list, h('div.st-quick', null, ...quick.map((q) => h('button', { onclick: () => sendMsg(q) }, q))), h('form.st-send', { onsubmit: (e: Event) => { e.preventDefault(); sendMsg(input.value); } }, input, h('button', { type: 'submit', 'aria-label': t('Enviar', 'Send') }, '➤')));
  }
  function events() {
    return h('div.st-list.gk-scroll', null, h('h5', null, t('Próximos eventos', 'Upcoming events')), ...EVENTS.map((e, k) => h('div.st-ev', null, h('div', null, h('b', null, e.title), h('small', null, e.sub), h('small', null, t(`${e.going + (going.has(k) ? 1 : 0)} van`, `${e.going + (going.has(k) ? 1 : 0)} going`))),
      e.tag ? h('span.pill', null, e.tag) : '', h(`button.btn.sm${going.has(k) ? '.ghost' : ''}`, { onclick: () => { going.has(k) ? going.delete(k) : going.add(k); toast(ph, going.has(k) ? t('¡Apuntado! Te avisaremos antes', 'You\'re in! We\'ll remind you') : t('Ya no vas', 'You\'re no longer going'), life, 'ok'); render(); } }, going.has(k) ? t('Voy ✓', 'Going ✓') : t('Me apunto', 'Join')))));
  }
  render();
  return () => life.dispose();
}
