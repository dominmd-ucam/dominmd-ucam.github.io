import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { renderClassic, renderHead } from './scripts/render-classic.mjs';

const readJson = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

/** Inserta en index.html la versión clásica y las etiquetas meta generadas desde src/data/*.json. */
function classicHtml(): Plugin {
  return {
    name: 'classic-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const profile = readJson('./src/data/profile.json');
        const projects = readJson('./src/data/projects.json');
        const head = renderHead(profile);
        return html
          .replace('<!--@title-->', head.title)
          .replace('<!--@meta-->', head.meta)
          .replace('<!--@classic-->', renderClassic(profile, projects));
      },
    },
  };
}

// base relativa: funciona tanto en usuario.github.io como en usuario.github.io/repo
export default defineConfig({
  base: './',
  plugins: [classicHtml()],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
