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
    await cards.first().locator('.btn[data-project]').click();
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

test('los 14 demos de proyectos se abren y funcionan sin errores', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?modo=clasico');
  const ids = await page.locator('.card .btn[data-project]').evaluateAll((b) => b.map((x) => (x as HTMLElement).dataset.project!));
  expect(ids.length).toBe(14);
  for (const id of ids) {
    await page.locator(`.card .btn[data-project="${id}"]`).click();
    await expect(page.locator('#mDemo > .gk')).toBeVisible();
    await page.locator('#mClose').click();
  }
  // un par de demos que funcionan de verdad: XPath y feeds
  await page.locator('.card .btn[data-project="webscraping"]').click();
  await expect(page.locator('.ws-out tbody tr').first()).toBeVisible();
  await page.locator('#mClose').click();
  await page.locator('.card .btn[data-project="atom"]').click();
  await expect(page.locator('.at-item')).toHaveCount(5);
  await page.locator('#mClose').click();
  const shot = await page.request.get('./projects/atom.webp');
  expect(shot.status()).toBe(200);
  expect(errors).toEqual([]);
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
      // los 14 proyectos están en sus parcelas (logro «Explorador» alcanzable)
      expect(await page.evaluate(() => (window as unknown as { __dbg: { interactables: { stations: unknown[] } } }).__dbg.interactables.stations.length)).toBe(14);
      expect(state.classicHidden).toBe(true);
      if (path.includes('en.html')) expect(state.hint).toContain('to move');
      // Ajustes → MOSTRAR FPS enciende el contador
      await page.evaluate(() => (window as unknown as { __dbg: { settings: { set(k: string, v: boolean): void } } }).__dbg.settings.set('fps', true));
      await expect.poll(() => page.evaluate(() => document.getElementById('debug')?.textContent ?? ''), { timeout: 60_000, intervals: [1000] }).toMatch(/fps[\s\S]*(llamadas|draws)/);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('misiones y puzles', () => {
  test('las losas, los tótems y el cofre funcionan y las misiones avanzan', async ({ page }, info) => {
    test.skip(info.project.name !== 'escritorio', 'la lógica es la misma en móvil; basta con una pasada');
    const errors = trackErrors(page);
    await skipCharSelect(page);
    await page.goto('./?modo=3d');
    await expect.poll(() => page.evaluate(() => document.getElementById('hud')?.hidden === false), { timeout: 200_000, intervals: [2000] }).toBe(true);
    type Dbg = { player: { group: { position: { set(x: number, y: number, z: number): void } } }; heightAt(x: number, z: number): number; puzzles: { plateCenters: number[][]; plateStep: number; plateOn: number; debugTotems(s: number[]): void; state: Record<string, boolean> }; quests: { current: { id: string } | null } };
    // tracker visible con la primera misión
    await expect.poll(() => page.evaluate(() => document.getElementById('quest')?.textContent ?? '')).toContain('Misu');
    // losas del eco: pisar en el orden 2, 0, 3, 1 (saliendo de cada una)
    const plates = await page.evaluate(() => ((window as unknown as { __dbg: Dbg }).__dbg).puzzles.plateCenters);
    const goTo = (x: number, z: number) => page.evaluate(([x, z]) => { const d = (window as unknown as { __dbg: Dbg }).__dbg; d.player.group.position.set(x, d.heightAt(x, z), z); }, [x, z]);
    const plate = () => page.evaluate(() => { const p = (window as unknown as { __dbg: Dbg }).__dbg.puzzles; return [p.plateStep, p.plateOn]; });
    for (const [k, i] of [2, 0, 3, 1].entries()) {
      // las losas se comprueban en el bucle de render: se espera a que lo note antes de salir de ella
      await goTo(plates[i][0], plates[i][1]);
      await expect.poll(plate, { timeout: 20_000 }).toEqual([k + 1, i]);
      await goTo(plates[i][0] + 1, plates[i][1] + 1);
      await expect.poll(plate, { timeout: 20_000 }).toEqual([k + 1, -1]);
    }
    await expect.poll(() => page.evaluate(() => (window as unknown as { __dbg: Dbg }).__dbg.puzzles.state.east), { timeout: 20_000 }).toBe(true);
    // tótems: misma ruta que con E (girar cada uno hasta su símbolo)
    await page.evaluate(() => (window as unknown as { __dbg: Dbg }).__dbg.puzzles.debugTotems([1, 2, 3]));
    expect(await page.evaluate(() => (window as unknown as { __dbg: Dbg }).__dbg.puzzles.state.west)).toBe(true);
    // cofre: acercarse y pulsar E
    const chest = await page.evaluate(() => { const s = (window as unknown as { __dbg: { puzzles: { spots: { x: number; z: number }[] } } }).__dbg.puzzles.spots; return s[s.length - 1]; });
    await page.evaluate(([x, z]) => { const d = (window as unknown as { __dbg: Dbg }).__dbg; d.player.group.position.set(x, d.heightAt(x, z), z); }, [chest.x + 1.4, chest.z + 0.6]);
    await expect.poll(() => page.evaluate(() => document.getElementById('prompt')?.textContent ?? ''), { timeout: 20_000 }).toContain('Abrir el cofre');
    await page.keyboard.press('e');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __dbg: Dbg }).__dbg.puzzles.state.chest), { timeout: 20_000 }).toBe(true);
    expect(errors).toEqual([]);
  });
});
