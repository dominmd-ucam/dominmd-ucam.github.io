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

/**
 * Precarga las fuentes que se ven al abrir la página. Sin esto el navegador las descubre al leer el CSS, pinta antes con la fuente de reserva
 * y al llegar las de verdad el texto se recoloca (cambio de diseño acumulado, CLS 0,16 en escritorio). La lista sale del bundle, así que sigue los nombres con hash.
 */
function preloadFonts(): Plugin {
  const wanted = /(fredoka-latin-700|nunito-latin-600|nunito-latin-700)-normal-[\w-]+\.woff2$/;
  return {
    name: 'preload-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle || ctx.path.includes('mando')) return; // el mando no usa estas fuentes
        return Object.keys(ctx.bundle).filter((f) => wanted.test(f)).map((f) => ({
          tag: 'link', injectTo: 'head' as const, attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: './' + f },
        }));
      },
    },
  };
}

// base relativa: funciona tanto en usuario.github.io como en usuario.github.io/repo
export default defineConfig({
  base: './',
  plugins: [classicHtml(), preloadFonts()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    // three y postprocessing van en sus propios archivos: casi nunca cambian entre despliegues, así que quien ya visitó la web
    // los revalida con una petición condicional (304) en vez de bajarlos otra vez cada vez que se toca el código del juego
    rolldownOptions: {
      input: { main: 'index.html', mando: 'mando.html' }, // mando.html: el móvil como mando (src/coop)
      output: {
        codeSplitting: {
          groups: [
            // el motor WebGPU (experimental) va en su propio archivo y solo se descarga si se activa en los ajustes. El resto de three
            // tiene más prioridad: si no, el grupo de WebGPU se llevaría el núcleo como dependencia y lo descargarían todos
            { name: 'three', test: /node_modules[\\/]three[\\/](?!build[\\/]three\.(webgpu|tsl)\.js|examples[\\/]jsm[\\/](tsl|objects[\\/]SkyMesh))/, priority: 30 },
            { name: 'three-webgpu', test: /node_modules[\\/]three[\\/]/, priority: 20 },
            { name: 'postprocessing', test: /node_modules[\\/]postprocessing[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
