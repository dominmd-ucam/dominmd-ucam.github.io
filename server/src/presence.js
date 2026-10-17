import { randomBytes } from 'node:crypto';
import { clientIp, cleanText, ipHash } from './util.js';

const WORLD = 60;                // límite del mundo (m) en cada eje
const TICK_MS = 100;             // frecuencia de difusión
const FULL_EVERY = 20;           // cada N ticks se envía el estado completo (reconciliación)
const IDLE_MS = 30_000;          // sin mensajes durante este tiempo se cierra la conexión
const MAX_MSGS_PER_SEC = 25;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Presencia en tiempo real: cada visitante envía su posición y recibe la de los demás.
 * Todo vive en memoria: no se guarda ninguna posición, ni IP, ni historial.
 */
export function registerPresence(app, { cfg }) {
  if (!cfg.presence.enabled) return { count: () => 0 };
  const players = new Map();      // id -> estado
  const perIp = new Map();        // ipHash -> conexiones
  let tick = 0;

  const send = (p, msg) => { if (p.socket.readyState === 1) p.socket.send(JSON.stringify(msg)); };
  const row = (p) => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.r.toFixed(2), +p.m.toFixed(2), p.w ? 1 : 0, p.name];

  const timer = setInterval(() => {
    tick++;
    const full = tick % FULL_EVERY === 0;
    const now = Date.now();
    for (const p of players.values()) {
      if (now - p.last > IDLE_MS) { p.socket.close(1001, 'inactivo'); continue; }
    }
    for (const p of players.values()) {
      const rows = [];
      for (const o of players.values()) if (o !== p && (full || o.dirty)) rows.push(row(o));
      if (rows.length || full) send(p, { t: 'p', n: players.size, p: rows });
    }
    for (const o of players.values()) o.dirty = false;
  }, TICK_MS);
  app.addHook('onClose', async () => clearInterval(timer));

  app.get('/ws/presence', { websocket: true }, (socket, req) => {
    const origin = req.headers.origin;
    const ih = ipHash(clientIp(req, cfg.ipHeader));
    if ((origin && !cfg.allowedOrigins.has(origin)) || players.size >= cfg.presence.maxPlayers || (perIp.get(ih) ?? 0) >= cfg.presence.maxPerIp) {
      socket.close(1008, 'no permitido');
      return;
    }
    perIp.set(ih, (perIp.get(ih) ?? 0) + 1);
    const me = { id: randomBytes(3).toString('hex'), socket, x: 0, z: 0, r: 0, m: 0, w: false, name: '', last: Date.now(), dirty: true, win: 0, winStart: Date.now() };
    players.set(me.id, me);
    send(me, { t: 'hi', id: me.id, n: players.size });

    socket.on('message', (raw) => {
      const now = Date.now();
      if (now - me.winStart > 1000) { me.winStart = now; me.win = 0; }
      if (++me.win > MAX_MSGS_PER_SEC) { socket.close(1008, 'demasiados mensajes'); return; }
      me.last = now;
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg?.t === 's') {
        const x = num(msg.x), z = num(msg.z), r = num(msg.r), m = num(msg.m);
        if (x === null || z === null || r === null || m === null) return;
        me.x = clamp(x, -WORLD, WORLD); me.z = clamp(z, -WORLD, WORLD); me.r = r % (Math.PI * 2); me.m = clamp(m, 0, 1.5); me.w = !!msg.w; me.dirty = true;
      } else if (msg?.t === 'n') {
        me.name = cleanText(msg.n, { min: 1, max: 20 }) ?? ''; me.dirty = true;
      }
    });
    socket.on('close', () => {
      players.delete(me.id);
      perIp.set(ih, Math.max(0, (perIp.get(ih) ?? 1) - 1));
      for (const o of players.values()) send(o, { t: 'bye', id: me.id });
    });
    socket.on('error', () => socket.close());
  });

  return { count: () => players.size };
}
