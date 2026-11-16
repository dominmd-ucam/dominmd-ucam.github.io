// Genera public/og-image.jpg (1200×630), la imagen que sale al compartir el enlace en WhatsApp, LinkedIn, X…
// Uso: npm run build && npm run og:image   (abre la isla 3D con Playwright, coloca la cámara y hace la captura sin interfaz)
// Si cambia el mapa, vuelve a ejecutarlo. OG_YAW / OG_PITCH / OG_DIST cambian el encuadre.
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const PORT = 4179;
const server = await preview({ preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  // avatar ya elegido: así no sale el selector de personaje de la primera visita
  await page.addInitScript(() => localStorage.setItem('portfolio-avatar-v1', 'null'));
  await page.goto(`http://localhost:${PORT}/?modo=3d`);
  // sondeo manual: con la GPU emulada el bucle de render deja sin turno a waitForSelector
  for (let i = 0; i < 90 && !(await page.evaluate(() => document.getElementById('hud')?.hidden === false)); i++) await page.waitForTimeout(2000);
  await page.waitForTimeout(8000); // que terminen de llegar modelos y sombras
  const cam = { yaw: Number(process.env.OG_YAW ?? 3.2), pitch: Number(process.env.OG_PITCH ?? 0.32), dist: Number(process.env.OG_DIST ?? 13) };
  await page.evaluate((c) => Object.assign(window.__dbg.input, c), cam);
  await page.addStyleTag({ content: `
    #hud,#toasts,#pause,#dialogue,.cs,#avatarPanel,#debug,.coop-btn{display:none!important}
    #og-title{position:fixed;left:40px;bottom:40px;padding:18px 28px;border-radius:18px;background:rgba(255,250,240,.92);color:#0f3440;
      font:700 46px Fredoka,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.18)}
    #og-title small{display:block;font:700 22px Nunito,system-ui,sans-serif;color:#1d7f7c;margin-top:4px}` });
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'og-title';
    el.innerHTML = 'Domin · Portfolio<small>Explora mis proyectos en una isla 3D</small>';
    document.body.append(el);
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'public/og-image.jpg', type: 'jpeg', quality: 84, timeout: 120_000 });
  console.log('public/og-image.jpg listo');
} finally {
  await browser.close();
  server.httpServer.close();
}
