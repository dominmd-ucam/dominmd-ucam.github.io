// Genera public/projects/<id>.webp (640×400): la captura de cada proyecto que sale en las tarjetas de la versión clásica
// y en las pantallas de los atriles del modo 3D. Se hace abriendo el demo de cada proyecto y jugando un poco con él.
// Uso: npm run build && npm run captures            (solo algunos: npm run captures -- atom studens)
// Si tienes una captura real de un proyecto, guárdala con el mismo nombre (640×400, .webp) y no vuelvas a generar esa.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const PORT = 4178;
/** pasos previos a la foto, para que se vea el demo en acción */
const PLAY = {
  clawdmeter: async (p) => { await p.click('.cm-pane .btn'); await p.waitForTimeout(3200); await p.click('.cm-devrow .btn'); await p.waitForTimeout(2400); await p.click('.cm-pane .btn'); await p.waitForTimeout(4000); },
  'vs-immediate': async (p) => { await p.click('.vi-agent-btn'); await p.waitForTimeout(7000); },
  'auto-match': async (p) => { await p.click('.am-run'); await p.waitForTimeout(2600); },
  ganaderia: async (p) => { await p.click('.gn-nav button[data-k="pens"]'); await p.click('.gn-chip >> nth=2'); await p.waitForTimeout(300); },
  'obsidian-rag': async (p) => { await p.waitForTimeout(4500); },
  streambot: async (p) => { await p.click('.sb-quick button >> nth=1'); await p.waitForTimeout(2500); },
  fitpro: async (p) => { await p.click('.fp-class .btn >> nth=1'); await p.waitForTimeout(1200); },
  hosteleria: async (p) => { await p.click('.ho-add >> nth=0'); await p.click('.ho-add >> nth=3'); await p.waitForTimeout(300); },
  elsaview: async (p) => { await p.waitForTimeout(3000); },
  atom: async (p) => { await p.waitForTimeout(500); },
};
const only = process.argv.slice(2);
await mkdir('public/projects', { recursive: true });
const server = await preview({ preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/?modo=clasico`);
  const ids = await page.$$eval('.card [data-project].btn', (b) => b.map((x) => x.dataset.project));
  for (const id of ids) {
    if (only.length && !only.includes(id)) continue;
    await page.click(`.card .btn[data-project="${id}"]`);
    await page.waitForSelector('#mDemo .gk');
    await page.waitForTimeout(900);
    await PLAY[id]?.(page);
    const shot = await page.locator('#mDemo > .gk').screenshot({ type: 'png' });
    // a 640×400 y WebP con el propio navegador (sin dependencias de imagen)
    const webp = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = 640; c.height = 400;
      const g = c.getContext('2d'); const k = Math.max(640 / img.width, 400 / img.height);
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (640 - img.width * k) / 2, 0, img.width * k, img.height * k);
      return c.toDataURL('image/webp', 0.82).split(',')[1];
    }, shot.toString('base64'));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(`public/projects/${id}.webp`, Buffer.from(webp, 'base64'));
    console.log(`public/projects/${id}.webp`);
    await page.click('#mClose');
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
