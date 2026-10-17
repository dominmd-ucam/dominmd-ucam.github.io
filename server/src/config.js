/** Configuración desde variables de entorno (ver .env.example). */
const list = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '0.0.0.0',
    dbFile: env.DB_FILE ?? './data/portfolio.db',
    /** Orígenes que pueden llamar a la API desde un navegador. */
    allowedOrigins: new Set(list(env.ALLOWED_ORIGINS ?? 'https://dominmd-ucam.github.io')),
    /** Cabecera con la IP real del visitante (cf-connecting-ip con Cloudflare, x-forwarded-for con otros proxies). Vacío = IP del socket. */
    ipHeader: (env.IP_HEADER ?? '').toLowerCase(),
    /** Token de moderación (mínimo 24 caracteres). Sin token, el panel de administración queda desactivado. */
    adminToken: env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 24 ? env.ADMIN_TOKEN : '',
    /** Avisos de mensajes de contacto (opcionales). */
    discordWebhook: env.DISCORD_WEBHOOK_URL ?? '',
    ntfyUrl: env.NTFY_URL ?? '',
    /** Presencia en tiempo real. */
    presence: {
      enabled: (env.PRESENCE ?? 'on') !== 'off',
      maxPlayers: Number(env.PRESENCE_MAX ?? 60),
      maxPerIp: Number(env.PRESENCE_MAX_PER_IP ?? 4),
    },
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
