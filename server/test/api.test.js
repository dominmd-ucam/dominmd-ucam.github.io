import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const ORIGIN = 'https://dominmd-ucam.github.io';
const TOKEN = 'a'.repeat(32);

async function setup(extra = {}) {
  const cfg = { ...loadConfig({ DB_FILE: ':memory:', ADMIN_TOKEN: TOKEN, ALLOWED_ORIGINS: ORIGIN, LOG_LEVEL: 'silent' }), ...extra };
  const app = await buildApp(cfg);
  const post = (url, payload, headers = {}) => app.inject({ method: 'POST', url, payload, headers: { origin: ORIGIN, ...headers } });
  const admin = (method, url) => app.inject({ method, url: `/admin/api${url}`, headers: { authorization: `Bearer ${TOKEN}` } });
  return { app, post, admin };
}

test('libro de visitas: moderación de principio a fin', async (t) => {
  const { app, post, admin } = await setup();
  t.after(() => app.close());

  const created = await post('/api/guestbook', { name: '  Ana ', message: '¡Qué isla tan bonita!' });
  assert.equal(created.statusCode, 202);

  // no se ve hasta que se aprueba
  let list = (await app.inject('/api/guestbook')).json();
  assert.equal(list.entries.length, 0);

  assert.equal((await app.inject({ method: 'GET', url: '/admin/api/guestbook' })).statusCode, 401);
  const pending = (await admin('GET', '/guestbook?status=pending')).json().entries;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].name, 'Ana');

  assert.equal((await admin('POST', `/guestbook/${pending[0].id}/approve`)).statusCode, 200);
  list = (await app.inject('/api/guestbook')).json();
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].message, '¡Qué isla tan bonita!');
  assert.equal(list.entries[0].ip_hash, undefined, 'no se expone el hash de IP');
});

test('libro de visitas: validación y enlaces', async (t) => {
  const { app, post } = await setup();
  t.after(() => app.close());
  // el límite (3 por hora y visitante) cuenta también los intentos inválidos, así que cada grupo usa su propio servidor
  assert.equal((await post('/api/guestbook', { name: '', message: 'hola' })).statusCode, 400);
  assert.equal((await post('/api/guestbook', { name: 'X', message: 'a'.repeat(300) })).statusCode, 400);
  assert.equal((await post('/api/guestbook', { name: 'X', message: 'mira https://a.com y https://b.com' })).statusCode, 400);
});

test('libro de visitas: campos extra descartados y trampa para bots', async (t) => {
  const { app, post, admin } = await setup();
  t.after(() => app.close());
  // Fastify elimina los campos que el esquema no declara: se aceptan pero no llegan a la base de datos
  assert.equal((await post('/api/guestbook', { name: 'X', message: 'hola', extra: 1 })).statusCode, 202);
  assert.equal((await admin('GET', '/guestbook?status=pending')).json().entries.length, 1);
  const bot = await post('/api/guestbook', { name: 'Bot', message: 'compra ya', website: 'http://spam.example' });
  assert.equal(bot.statusCode, 202);
  assert.equal((await admin('GET', '/guestbook?status=pending')).json().entries.length, 1, 'el bot no se guarda (sigue habiendo solo 1)');
});

test('límite de envíos por visitante', async (t) => {
  const { app, post } = await setup();
  t.after(() => app.close());
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await post('/api/guestbook', { name: 'Ana', message: `mensaje ${i}` })).statusCode);
  assert.deepEqual(codes, [202, 202, 202, 429]);
});

test('contacto: se guarda, se lista y se marca como atendido', async (t) => {
  const { app, post, admin } = await setup();
  t.after(() => app.close());
  assert.equal((await post('/api/contact', { name: 'Luis', email: 'no-es-un-correo', message: 'Hola, me interesa tu trabajo' })).statusCode, 400);
  assert.equal((await post('/api/contact', { name: 'Luis', email: 'luis@example.com', message: 'Hola, me interesa tu trabajo' })).statusCode, 202);
  const msgs = (await admin('GET', '/contact')).json().messages;
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].email, 'luis@example.com');
  assert.equal((await admin('POST', `/contact/${msgs[0].id}/handled`)).statusCode, 200);
  assert.equal((await admin('GET', '/summary')).json().unread, 0);
});

test('CORS: solo el origen del portfolio', async (t) => {
  const { app } = await setup();
  t.after(() => app.close());
  const ok = await app.inject({ method: 'GET', url: '/api/guestbook', headers: { origin: ORIGIN } });
  assert.equal(ok.headers['access-control-allow-origin'], ORIGIN);
  const bad = await app.inject({ method: 'GET', url: '/api/guestbook', headers: { origin: 'https://evil.example' } });
  assert.equal(bad.headers['access-control-allow-origin'], undefined);
});

test('administración desactivada sin token válido', async (t) => {
  const { app } = await setup({ adminToken: '' });
  t.after(() => app.close());
  const r = await app.inject({ method: 'GET', url: '/admin/api/summary', headers: { authorization: 'Bearer ' } });
  assert.equal(r.statusCode, 401);
});

test('presencia: los visitantes se ven entre sí y se rechaza otro origen', async (t) => {
  const { app } = await setup();
  t.after(() => app.close());
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `ws://127.0.0.1:${app.server.address().port}/ws/presence`;
  const open = (origin = ORIGIN) => new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { origin } });
    const inbox = [];
    ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
    ws.on('open', () => resolve({ ws, inbox }));
    ws.on('error', reject);
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const a = await open(), b = await open();
  a.ws.send(JSON.stringify({ t: 's', x: 5, z: -3, r: 1, m: 0.5, w: false }));
  b.ws.send(JSON.stringify({ t: 'n', n: 'Visitante B' }));
  await wait(450);
  const seenByB = b.inbox.filter((m) => m.t === 'p').flatMap((m) => m.p);
  assert.ok(seenByB.some((row) => row[1] === 5 && row[2] === -3), 'B ve a A');
  const seenByA = a.inbox.filter((m) => m.t === 'p').flatMap((m) => m.p);
  assert.ok(seenByA.some((row) => row[6] === 'Visitante B'), 'A ve el nombre de B');

  // datos inválidos se ignoran y los límites se aplican
  a.ws.send(JSON.stringify({ t: 's', x: 9999, z: 'x', r: 0, m: 0 }));
  a.ws.send('esto no es JSON');
  await wait(150);

  const closed = await new Promise((resolve) => {
    const ws = new WebSocket(url, { headers: { origin: 'https://evil.example' } });
    ws.on('close', (code) => resolve(code));
    ws.on('error', () => resolve('error'));
  });
  assert.ok(closed === 1008 || closed === 'error', 'otro origen rechazado');
  a.ws.close(); b.ws.close();
});
