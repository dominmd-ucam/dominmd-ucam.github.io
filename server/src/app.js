import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { readFileSync } from 'node:fs';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { registerRoutes } from './routes.js';
import { registerPresence } from './presence.js';

const adminHtml = readFileSync(new URL('./admin.html', import.meta.url), 'utf8');

/** Construye la aplicación (separada de `listen` para poder probarla). */
export async function buildApp(cfg = loadConfig()) {
  const app = Fastify({ logger: { level: cfg.logLevel }, bodyLimit: 16 * 1024, trustProxy: false });
  const db = openDb(cfg.dbFile);
  app.addHook('onClose', async () => db.close());

  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || cfg.allowedOrigins.has(origin)),
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization'],
  });
  await app.register(rateLimit, { global: false });
  await app.register(websocket, { options: { maxPayload: 512 } });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
  });

  registerRoutes(app, { cfg, db });
  const presence = registerPresence(app, { cfg });
  app.get('/api/presence', async () => ({ online: presence.count() }));

  // panel de moderación (la página es estática; las acciones exigen el token)
  app.get('/admin', async (_req, reply) => reply
    .header('content-security-policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'")
    .type('text/html; charset=utf-8').send(adminHtml));

  return app;
}
