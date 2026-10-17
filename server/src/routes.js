import { cleanEmail, cleanText, clientIp, countLinks, ipHash, notify, safeEqual } from './util.js';

/** Rutas REST: libro de visitas moderado, formulario de contacto y administración. */
export function registerRoutes(app, { cfg, db }) {
  const ipOf = (req) => ipHash(clientIp(req, cfg.ipHeader));
  const limit = (max, timeWindow) => ({ config: { rateLimit: { max, timeWindow, keyGenerator: ipOf } } });

  const q = {
    listApproved: db.prepare("SELECT id, name, message, created_at AS createdAt FROM guestbook WHERE status = 'approved' ORDER BY created_at DESC LIMIT 60"),
    insertGuest: db.prepare('INSERT INTO guestbook (name, message, created_at, ip_hash) VALUES (?, ?, ?, ?)'),
    insertContact: db.prepare('INSERT INTO contact (name, email, message, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)'),
    listGuest: db.prepare('SELECT id, name, message, status, created_at AS createdAt FROM guestbook WHERE status = ? ORDER BY created_at DESC LIMIT 200'),
    setStatus: db.prepare('UPDATE guestbook SET status = ? WHERE id = ?'),
    delGuest: db.prepare('DELETE FROM guestbook WHERE id = ?'),
    listContact: db.prepare('SELECT id, name, email, message, handled, created_at AS createdAt FROM contact ORDER BY created_at DESC LIMIT 200'),
    setHandled: db.prepare('UPDATE contact SET handled = ? WHERE id = ?'),
    delContact: db.prepare('DELETE FROM contact WHERE id = ?'),
    counts: db.prepare("SELECT (SELECT COUNT(*) FROM guestbook WHERE status='pending') AS pending, (SELECT COUNT(*) FROM guestbook WHERE status='approved') AS approved, (SELECT COUNT(*) FROM contact WHERE handled=0) AS unread"),
  };

  app.get('/health', async () => ({ ok: true }));

  /* ---------- públicas ---------- */
  app.get('/api/guestbook', limit(60, '1 minute'), async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=30');
    return { entries: q.listApproved.all() };
  });

  const guestSchema = { body: { type: 'object', required: ['name', 'message'], additionalProperties: false, properties: { name: { type: 'string', maxLength: 80 }, message: { type: 'string', maxLength: 600 }, website: { type: 'string', maxLength: 200 } } } };
  app.post('/api/guestbook', { schema: guestSchema, ...limit(3, '1 hour') }, async (req, reply) => {
    const { name, message, website } = req.body;
    if (website) return reply.code(202).send({ ok: true }); // trampa para bots: se acepta pero se descarta
    const n = cleanText(name, { min: 1, max: 40 });
    const m = cleanText(message, { min: 2, max: 280 });
    if (!n || !m) return reply.code(400).send({ error: 'Escribe un nombre (máx. 40) y un mensaje (2–280 caracteres).' });
    if (countLinks(m) > 1 || countLinks(n) > 0) return reply.code(400).send({ error: 'Por favor, no incluyas enlaces en el libro de visitas.' });
    q.insertGuest.run(n, m, Date.now(), ipOf(req));
    notify(cfg, req.log, 'Libro de visitas: pendiente de aprobar', `${n}: ${m}`);
    return reply.code(202).send({ ok: true, pending: true });
  });

  const contactSchema = { body: { type: 'object', required: ['name', 'message'], additionalProperties: false, properties: { name: { type: 'string', maxLength: 120 }, email: { type: 'string', maxLength: 160 }, message: { type: 'string', maxLength: 4000 }, website: { type: 'string', maxLength: 200 } } } };
  app.post('/api/contact', { schema: contactSchema, ...limit(2, '1 hour') }, async (req, reply) => {
    const { name, email, message, website } = req.body;
    if (website) return reply.code(202).send({ ok: true });
    const n = cleanText(name, { min: 1, max: 60 });
    const m = cleanText(message, { min: 5, max: 2000, multiline: true });
    const e = cleanEmail(email);
    if (!n || !m || e === null) return reply.code(400).send({ error: 'Revisa el nombre, el mensaje (mín. 5 caracteres) y el correo (opcional).' });
    q.insertContact.run(n, e, m, Date.now(), ipOf(req));
    notify(cfg, req.log, `Mensaje de contacto de ${n}`, `${e ? `Correo: ${e}\n` : ''}${m}`);
    return reply.code(202).send({ ok: true });
  });

  /* ---------- administración (Bearer ADMIN_TOKEN) ---------- */
  app.register(async (admin) => {
    admin.addHook('onRequest', async (req, reply) => {
      const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (!cfg.adminToken || !safeEqual(given, cfg.adminToken)) return reply.code(401).send({ error: 'No autorizado' });
    });
    const id = (req) => Number(req.params.id);
    // diagnóstico: qué cabeceras de IP llegan a través del túnel o proxy (para elegir IP_HEADER)
    admin.get('/whoami', async (req) => ({ configuredHeader: cfg.ipHeader || '(ninguna)', detectedIpHash: ipOf(req), seen: { 'cf-connecting-ip': !!req.headers['cf-connecting-ip'], 'x-forwarded-for': !!req.headers['x-forwarded-for'], 'x-real-ip': !!req.headers['x-real-ip'] }, headerNames: Object.keys(req.headers).filter((h) => !['authorization', 'cookie'].includes(h)) }));
    admin.get('/summary', limit(60, '1 minute'), async () => q.counts.get());
    admin.get('/guestbook', limit(60, '1 minute'), async (req) => ({ entries: q.listGuest.all(['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending') }));
    admin.post('/guestbook/:id/approve', limit(60, '1 minute'), async (req) => { q.setStatus.run('approved', id(req)); return { ok: true }; });
    admin.post('/guestbook/:id/reject', limit(60, '1 minute'), async (req) => { q.setStatus.run('rejected', id(req)); return { ok: true }; });
    admin.delete('/guestbook/:id', limit(60, '1 minute'), async (req) => { q.delGuest.run(id(req)); return { ok: true }; });
    admin.get('/contact', limit(60, '1 minute'), async () => ({ messages: q.listContact.all() }));
    admin.post('/contact/:id/handled', limit(60, '1 minute'), async (req) => { q.setHandled.run(1, id(req)); return { ok: true }; });
    admin.delete('/contact/:id', limit(60, '1 minute'), async (req) => { q.delContact.run(id(req)); return { ok: true }; });
  }, { prefix: '/admin/api' });
}
