import { h, t, Life, browser, toast, crispCanvas, fmt } from './kit';
import './fitpro.css';

/**
 * FITPro: reservas de clases con aforo real, registro de entrenamientos con su gráfica, plan de nutrición con macros
 * y un coach que responde con tus datos (en el proyecto es la API de Gemini; aquí las respuestas se generan en tu navegador).
 */
interface Klass { id: number; day: number; hour: string; name: string; coach: string; cap: number; taken: number; mine: boolean }
const DAYS = t('Lun Mar Mié Jue Vie', 'Mon Tue Wed Thu Fri').split(' ');
const CLASSES: [number, string, string, string, number, number][] = [
  [0, '07:30', 'Spinning', 'Laura', 20, 18], [0, '19:00', 'CrossFit', 'Dani', 14, 9], [1, '09:00', 'Yoga', 'Marta', 16, 16], [1, '18:30', 'Body Pump', 'Dani', 22, 12],
  [2, '07:30', 'Spinning', 'Laura', 20, 11], [2, '20:00', 'Pilates', 'Marta', 12, 10], [3, '19:00', 'CrossFit', 'Dani', 14, 14], [3, '10:00', 'Zumba', 'Sara', 25, 6],
  [4, '18:00', 'HIIT', 'Sara', 18, 17], [4, '09:00', 'Yoga', 'Marta', 16, 4],
];
const MEALS: Record<string, [string, number, number, number][]> = {
  [t('Desayuno', 'Breakfast')]: [[t('Avena con plátano y yogur', 'Oats with banana and yoghurt'), 22, 68, 9], [t('Tostada integral con huevos', 'Wholegrain toast with eggs'), 24, 35, 16]],
  [t('Comida', 'Lunch')]: [[t('Pollo, arroz y brócoli', 'Chicken, rice and broccoli'), 45, 70, 12], [t('Lentejas con verduras', 'Lentils with vegetables'), 28, 62, 8], [t('Salmón con patata', 'Salmon with potato'), 38, 48, 22]],
  [t('Merienda', 'Snack')]: [[t('Batido de proteína y nueces', 'Protein shake and walnuts'), 30, 10, 14], [t('Fruta y queso fresco', 'Fruit and fresh cheese'), 18, 28, 5]],
  [t('Cena', 'Dinner')]: [[t('Tortilla francesa con ensalada', 'Omelette with salad'), 26, 12, 18], [t('Merluza al horno con verduras', 'Baked hake with vegetables'), 34, 18, 9]],
};

