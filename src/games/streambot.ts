import { h, t, Life, appWindow, crispCanvas } from './kit';
import './streambot.css';

/**
 * StreamBot: un cliente de chat con canales de texto y de voz. Escribes las órdenes del bot ($play, $yt, $ace, $events…) y el bot
 * responde con sus tarjetas y empieza a emitir en el canal de voz (el vídeo es una escena generada en tu navegador).
 */
const FILES = ['Viaje-a-Japon-2025.mp4', 'Final-torneo-padel.mkv', 'Charla-IA-UMU.mp4'];
const YT = [t('Lofi para programar · directo 24/7', 'Lofi for coding · 24/7 live'), t('Resumen de la jornada de liga', 'Matchday highlights'), t('Cómo funciona Bluetooth LE en 10 minutos', 'How Bluetooth LE works in 10 minutes'), t('Documental: el océano profundo', 'Documentary: the deep ocean')];
const EVENTS = [['Atlético Costa vs Real Meseta', t('Hoy 21:00', 'Today 21:00'), 'acestream://3f9c…a71e'], ['Fórmula 1 · GP de Abu Dabi', t('Dom 14:00', 'Sun 14:00'), 'acestream://b02d…44c1'], ['NBA · Lakers vs Celtics', t('Lun 02:30', 'Mon 02:30'), 'acestream://9a1e…0f3b']];

