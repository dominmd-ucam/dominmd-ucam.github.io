import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { renderClassic, renderHead } from './scripts/render-classic.mjs';
import { deepMerge } from './src/i18n/merge.mjs';

const readJson = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

/**
 * Inserta en index.html la versión clásica y las etiquetas meta generadas desde src/data/*.json.
 * en.html es la misma página en inglés: su contenido se ignora y se genera desde index.html con src/i18n/en/*.json.
 */
function classicHtml(): Plugin {
  return {
    name: 'classic-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const lang = /(^|[\\/])en\.html$/.test(ctx.filename) ? 'en' : 'es';
        if (/(^|[\\/])mando\.html$/.test(ctx.filename)) return html;
        const profile = readJson('./src/data/profile.json');
        const projects = readJson('./src/data/projects.json');
        if (lang === 'en') {
          html = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace('<html lang="es">', '<html lang="en">');
          const en = readJson('./src/i18n/en/content.json');
          deepMerge(profile, en.profile);
          for (const p of projects) deepMerge(p, en.projects?.[p.id]);
          // textos fijos del HTML del juego (el resto lo traduce src/i18n/dom.ts al ejecutarse)
          for (const [es, tx] of Object.entries(readJson('./src/i18n/en/ui.json') as Record<string, string>)) {
            html = html.split(`>${es}<`).join(`>${tx}<`).split(`="${es}"`).join(`="${tx}"`);
          }
        }
        const head = renderHead(profile, lang);
        return html
          .replace('<!--@title-->', head.title)
          .replace('<!--@meta-->', head.meta)
          .replace('<!--@classic-->', renderClassic(profile, projects, lang));
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
      input: { main: 'index.html', en: 'en.html', mando: 'mando.html' }, // mando.html: el móvil como mando (src/coop)
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
