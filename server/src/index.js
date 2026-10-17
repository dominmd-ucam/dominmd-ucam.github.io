import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const cfg = loadConfig();
const app = await buildApp(cfg);
if (!cfg.adminToken) app.log.warn('ADMIN_TOKEN ausente o menor de 24 caracteres: el panel de administración está desactivado');
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.close().then(() => process.exit(0)));
await app.listen({ port: cfg.port, host: cfg.host });
