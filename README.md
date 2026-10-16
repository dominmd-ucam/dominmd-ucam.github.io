# Playa del Desarrollador

Portfolio 3D interactivo (Three.js + Vite + TypeScript). Se despliega en GitHub Pages.

## Desarrollo
```bash
npm install
npm run dev        # http://localhost:5173  (?q=low|med|high fuerza la calidad)
npm run build
```

## Añadir un proyecto
Edita `src/data/projects.json` (tipo `web | bot | plugin | cli`, posición `[x, z]` sobre la isla).

## Despliegue
Push a `main` → el workflow `.github/workflows/deploy.yml` publica en Pages.
En GitHub: Settings → Pages → Source: **GitHub Actions**.
