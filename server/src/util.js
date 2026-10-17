import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';

/* eslint-disable no-control-regex */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** Limpia un texto de usuario: sin caracteres de control ni de dirección, espacios normalizados y longitud acotada. */
export function cleanText(value, { min = 1, max = 280, multiline = false } = {}) {
  if (typeof value !== 'string') return null;
  let s = value.replace(CONTROL, '').normalize('NFC');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  s = s.trim();
  if (s.length < min || s.length > max) return null;
  return s;
}

export function cleanEmail(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return null;
  const s = value.trim().slice(0, 120);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

export const countLinks = (s) => (s.match(/https?:\/\/|www\./gi) ?? []).length;

/** Comparación en tiempo constante (evita filtrar el token por tiempos de respuesta). */
export function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** IP del visitante según la cabecera de confianza configurada. */
export function clientIp(req, ipHeader) {
  if (ipHeader) {
    const v = req.headers[ipHeader];
    const first = (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Hash de la IP con una sal que rota cada día: sirve para limitar abusos y reconocer reincidencias del mismo día,
 * pero no permite seguir a una persona de un día a otro ni recuperar la IP.
 */
const secret = randomBytes(16).toString('hex');
export function ipHash(ip, now = Date.now()) {
  const day = Math.floor(now / 86_400_000);
  return createHash('sha256').update(`${secret}:${day}:${ip}`).digest('hex').slice(0, 16);
}

/** Aviso opcional (Discord y/o ntfy) sin bloquear la respuesta ni fallar si el servicio cae. */
export function notify(cfg, log, title, body) {
  const text = `${title}\n${body}`.slice(0, 1800);
  if (cfg.discordWebhook) {
    fetch(cfg.discordWebhook, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    }).catch((e) => log.warn({ err: String(e) }, 'aviso Discord fallido'));
  }
  if (cfg.ntfyUrl) {
    fetch(cfg.ntfyUrl, { method: 'POST', headers: { Title: title.replace(/[^\x20-\x7E]/g, '') || 'Portfolio' }, body: body.slice(0, 1800), signal: AbortSignal.timeout(5000) })
      .catch((e) => log.warn({ err: String(e) }, 'aviso ntfy fallido'));
  }
}