export function mount(host: HTMLElement) {
  const life = new Life();
  const classes: Klass[] = CLASSES.map(([day, hour, name, coach, cap, taken], i) => ({ id: i, day, hour, name, coach, cap, taken, mine: false }));
  const lifts: { day: number; kg: number }[] = [60, 62.5, 62.5, 65, 67.5, 67.5, 70].map((kg, i) => ({ day: i, kg }));
  const pickMeal: Record<string, number> = Object.fromEntries(Object.keys(MEALS).map((k) => [k, 0]));
  const views: Record<string, HTMLElement> = { classes: h('div.fp-v'), progress: h('div.fp-v'), food: h('div.fp-v'), coach: h('div.fp-v.fp-coach') };
  const nav = h('nav.fp-nav', null, h('b.fp-logo', null, 'FIT', h('span', null, 'Pro')), ...([['classes', t('Clases', 'Classes')], ['progress', t('Mi progreso', 'My progress')], ['food', t('Nutrición', 'Nutrition')], ['coach', t('Coach IA', 'AI coach')]] as const).map(([k, l]) => h('button', { 'data-k': k, onclick: () => go(k) }, l)));
  const main = h('div.fp-main.gk-scroll', null, ...Object.values(views));
  const { root } = browser('fitpro.app/socio', 'FITPro', h('div.gk-body.fp', null, nav, main));
  host.append(root);
  let cur = '';
  function go(k: string) { cur = k; nav.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); Object.entries(views).forEach(([n, v]) => { v.hidden = n !== k; }); render(); }
  function render() { ({ classes: renderClasses, progress: renderProgress, food: renderFood, coach: () => {} } as Record<string, () => void>)[cur](); }

  function renderClasses() {
    const mine = classes.filter((c) => c.mine);
    views.classes.replaceChildren(h('div.fp-head', null, h('h4', null, t('Horario de la semana', 'This week\'s timetable')), h('span.pill' + (mine.length ? '.ok' : ''), null, t(`${mine.length} reservas`, `${mine.length} bookings`))),
      h('div.fp-week', null, ...DAYS.map((d, i) => h('div.fp-day', null, h('h5', null, d), ...classes.filter((c) => c.day === i).sort((a, b) => a.hour.localeCompare(b.hour)).map((c) => {
        const full = c.taken >= c.cap && !c.mine;
        return h(`div.fp-class${c.mine ? '.mine' : ''}${full ? '.full' : ''}`, null, h('b', null, c.name), h('small', null, `${c.hour} · ${c.coach}`),
          h('div.fp-cap', null, h('i', { style: `width:${(c.taken / c.cap) * 100}%` })), h('small', null, `${c.taken}/${c.cap}`),
          h('button.btn.sm' + (c.mine ? '.ghost' : ''), { disabled: full, onclick: () => book(c) }, c.mine ? t('Cancelar', 'Cancel') : full ? t('Completa', 'Full') : t('Reservar', 'Book')));
      })))));
  }
  function book(c: Klass) {
    c.mine = !c.mine; c.taken += c.mine ? 1 : -1;
    toast(root, c.mine ? t(`Reservada: ${c.name}, ${DAYS[c.day]} ${c.hour}`, `Booked: ${c.name}, ${DAYS[c.day]} ${c.hour}`) : t('Reserva cancelada: la plaza queda libre', 'Booking cancelled: the spot is free again'), life, c.mine ? 'ok' : 'info');
    render();
  }
  function renderProgress() {
    const kg = h('input', { type: 'number', step: '2.5', value: String(lifts[lifts.length - 1].kg + 2.5), 'aria-label': 'kg' });
    const cv = crispCanvas('fp-chart');
    views.progress.replaceChildren(h('h4', null, t('Press de banca: mejor serie', 'Bench press: best set')), cv.c,
      h('form.fp-log', { onsubmit: (e: Event) => { e.preventDefault(); const v = Number(kg.value); if (!v) return; lifts.push({ day: lifts.length, kg: v }); toast(root, v > Math.max(...lifts.slice(0, -1).map((l) => l.kg)) ? t('¡Nuevo récord personal! 🎉', 'New personal record! 🎉') : t('Entrenamiento registrado', 'Workout logged'), life, 'ok'); render(); } },
        h('label', null, t('Registrar hoy (kg)', 'Log today (kg)'), kg), h('button.btn', { type: 'submit' }, t('Guardar', 'Save'))),
      h('div.fp-stats', null, ...[[t('Récord', 'Record'), Math.max(...lifts.map((l) => l.kg)) + ' kg'], [t('Sesiones', 'Sessions'), String(lifts.length)], [t('Mejora', 'Improvement'), '+' + fmt(((lifts[lifts.length - 1].kg - lifts[0].kg) / lifts[0].kg) * 100, 1) + ' %']].map(([l, v]) => h('div', null, h('b', null, v), h('span', null, l)))));
    requestAnimationFrame(() => {
      const { ctx: g, fit } = cv, { w, h: H } = fit();
      const min = Math.min(...lifts.map((l) => l.kg)) - 5, max = Math.max(...lifts.map((l) => l.kg)) + 5;
      const X = (i: number) => 24 + (i / Math.max(1, lifts.length - 1)) * (w - 40), Y = (v: number) => H - 18 - ((v - min) / (max - min)) * (H - 30);
      g.clearRect(0, 0, w, H); g.font = '10px system-ui'; g.fillStyle = '#98a2b3';
      for (let k = 0; k < 4; k++) { const v = min + (k / 3) * (max - min); g.fillText(fmt(v), 0, Y(v) + 3); g.fillStyle = '#eef1f4'; g.fillRect(24, Y(v), w - 30, 1); g.fillStyle = '#98a2b3'; }
      const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, 'rgba(239,68,68,.25)'); grad.addColorStop(1, 'rgba(239,68,68,0)');
      g.beginPath(); lifts.forEach((l, i) => i ? g.lineTo(X(i), Y(l.kg)) : g.moveTo(X(i), Y(l.kg))); g.lineTo(X(lifts.length - 1), H - 18); g.lineTo(X(0), H - 18); g.fillStyle = grad; g.fill();
      g.beginPath(); lifts.forEach((l, i) => i ? g.lineTo(X(i), Y(l.kg)) : g.moveTo(X(i), Y(l.kg))); g.strokeStyle = '#ef4444'; g.lineWidth = 2.5; g.stroke();
      lifts.forEach((l, i) => { g.beginPath(); g.arc(X(i), Y(l.kg), 3.5, 0, 7); g.fillStyle = '#fff'; g.fill(); g.stroke(); });
    });
  }
  function renderFood() {
    let p = 0, c = 0, f = 0;
    const rows = Object.entries(MEALS).map(([meal, opts]) => {
      const o = opts[pickMeal[meal]]; p += o[1]; c += o[2]; f += o[3];
      return h('div.fp-meal', null, h('small', null, meal), h('b', null, o[0]), h('span.muted', null, `P ${o[1]} g · HC ${o[2]} g · G ${o[3]} g`),
        h('button.btn.ghost.sm', { onclick: () => { pickMeal[meal] = (pickMeal[meal] + 1) % opts.length; render(); } }, '⇄ ' + t('Cambiar', 'Swap')));
    });
    const kcal = p * 4 + c * 4 + f * 9, tot = p + c + f;
    views.food.replaceChildren(h('h4', null, t('Plan de hoy · objetivo: ganar fuerza', 'Today\'s plan · goal: build strength')),
      h('div.fp-food', null, h('div.fp-donut', { style: `background:conic-gradient(#ef4444 0 ${(p / tot) * 100}%,#f59e0b 0 ${((p + c) / tot) * 100}%,#3b82f6 0)` }, h('div', null, h('b', null, fmt(kcal)), h('small', null, 'kcal'))),
        h('ul.fp-leg', null, h('li.p', null, t(`Proteína ${p} g`, `Protein ${p} g`)), h('li.c', null, t(`Hidratos ${c} g`, `Carbs ${c} g`)), h('li.f', null, t(`Grasas ${f} g`, `Fat ${f} g`)))), ...rows);
  }
  /* coach */
  const log = h('div.fp-chat.gk-scroll');
  const q = h('input', { type: 'text', placeholder: t('Pregunta a tu coach…', 'Ask your coach…'), 'aria-label': t('Pregunta', 'Question') });
  views.coach.append(h('div.fp-chathead', null, h('span.fp-av', null, '✦'), h('div', null, h('b', null, 'Coach FITPro'), h('small', null, t('Con IA · conoce tus reservas y tu progreso', 'AI-powered · knows your bookings and progress')))), log,
    h('div.fp-sugg', null, ...[t('¿Qué clases tengo esta semana?', 'Which classes do I have this week?'), t('¿Cómo voy en press de banca?', 'How is my bench press going?'), t('¿Qué ceno hoy?', 'What should I have for dinner?'), t('Recomiéndame una clase', 'Recommend a class')].map((s) => h('button', { onclick: () => ask(s) }, s))),
    h('form.fp-ask', { onsubmit: (e: Event) => { e.preventDefault(); ask(q.value); q.value = ''; } }, q, h('button.btn', { type: 'submit' }, '➤')));
  const msg = (who: string, s: string) => { const b = h(`div.fp-msg.${who}`, null, s); log.append(b); log.scrollTop = log.scrollHeight; return b; };
  async function ask(s: string) {
    s = s.trim(); if (!s) return; msg('me', s);
    const typing = msg('bot', '…'); typing.classList.add('typing');
    await life.wait(700);
    const k = s.toLowerCase(), mine = classes.filter((c) => c.mine);
    let a: string;
    if (/clase|class|reserv|book|semana|week/.test(k) && !/recom/.test(k)) a = mine.length ? t(`Tienes ${mine.length}: ${mine.map((c) => `${c.name} (${DAYS[c.day]} ${c.hour})`).join(', ')}. ¡Bien hecho!`, `You have ${mine.length}: ${mine.map((c) => `${c.name} (${DAYS[c.day]} ${c.hour})`).join(', ')}. Nice!`) : t('Aún no tienes ninguna clase reservada. En «Clases» puedes reservar; el Yoga del viernes a las 9:00 tiene mucho sitio.', 'You haven\'t booked any classes yet. You can book in “Classes”; Friday 9:00 Yoga has plenty of space.');
    else if (/press|banca|bench|progres|récord|record|fuerza|strength/.test(k)) { const best = Math.max(...lifts.map((l) => l.kg)); a = t(`Llevas ${lifts.length} sesiones y tu récord es ${best} kg (+${fmt(best - lifts[0].kg, 1)} kg desde que empezaste). Para seguir subiendo: 4 series de 5 con ${fmt(best * 0.85, 1)} kg y descanso de 3 minutos.`, `You've done ${lifts.length} sessions and your record is ${best} kg (+${fmt(best - lifts[0].kg, 1)} kg since you started). To keep progressing: 4 sets of 5 at ${fmt(best * 0.85, 1)} kg with 3-minute rests.`); }
    else if (/cen|comer|comida|dinner|eat|food|nutri|dieta|diet/.test(k)) { const d = Object.entries(MEALS).slice(-1)[0]; a = t(`Según tu plan: ${d[1][pickMeal[d[0]]][0].toLowerCase()}. Si hoy entrenas fuerte, súmale una ración de hidratos.`, `Per your plan: ${d[1][pickMeal[d[0]]][0].toLowerCase()}. If you train hard today, add a portion of carbs.`); }
    else if (/recom|suger|suggest/.test(k)) { const free = classes.filter((c) => !c.mine && c.taken < c.cap).sort((a2, b) => a2.taken / a2.cap - b.taken / b.cap)[0]; a = t(`Te va bien ${free.name} el ${DAYS[free.day]} a las ${free.hour} con ${free.coach}: complementa la fuerza y quedan ${free.cap - free.taken} plazas.`, `${free.name} on ${DAYS[free.day]} at ${free.hour} with ${free.coach} suits you: it complements strength work and has ${free.cap - free.taken} spots left.`); }
    else a = t('Puedo ayudarte con tus clases, tu progreso de fuerza y tu plan de comidas. Pregúntame por cualquiera de esas cosas.', 'I can help with your classes, your strength progress and your meal plan. Ask me about any of those.');
    typing.classList.remove('typing'); typing.textContent = '';
    for (let i = 0; i <= a.length; i += 3) { if (!life.alive) return; typing.textContent = a.slice(0, i); log.scrollTop = log.scrollHeight; await life.wait(10); }
  }
  msg('bot', t('¡Hola, Ana! Soy tu coach. Puedo ver tus reservas, tu progreso y tu plan de comidas.', 'Hi Ana! I\'m your coach. I can see your bookings, progress and meal plan.'));
  go('classes');
  life.on(window, 'resize', () => { if (cur === 'progress') render(); });
  return () => life.dispose();
}
