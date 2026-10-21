import './pad.css';
import { joinRoom, cleanCode, type Link, type HostMsg, type PadMsg } from './link';
import { GUEST_COLORS } from './colors';

/** Mando táctil: joystick y botones que viajan al PC 10 veces por segundo (y al instante cuando cambian). */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const code = cleanCode(params.get('sala') ?? '');
const kind = params.get('enlace') === 'local' ? 'local' : 'peer';
const msg = $('msg'), go = $<HTMLButtonElement>('go'), nameIn = $<HTMLInputElement>('name');

let color = GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)];
try { nameIn.value = localStorage.getItem('pad-name') ?? ''; color = localStorage.getItem('pad-color') ?? color; } catch { /* ignorar */ }
const colors = $('colors');
for (const c of GUEST_COLORS) {
  const b = document.createElement('button');
  b.style.background = c; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c);
  b.setAttribute('aria-checked', String(c === color));
  b.addEventListener('click', () => { color = c; colors.querySelectorAll('button').forEach((o) => o.setAttribute('aria-checked', String(o === b))); });
  colors.append(b);
}
if (!code) { msg.textContent = 'Falta el código de sala: escanea el QR que sale en el PC.'; go.disabled = true; }

let link: Link<HostMsg, PadMsg> | null = null;
const st = { x: 0, y: 0, s: false, j: 0, k: 0 };
let wantOut = false, timer = 0, lock: { release(): Promise<void> } | null = null;
const send = () => link?.send({ t: 'in', ...st });
const buzz = (ms: number) => navigator.vibrate?.(ms);

async function connect() {
  go.disabled = true; msg.textContent = 'Conectando con la isla…';
  try {
    link = await joinRoom(kind, code);
  } catch (e) {
    msg.textContent = `${(e as Error).message}. Vuelve a escanear el QR.`; go.disabled = false; return;
  }
  link.onMessage = (m) => {
    if (m.t === 'dentro') {
      $('join').hidden = true; $('ctrl').hidden = false;
      $('dot').style.background = m.color; $('who').textContent = `J${m.n + 1}`; $('state').textContent = 'En la isla'; buzz(60);
    } else if (m.t === 'lleno') { msg.textContent = 'La partida está llena (máximo 4 invitados).'; wantOut = true; }
    else if (m.t === 'fuera') { wantOut = true; msg.textContent = 'El anfitrión ha cerrado tu mando.'; }
    else if (m.t === 'estado') { $('crouch').classList.toggle('on', m.crouch); $('state').textContent = m.swim ? 'Nadando' : m.crouch ? 'Agachado' : 'En la isla'; }
  };
  link.onClose = () => {
    link = null; clearInterval(timer);
    $('join').hidden = false; $('ctrl').hidden = true; go.disabled = false;
    if (!wantOut) { msg.textContent = 'Se perdió la conexión. Reintentando…'; setTimeout(() => { if (!link) void connect(); }, 2000); }
  };
  link.send({ t: 'hola', name: nameIn.value.trim() || 'Invitado', color });
  clearInterval(timer);
  timer = window.setInterval(send, 100);
}

go.addEventListener('click', () => {
  try { localStorage.setItem('pad-name', nameIn.value.trim()); localStorage.setItem('pad-color', color); } catch { /* ignorar */ }
  wantOut = false;
  void document.documentElement.requestFullscreen?.().catch(() => {});
  void (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
  void connect();
});
$('exit').addEventListener('click', () => { wantOut = true; link?.send({ t: 'adios' }); link?.close(); void lock?.release(); });
$('look').addEventListener('click', () => { link?.send({ t: 'look' }); buzz(20); });
addEventListener('pagehide', () => link?.send({ t: 'adios' }));

/* joystick: se toca en cualquier punto del recuadro y la base aparece bajo el dedo */
const stick = $('stick'), base = $('base'), knob = $('knob');
let sid = -1, ox = 0, oy = 0, runHeld = false;
const R = 60;
stick.addEventListener('pointerdown', (e) => {
  if (sid >= 0) return;
  sid = e.pointerId; stick.setPointerCapture(sid);
  const r = stick.getBoundingClientRect();
  ox = e.clientX; oy = e.clientY;
  base.style.left = `${ox - r.left}px`; base.style.top = `${oy - r.top}px`;
});
stick.addEventListener('pointermove', (e) => {
  if (e.pointerId !== sid) return;
  const dx = e.clientX - ox, dy = e.clientY - oy, len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
  knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  st.x = (dx * k) / R; st.y = -(dy * k) / R;
  const over = len > R * 1.5;
  stick.classList.toggle('sprint', over);
  st.s = runHeld || over;
  send();
});
const release = (e: PointerEvent) => {
  if (e.pointerId !== sid) return;
  sid = -1; st.x = st.y = 0; st.s = runHeld;
  knob.style.transform = ''; base.style.left = base.style.top = ''; stick.classList.remove('sprint');
  send();
};
stick.addEventListener('pointerup', release);
stick.addEventListener('pointercancel', release);

const tap = (id: string, fn: () => void) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); send(); });
tap('jump', () => { st.j++; buzz(25); });
tap('crouch', () => { st.k++; buzz(15); });
const run = $('run');
run.addEventListener('pointerdown', (e) => { e.preventDefault(); runHeld = true; st.s = true; run.classList.add('on'); send(); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) run.addEventListener(ev, () => { runHeld = false; st.s = false; run.classList.remove('on'); send(); });
addEventListener('contextmenu', (e) => e.preventDefault());
