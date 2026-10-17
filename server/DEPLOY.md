# Backend del portfolio: despliegue en tu servidor

API pequeña (Node + SQLite) que da tres cosas a la web: **libro de visitas moderado**, **formulario de contacto** y **visitantes fantasma** en tiempo real. La web funciona igual sin ella: si el servidor cae, esas funciones se ocultan o avisan con calma.

## Qué hay que montar

```
Visitante ──HTTPS/WSS──▶ Cloudflare ──túnel──▶ tu servidor Ubuntu
                                                 └─ Docker: api (127.0.0.1:8787) + cloudflared
```

No se abre ningún puerto en el router y tu IP real no queda expuesta.

## 1. Requisitos

- Ubuntu con **Docker** y **Docker Compose** (`docker compose version`).
- Un **dominio gestionado en Cloudflare** (opción A) o una cuenta de **Tailscale** (opción B, sin dominio).

## 2. Preparar

```bash
git clone https://github.com/dominmd-ucam/dominmd-ucam.github.io.git
cd dominmd-ucam.github.io/server
cp .env.example .env
openssl rand -hex 24        # copia el resultado en ADMIN_TOKEN dentro de .env
nano .env
```

Rellena al menos `ADMIN_TOKEN`. `ALLOWED_ORIGINS` ya apunta a tu GitHub Pages.

## 3A. Con Cloudflare Tunnel (recomendado)

1. En el panel de Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel** (tipo *Cloudflared*).
2. Copia el **token** del túnel a `TUNNEL_TOKEN` en `.env`. Deja `IP_HEADER=cf-connecting-ip`.
3. En *Public hostname*: subdominio `api` de tu dominio → servicio **HTTP** `api:8787`.
4. Arranca:

```bash
docker compose --profile cloudflare up -d --build
curl https://api.tudominio.com/health        # {"ok":true}
```

Los WebSockets funcionan sin ajustes adicionales.

## 3B. Sin dominio: Tailscale con nombre propio (recomendado)

Un contenedor de Tailscale aparte le da a la API **su propio nombre público** (`portfolio-api.TU-TAILNET.ts.net`). Así tu web no apunta al nombre de tu servidor, donde puede haber otros servicios abiertos con Funnel, y solo la API queda expuesta.

1. Crea una clave en <https://login.tailscale.com/admin/settings/keys> (**Generate auth key**, sin *Reusable*, caducidad de 90 días o menos). Funnel y HTTPS deben estar activados en tu red (se comprueba en *DNS* y *Access controls*).
2. Guárdala en `.env` **sin que quede en el historial de la terminal**:

```bash
read -rs -p 'Clave de Tailscale: ' K; echo; sed -i "s|^TS_AUTHKEY=.*|TS_AUTHKEY=$K|" .env; unset K
```

3. Arranca y comprueba:

```bash
docker compose --profile tailscale up -d --build
docker compose logs tailscale | tail -5
curl https://portfolio-api.TU-TAILNET.ts.net/health        # {"ok":true}
```

4. Elige `IP_HEADER`: pregunta a la API qué cabeceras le llegan y ponla en `.env` (suele ser `x-forwarded-for`):

```bash
curl -s -H "Authorization: Bearer TU_ADMIN_TOKEN" https://portfolio-api.TU-TAILNET.ts.net/admin/api/whoami
docker compose up -d        # tras editar .env
```

Si `IP_HEADER` queda vacío tras un proxy, **todos los visitantes parecen la misma IP** y el límite de envíos se aplicaría a todos a la vez.

> Alternativa más simple, pero menos aislada: `sudo tailscale funnel --bg --https=8443 http://127.0.0.1:8787` desde el propio servidor. Ojo: usa el nombre de tu servidor, así que cualquier otro servicio con Funnel en ese nombre quedaría asociado a tu web.

## 4. Conectar la web

La web lee la dirección de la API en el momento de compilar. Guárdala como variable del repositorio y vuelve a desplegar:

```bash
gh variable set API_URL --body "https://api.tudominio.com" -R dominmd-ucam/dominmd-ucam.github.io
gh workflow run deploy.yml -R dominmd-ucam/dominmd-ucam.github.io
```

Sin `API_URL`, la web no muestra ni el libro de visitas ni los fantasmas.

## 5. Moderar

Abre `https://api.tudominio.com/admin`, pega el token y aprueba, rechaza o borra. Los mensajes de contacto aparecen ahí mismo. Si configuraste `DISCORD_WEBHOOK_URL` o `NTFY_URL`, te llega un aviso por cada mensaje nuevo.

## 6. Mantenimiento

| Tarea | Comando |
|---|---|
| Actualizar | `git pull && docker compose up -d --build` |
| Ver registros | `docker compose logs -f api` |
| Copia de seguridad | `docker compose exec api node scripts/backup.mjs /data/backup.db` (queda en `server/data/`) |
| Apagar los fantasmas | `PRESENCE=off` en `.env` y `docker compose up -d` |

Programa la copia con `cron` si te importa conservar el libro de visitas. Los datos viven en `server/data/`.

## Privacidad y seguridad

- No hay cookies ni seguimiento. Las IP **no se guardan**: solo un hash con una sal que cambia cada día, para limitar abusos.
- Las posiciones de los fantasmas viven en memoria y se descartan al desconectar.
- Límite de envíos por visitante (3 mensajes y 2 contactos por hora), CORS restringido a tu web, entrada validada, trampa para bots y sin enlaces en el libro de visitas.
- El contenedor corre sin privilegios, con sistema de archivos de solo lectura y sin puertos expuestos a internet.
- Los mensajes siempre se muestran como texto (nunca como HTML).
