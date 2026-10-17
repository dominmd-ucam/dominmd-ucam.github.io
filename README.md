# Playa del Desarrollador

Portfolio 3D interactivo (Three.js + Vite + TypeScript) desplegado en GitHub Pages.

## Desarrollo
```bash
npm install
npm run dev          # http://localhost:5173
npm run build
```
Parámetros útiles: `?q=low|med|high` (fuerza la calidad) y `?debug` (o F3) para ver FPS, llamadas de dibujo y triángulos.

## Qué hay dentro
- `src/world/` — isla, agua, hierba, árboles, estructuras y vida. `dawn.ts` es la luz fija de amanecer.
- `src/world/batch.ts` — fusiona las mallas estáticas para reducir llamadas de dibujo. Lo animado se marca con `userData.dynamic`.
- `src/avatar/` — avatar modular (piezas GLB sobre un esqueleto Mixamo) y su editor.
- `src/world/npc.ts` + `src/data/dialogue.json` — Misu, la gato guía (edita aquí sus diálogos).
- `src/ui/` — menú, diálogos y logros; `src/achievements.ts` define los logros; `src/settings.ts`, los ajustes.
- `src/data/projects.json` — los proyectos de las estaciones.

## Rendimiento
Resolución adaptativa, sombras a 30 Hz, mallas fusionadas e instanciadas, hierba en bloques con culling y calidad por niveles (Ajustes → Resolución / Efectos / Sombras).

## Despliegue
Push a `main` → `.github/workflows/deploy.yml` publica en Pages (Settings → Pages → Source: GitHub Actions).

Créditos en [CREDITS.md](CREDITS.md).
