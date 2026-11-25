import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node tests/browser/preview.mjs',
    url: baseURL,
  },
});
