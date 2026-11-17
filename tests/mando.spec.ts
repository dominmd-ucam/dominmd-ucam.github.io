import { test, expect, devices, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test';

/**
 * Mando por QR con PeerJS de verdad, pero con un broker falso en la prueba (0.peerjs.com no se usa en CI):
 * reenvía OFFER/ANSWER/CANDIDATE entre el PC y el móvil y contesta EXPIRE si la sala no existe.
 * Con `drop` se tiran los CANDIDATE: la conexión directa no llega a abrirse, como con datos móviles sin TURN.
 */
function fakeBroker() {
  const clients = new Map<string, WebSocketRoute>();
  const state = { drop: false };
  let n = 0;
  const attach = async (ctx: BrowserContext) => {
    await ctx.route(/0\.peerjs\.com.*\/peerjs\/id/, (r) => r.fulfill({ body: `movil-${++n}`, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.routeWebSocket(/0\.peerjs\.com/, (ws) => {
      const id = new URL(ws.url()).searchParams.get('id') ?? '';
      if (clients.has(id)) { ws.send(JSON.stringify({ type: 'ID-TAKEN', payload: { msg: 'ocupado' } })); void ws.close(); return; }
      clients.set(id, ws);
      ws.send(JSON.stringify({ type: 'OPEN' }));
      ws.onMessage((raw) => {
        const m = JSON.parse(String(raw)) as { type: string; dst?: string; payload?: unknown };
        if (m.type === 'HEARTBEAT' || (state.drop && m.type === 'CANDIDATE')) return;
        const dst = clients.get(m.dst ?? '');
        if (!dst) { if (m.type === 'OFFER') ws.send(JSON.stringify({ type: 'EXPIRE', src: m.dst })); return; }
        dst.send(JSON.stringify({ type: m.type, src: id, payload: m.payload }));
      });
      ws.onClose(() => { if (clients.get(id) === ws) clients.delete(id); });
    });
  };
  return { attach, state };
}

const padText = (pad: Page) => pad.evaluate(() => document.getElementById('msg')?.textContent ?? '');

test.describe('mando por QR', () => {
  test.skip(({ isMobile }) => !isMobile, 'el mando es la página del móvil: se prueba en 390x844');

  test('una sala que ya no existe dice que se abra el QR nuevo, no que se vuelva a escanear', async ({ context, page }) => {
    const broker = fakeBroker();
    await broker.attach(context);
    await page.goto('./mando.html?sala=ZZZZZ');
    await page.click('#go');
    await expect.poll(() => padText(page), { timeout: 30_000 }).toContain('ya no está abierta en el PC');
    await expect(page.locator('#go')).toHaveText('Reintentar');
  });

  test('sin conexión directa aconseja la misma wifi, y al reintentar entra en la isla', async ({ browser, page, context }) => {
    test.setTimeout(400_000);
    const broker = fakeBroker();
    const pc = await browser.newContext({ ...devices['Desktop Chrome'] });
    await broker.attach(pc);
    await broker.attach(context);
    const host = await pc.newPage();
    await host.addInitScript(() => { try { localStorage.setItem('portfolio-avatar-v1', 'null'); } catch { /* */ } });
    await host.goto('./?modo=3d');
    await expect.poll(() => host.evaluate(() => document.getElementById('hud')?.hidden === false), { timeout: 200_000, intervals: [2000] }).toBe(true);
    await host.evaluate(() => (document.getElementById('coopBtn') as HTMLButtonElement).click());
    await expect.poll(() => host.evaluate(() => document.querySelector('.coop-code b')?.textContent ?? ''), { timeout: 30_000 }).toMatch(/^[A-Z0-9]{5}$/);
    const code = await host.evaluate(() => document.querySelector('.coop-code b')!.textContent!);

    // 1) la red no deja conectar directo: el móvil lo reintenta y acaba aconsejando la misma wifi; el PC también lo avisa
    broker.state.drop = true;
    await page.goto(`./mando.html?sala=${code}`);
    await page.click('#go');
    await expect.poll(() => padText(page), { timeout: 30_000 }).toContain('intento 2 de 3');
    await expect.poll(() => padText(page), { timeout: 120_000, intervals: [2000] }).toContain('misma wifi');
    expect(await host.evaluate(() => document.querySelector('.coop-status')?.textContent ?? '')).toContain('no ha podido conectarse');

    // 2) con la red bien, «Reintentar» entra y aparece el invitado en el PC
    broker.state.drop = false;
    await page.click('#go');
    await expect(page.locator('#ctrl')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => host.evaluate(() => document.querySelectorAll('.coop-list li').length), { timeout: 30_000 }).toBe(1);
    await pc.close();
  });
});