export function mount(host: HTMLElement) {
  const life = new Life();
  let playing: { title: string; src: string; dur: number; pos: number; paused: boolean } | null = null, lastSearch: string[] = [];
  const msgs = h('div.sb-msgs.gk-scroll', { 'aria-live': 'polite' });
  const input = h('input', { type: 'text', placeholder: t('Escribe en #comandos ($help)', 'Message #commands ($help)'), 'aria-label': t('Mensaje', 'Message'), autocomplete: 'off' });
  const quick = h('div.sb-quick', null, ...['$help', '$play Viaje', '$yt lofi', '$events', '$ace 1', '$pause', '$stop'].map((c) => h('button', { onclick: () => send(c) }, c)));
  const video = crispCanvas('sb-video');
  const vtitle = h('div.sb-vt'), vbar = h('div.sb-vbar', null, h('i')), vtime = h('span.sb-vtime');
  const stage = h('div.sb-stage', null, video.c, h('div.sb-live', null, '● LIVE'), vtitle, h('div.sb-vfoot', null, vbar, vtime));
  const voice = h('div.sb-voice', null, h('div.sb-vhead', null, '🔊 ' + t('Cine', 'Movie night'), h('span.muted', null, '3 ' + t('conectados', 'connected'))), stage,
    h('div.sb-people', null, ...[['StreamBot', '#5865f2', true], ['Domingo', '#e67e22', false], ['Lucía', '#e84393', false]].map(([n, c, bot]) => h('span', null, h('i', { style: `background:${c}` }, String(n)[0]), String(n), bot ? h('b', null, 'BOT') : ''))));
  const side = h('nav.sb-side', null, h('b.sb-server', null, 'Servidor de amigos'), h('small', null, t('CANALES DE TEXTO', 'TEXT CHANNELS')), h('span.on', null, '# ' + t('comandos', 'commands')), h('span', null, '# general'),
    h('small', null, t('CANALES DE VOZ', 'VOICE CHANNELS')), h('span', null, '🔊 ' + t('Cine', 'Movie night')), h('em', null, '🟢 StreamBot'), h('em', null, 'Domingo'), h('em', null, 'Lucía'));
  const chat = h('section.sb-chat', null, h('div.sb-chead', null, '# ' + t('comandos', 'commands')), msgs, quick, h('form.sb-form', { onsubmit: (e: Event) => { e.preventDefault(); send(input.value); input.value = ''; } }, input));
  const tabs = h('div.sb-tabs', null, h('button.on', { onclick: (e: Event) => sw(e, 'chat') }, '# ' + t('comandos', 'commands')), h('button', { onclick: (e: Event) => sw(e, 'voice') }, '🔊 ' + t('Cine', 'Movie night')));
  const body = h('div.gk-body.sb', { 'data-show': 'chat' }, side, chat, voice);
  function sw(e: Event, k: string) { body.dataset.show = k; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); }
  host.append(appWindow(t('Chat · Servidor de amigos', 'Chat · Friends server'), h('div.sb-wrap', null, tabs, body), 'dark sb-app'));

  const post = (who: 'me' | 'bot', ...kids: (Node | string)[]) => {
    const m = h('div.sb-m', null, h('i.sb-av', { style: `background:${who === 'bot' ? '#5865f2' : '#e67e22'}` }, who === 'bot' ? '▶' : 'D'),
      h('div', null, h('div.sb-who', null, who === 'bot' ? 'StreamBot' : 'Domingo', who === 'bot' ? h('b', null, 'BOT') : '', h('small', null, new Date().toTimeString().slice(0, 5))), ...kids));
    msgs.append(m); msgs.scrollTop = msgs.scrollHeight; return m;
  };
  const embed = (title: string, color: string, ...lines: (Node | string)[]) => h('div.sb-embed', { style: `border-color:${color}` }, h('b', null, title), ...lines.map((l) => h('div', null, l)));
  function start(title: string, src: string, dur: number) {
    playing = { title, src, dur, pos: 0, paused: false };
    vtitle.textContent = title;
    post('bot', embed(t('▶ Emitiendo en 🔊 Cine', '▶ Streaming in 🔊 Movie night'), '#3ba55d', title, h('small', null, `${src} · 1080p · 30 fps · H.264`)));
    if (innerWidth < 700) life.after(900, () => (tabs.lastChild as HTMLButtonElement).click());
  }
  async function send(raw: string) {
    const s = raw.trim(); if (!s) return;
    post('me', s);
    const [cmd, ...rest] = s.split(/\s+/); const arg = rest.join(' ');
    if (!cmd.startsWith('$')) return;
    const typing = h('div.sb-typing', null, t('StreamBot está escribiendo…', 'StreamBot is typing…')); msgs.append(typing); msgs.scrollTop = msgs.scrollHeight;
    await life.wait(450); typing.remove();
    switch (cmd.toLowerCase()) {
      case '$help': post('bot', embed(t('Órdenes', 'Commands'), '#5865f2', '$play <archivo> — ' + t('vídeo de la carpeta local', 'video from the local folder'), '$yt <búsqueda> · $ytplay <n> — YouTube', '$ace <n|id> — ' + t('enlace Acestream', 'Acestream link'), '$events — ' + t('próximos eventos', 'upcoming events'), '$pause · $resume · $stop')); break;
      case '$play': {
        const f = FILES.find((x) => x.toLowerCase().includes(arg.toLowerCase())) ?? (arg ? null : FILES[0]);
        if (!f) post('bot', embed(t('Archivo no encontrado', 'File not found'), '#ed4245', t('En la carpeta hay: ', 'The folder has: ') + FILES.join(', ')));
        else start(f, t('carpeta local', 'local folder'), 5400); break;
      }
      case '$yt': {
        lastSearch = YT.filter((v) => v.toLowerCase().includes(arg.toLowerCase())); if (!lastSearch.length) lastSearch = YT;
        post('bot', embed(t(`Resultados para «${arg || '…'}»`, `Results for “${arg || '…'}”`), '#ed4245', ...lastSearch.map((v, i) => `${i + 1}. ${v}`), h('small', null, t('Elige con $ytplay <n>', 'Pick one with $ytplay <n>')))); break;
      }
      case '$ytplay': { const v = lastSearch[Number(arg) - 1]; if (v) start(v, 'YouTube', 2400); else post('bot', t('Primero busca con $yt <búsqueda>.', 'Search first with $yt <query>.')); break; }
      case '$events': post('bot', embed(t('Próximos eventos', 'Upcoming events'), '#faa61a', ...EVENTS.map((e, i) => `${i + 1}. ${e[0]} — ${e[1]}`), h('small', null, t('Emite uno con $ace <n>', 'Stream one with $ace <n>')))); break;
      case '$ace': {
        const e = EVENTS[Number(arg) - 1];
        post('bot', embed(t('Conectando con el motor Acestream…', 'Connecting to the Acestream engine…'), '#faa61a', e ? e[2] : arg || '—', h('small', null, t('buscando pares…', 'finding peers…'))));
        await life.wait(1200); if (!life.alive) return;
        start(e ? e[0] : 'Acestream ' + arg.slice(0, 8), 'Acestream · 38 ' + t('pares', 'peers'), 0); break;
      }
      case '$pause': if (playing) { playing.paused = true; post('bot', '⏸ ' + t('En pausa', 'Paused')); } break;
      case '$resume': if (playing) { playing.paused = false; post('bot', '▶ ' + t('Seguimos', 'Resumed')); } break;
      case '$stop': playing = null; post('bot', '⏹ ' + t('Emisión detenida. Me salgo del canal de voz.', 'Stream stopped. Leaving the voice channel.')); break;
      default: post('bot', t(`No conozco «${cmd}». Prueba $help.`, `I don't know “${cmd}”. Try $help.`));
    }
  }
  /* «vídeo»: escena generada (atardecer con olas o estadio, según el título) */
  life.loop((dt) => {
    const { ctx: g, fit } = video, { w, h: H } = fit();
    if (!playing) {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, H); g.fillStyle = '#72767d'; g.font = '600 13px system-ui'; g.textAlign = 'center';
      g.fillText(t('Nadie está emitiendo. Escribe $play o $events', 'Nobody is streaming. Type $play or $events'), w / 2, H / 2); g.textAlign = 'left';
      stage.classList.remove('on'); vtime.textContent = ''; return;
    }
    stage.classList.add('on');
    if (!playing.paused) playing.pos += dt;
    const tt = playing.pos, sport = /vs|GP|NBA|liga|matchday|torneo|padel/i.test(playing.title);
    if (sport) {
      g.fillStyle = '#2f7d32'; g.fillRect(0, 0, w, H);
      for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#2a722d' : '#338a36'; g.fillRect((k * w) / 8, 0, w / 8, H); }
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.strokeRect(10, 10, w - 20, H - 20); g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, H - 10); g.stroke(); g.beginPath(); g.arc(w / 2, H / 2, H / 6, 0, 7); g.stroke();
      const bx = w / 2 + Math.sin(tt * .9) * w * .35, by = H / 2 + Math.sin(tt * 1.7) * H * .3;
      for (let k = 0; k < 10; k++) { g.fillStyle = k < 5 ? '#e53935' : '#1e88e5'; g.beginPath(); g.arc(bx + Math.sin(tt + k * 1.7) * (40 + k * 9), by + Math.cos(tt * .8 + k) * (20 + k * 5), 5, 0, 7); g.fill(); }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 3.5, 0, 7); g.fill();
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(10, 10, 110, 20); g.fillStyle = '#fff'; g.font = '700 11px system-ui'; g.fillText(`1 - ${Math.floor(tt / 40) % 3}   ${String(Math.floor(tt / 60) + 23).padStart(2, '0')}:${String(Math.floor(tt) % 60).padStart(2, '0')}`, 18, 24);
    } else {
      const sky = g.createLinearGradient(0, 0, 0, H * .6); sky.addColorStop(0, '#2b3a67'); sky.addColorStop(1, '#f2a65a'); g.fillStyle = sky; g.fillRect(0, 0, w, H);
      g.fillStyle = '#ffe3a3'; g.beginPath(); g.arc(w * .65, H * .55, H * .14, 0, 7); g.fill();
      g.fillStyle = '#16425b'; g.fillRect(0, H * .58, w, H * .42);
      for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(255,220,160,.5)'; const y = H * .6 + k * 6; g.fillRect(w * .65 - 40 + Math.sin(tt * 2 + k) * 10, y, 80 - k * 4, 2); }
      g.fillStyle = '#0b1d2a'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * .7); for (let x = 0; x <= w; x += 20) g.lineTo(x, H * .78 + Math.sin(x / 30 + tt) * 4); g.lineTo(w, H); g.fill();
    }
    if (playing.paused) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, w, H); g.fillStyle = '#fff'; g.font = '700 30px system-ui'; g.textAlign = 'center'; g.fillText('❚❚', w / 2, H / 2 + 10); g.textAlign = 'left'; }
    const m = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
    (vbar.firstChild as HTMLElement).style.width = playing.dur ? `${(tt / playing.dur) * 100}%` : '100%';
    vtime.textContent = playing.dur ? `${m(tt)} / ${m(playing.dur)}` : 'LIVE · ' + m(tt);
  });
  post('bot', embed('StreamBot', '#5865f2', t('Listo para emitir en 🔊 Cine. Escribe $help o usa los botones de abajo.', 'Ready to stream in 🔊 Movie night. Type $help or use the buttons below.')));
  return () => life.dispose();
}
