# Playa del Desarrollador

Portfolio 3D interactivo (Three.js + Vite + TypeScript) desplegado en GitHub Pages.

## Desarrollo
```bash
npm install
npm run dev          # http://localhost:5173
npm run build
```
Parámetros útiles: `?q=low|med|high` (fuerza la calidad) y `?debug` (o F3) para ver FPS, llamadas de dibujo y triángulos.

## Dos versiones
- **Clásica** (por defecto): HTML estático generado en la compilación desde `src/data/profile.json` y `src/data/projects.json` (`scripts/render-classic.mjs`). Indexable, accesible y ligera (~25 KB de JS/CSS).
- **Isla 3D**: se descarga solo al pulsar «Explorar la isla en 3D» (`?modo=3d` o `#isla` entran directamente; `?modo=clasico` fuerza la clásica). Se recuerda la última elección.

## Contacto y CV
Rellena en `src/data/profile.json`:
- `"email"`: tu correo (sale como botón `mailto:` en Contacto y en los datos estructurados).
- `"linkedin"`: la URL completa de tu perfil (`https://www.linkedin.com/in/…`).
- `"cv"`: el nombre del PDF que dejes en `public/` (por ejemplo `"cv.pdf"` para `public/cv.pdf`). Para un CV distinto en inglés, añade `"cv": "cv-en.pdf"` dentro de `profile` en `src/i18n/en/content.json`.

Cada botón aparece solo cuando su campo tiene valor.

## Inglés
`en.html` es la versión inglesa, generada al compilar. Cómo traducir textos nuevos: [src/i18n/README.md](src/i18n/README.md).

## Vista previa al compartir
`public/og-image.jpg` (1200×630) es la imagen que sale en WhatsApp, LinkedIn o X. Si cambia la isla: `npm run build && npm run og:image`.

## Backend opcional (tu servidor)
`server/` es una API pequeña (Node + SQLite, en Docker) con **libro de visitas moderado**, **formulario de contacto** y **visitantes fantasma** en tiempo real. La web funciona igual sin ella: si `API_URL` no está definida al compilar, esas funciones no aparecen. Guía paso a paso en [server/DEPLOY.md](server/DEPLOY.md). Pruebas: `cd server && npm test`.

## Cómo añadir o cambiar un proyecto
Edita `src/data/projects.json`: `type` (`web | bot | plugin | cli | mobile | device`), `short` (nombre que flota sobre su atril), `repo` (`null` si es privado), `credit` y `note` opcionales y `plot`, la parcela de `src/data/zones.json` donde va su atril en la isla. Cada proyecto tiene su demo interactivo en `src/games/<id>.ts` (regístralo en `src/games/index.ts`); el mismo demo se ve en la versión clásica y dentro del juego. La captura de la tarjeta y de la pantalla del atril es `public/projects/<id>.webp` (640×400): se genera desde el demo con `npm run build && npm run captures`, o pon ahí una captura real.

## Qué hay dentro
- `src/world/` — isla, agua, hierba, árboles, estructuras y vida. `dawn.ts` es la luz fija de amanecer.
- `src/world/batch.ts` — fusiona las mallas estáticas para reducir llamadas de dibujo. Lo animado se marca con `userData.dynamic`.
- `src/avatar/` — avatar modular (piezas GLB sobre un esqueleto Mixamo) y su editor.
- `src/world/npc.ts` + `src/data/dialogue.json` — Misu, la gato guía (edita aquí sus diálogos).
- `src/ui/` — menú, diálogos y logros; `src/achievements.ts` define los logros; `src/settings.ts`, los ajustes.
- `src/games/` — un demo interactivo por proyecto (algunos funcionan de verdad: XPath, feeds ATOM/RSS, pixel art, búsqueda en notas, intérprete del depurador).
- `src/entry.ts`, `src/classic.css`, `src/mode.ts` — versión clásica y selector de modo; `src/game.ts` es el juego.
- `src/data/` — perfil, proyectos y diálogos.

## Rendimiento
Resolución adaptativa, sombras a 30 Hz, mallas fusionadas e instanciadas, hierba en bloques con culling y calidad por niveles (Ajustes → Resolución / Efectos / Sombras).

## Pruebas
`npm run build && npm test` lanza las pruebas de humo con Playwright (`tests/smoke.spec.ts`): versión clásica en español e inglés, ficha de proyecto, metadatos para compartir y arranque de la isla 3D, en escritorio y en móvil vertical 390×844.

## Despliegue
Push a `main` → `.github/workflows/deploy.yml` compila, pasa las pruebas y publica en Pages (Settings → Pages → Source: GitHub Actions). Si una prueba falla, no se publica. En los PR se compila y se prueba, sin publicar.

Créditos en [CREDITS.md](CREDITS.md).
