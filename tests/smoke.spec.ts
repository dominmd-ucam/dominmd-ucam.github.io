import { test, expect, type Page } from '@playwright/test';

/** Falla la prueba si la página lanza un error de JavaScript no capturado. */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// el selector de personaje de la primera visita taparía la isla
const skipCharSelect = (page: Page) => page.addInitScript(() => { try { localStorage.setItem('portfolio-avatar-v1', 'null'); } catch { /* */ } });

test.describe('versión clásica', () => {
  test('español: contenido, filtros, ficha de proyecto y metadatos', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./?modo=clasico');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('h1#h-hero')).toContainText('Hola, soy');
    const cards = page.locator('.card[data-type]');
    expect(await cards.count()).toBeGreaterThanOrEqual(10);
    await expect(page.locator('#contacto')).toBeVisible();
    await expect(page.locator('a.lang-switch')).toHaveAttribute('data-lang', 'en');
    // metadatos para compartir el enlace
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-image\.jpg$/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const img = await page.request.get('./og-image.jpg');
    expect(img.status()).toBe(200);
    // la ficha de un proyecto se abre con su demo
    await cards.first().locator('[data-project]').click();
    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('#mTitle')).not.toBeEmpty();
    await page.locator('#mClose').click();
    await expect(page.locator('#modal')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('inglés: en.html traducida y el selector recuerda el idioma', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./en.html?modo=clasico');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1#h-hero')).toContainText("Hi, I'm");
    await expect(page.locator('#h-projects')).toHaveText('Projects');
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_US');
    await page.locator('.card [data-project]').first().click();
    await expect(page.locator('#mTitle')).toHaveText('Clawdmeter Plus (custom version)');
    await page.locator('#mClose').click();
    // volver al español con el selector, y que la elección se recuerde
    await page.locator('a.lang-switch').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.goto('./en.html?modo=clasico');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es'); // redirige a la portada en español
    expect(errors).toEqual([]);
  });
});

test.describe('isla 3D', () => {
  for (const path of ['./?modo=3d', './en.html?modo=3d']) {
    test(`arranca y muestra el HUD (${path})`, async ({ page }) => {
      const errors = trackErrors(page);
      await skipCharSelect(page);
      await page.goto(path);
      // sondeo con evaluate: con la GPU emulada el bucle de render deja sin turno a las esperas basadas en requestAnimationFrame
      await expect.poll(() => page.evaluate(() => document.getElementById('hud')?.hidden === false), { timeout: 200_000, intervals: [2000] }).toBe(true);
      const state = await page.evaluate(() => ({
        canvas: (document.getElementById('gl') as HTMLCanvasElement | null)?.width ?? 0,
        classicHidden: document.getElementById('classic')?.hidden ?? false,
        hint: document.getElementById('hint')?.textContent ?? '',
      }));
      expect(state.canvas).toBeGreaterThan(0);
      expect(state.classicHidden).toBe(true);
      if (path.includes('en.html')) expect(state.hint).toContain('to move');
      expect(errors).toEqual([]);
    });
  }
});
