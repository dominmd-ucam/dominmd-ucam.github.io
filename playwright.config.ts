import { defineConfig, devices } from '@playwright/test';

// Pruebas de humo de la web compilada (dist/). En local: npm run build && npm test
export default defineConfig({
  testDir: 'tests',
  timeout: 240_000, // la isla 3D con GPU emulada (CI) tarda en arrancar
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173/', trace: 'off', screenshot: 'only-on-failure' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
});
