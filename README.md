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

## Cómo añadir o cambiar un proyecto
Edita `src/data/projects.json`: `type` (`web | bot | plugin | cli | mobile | device`), `short` (nombre que flota sobre la estación), `repo` (`null` si es privado), `credit` y `note` opcionales, `position` `[x, z]` en la isla (los caminos y los carteles se generan solos) y `demo` con el guion simulado. Los esquemas de cada demo están en `src/demos/types.ts`. El mismo demo se ve en la versión clásica y dentro del juego.

## Qué hay dentro
- `src/world/` — isla, agua, hierba, árboles, estructuras y vida. `dawn.ts` es la luz fija de amanecer.
- `src/world/batch.ts` — fusiona las mallas estáticas para reducir llamadas de dibujo. Lo animado se marca con `userData.dynamic`.
- `src/avatar/` — avatar modular (piezas GLB sobre un esqueleto Mixamo) y su editor.
- `src/world/npc.ts` + `src/data/dialogue.json` — Misu, la gato guía (edita aquí sus diálogos).
- `src/ui/` — menú, diálogos y logros; `src/achievements.ts` define los logros; `src/settings.ts`, los ajustes.
- `src/demos/` — los cuatro demos simulados (navegador, chat de bot, panel de plugin y terminal).
- `src/entry.ts`, `src/classic.css`, `src/mode.ts` — versión clásica y selector de modo; `src/game.ts` es el juego.
- `src/data/` — perfil, proyectos y diálogos.

## Rendimiento
Resolución adaptativa, sombras a 30 Hz, mallas fusionadas e instanciadas, hierba en bloques con culling y calidad por niveles (Ajustes → Resolución / Efectos / Sombras).

## Despliegue
Push a `main` → `.github/workflows/deploy.yml` publica en Pages (Settings → Pages → Source: GitHub Actions).

Créditos en [CREDITS.md](CREDITS.md).
