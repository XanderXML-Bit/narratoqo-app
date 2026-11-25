import { expect, test as base } from '@playwright/test';

const test = base.extend({
  browser: [async ({ playwright }, use) => {
    // Connect to an existing Chromium instance when a CDP endpoint is provided.
    const cdpURL = process.env.PLAYWRIGHT_CDP_URL;
    if (cdpURL) {
      await use(await playwright.chromium.connectOverCDP(cdpURL));
    } else {
      const browser = await playwright.chromium.launch();
      try {
        await use(browser);
      } finally {
        await browser.close();
      }
    }
  }, { scope: 'worker' }],
});

const modelURL = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';
const runtimeURL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
const reportOfflineForSuite = process.env.PLAYWRIGHT_REPORT_OFFLINE === '1';

async function reportOffline(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
}

test.beforeEach(async ({ page }) => {
  if (reportOfflineForSuite) await reportOffline(page);
});

test('the offline banner leaves the new project button clickable', async ({ page }) => {
  if (!reportOfflineForSuite) await reportOffline(page);
  await page.goto('/');
  await expect(page.getByRole('alert').filter({ hasText: /Cloud voices are unavailable/ })).toBeVisible();
  await page.getByRole('button', { name: 'Create new project' }).click({ timeout: 5_000 });
  await expect(page.getByRole('dialog', { name: 'New Project' })).toBeVisible();
});

async function expectAudio(page, timeout) {
  const started = await page.waitForFunction(() => window.firstAudioDuration > 0, null, { timeout });
  await started.dispose();
  return page.evaluate(() => window.firstAudioDuration);
}

test('speed dialog takes focus, wraps Tab, and restores focus when closed', async ({ page }) => {
  test.setTimeout(20_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create new project' }).click();
  const importDialog = page.getByRole('dialog', { name: 'New Project' });
  await importDialog.getByLabel('Text Content').fill('The door opened and the dog went outside.');
  await importDialog.getByRole('button', { name: 'Create Project' }).click();
  await page.getByRole('button', { name: /Open the full player/ }).click();
  const opener = page.getByRole('button', { name: 'Playback speed: 1x' });
  await opener.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Playback speed' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const close = dialog.getByRole('button', { name: 'Close' });
  const last = dialog.getByRole('button', { name: '2x Double speed' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.press('Enter');
  await expect(dialog.getByRole('button', { name: '1x Normal', pressed: true })).toBeVisible();
  await dialog.getByRole('button', { name: '1.5x Faster' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Playback speed: 1.5x' })).toBeFocused();
});

test('sample plays with the local Kokoro fixture and resumes from IndexedDB', async ({ page, context, baseURL }) => {
  let allowFixture = true;
  const served = new Set();
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    const { origin, pathname } = new URL(url);
    if (origin === baseURL) {
      if (!allowFixture && pathname.startsWith('/kokoro-fixture/')) return route.abort();
      return route.continue();
    }
    const prefix = [modelURL, runtimeURL].find((candidate) => url.startsWith(candidate));
    if (!allowFixture || !prefix) return route.abort();
    const asset = url.slice(prefix.length);
    // Stream the fixture over HTTP to keep the model out of the CDP connection.
    await route.fulfill({
      status: 302,
      headers: {
        location: `${baseURL}/kokoro-fixture/${asset}`,
        'access-control-allow-origin': '*',
      },
    });
    served.add(url);
  });

  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLAudioElement && this.src.startsWith('blob:')) {
        this.addEventListener('playing', () => {
          window.firstAudioDuration ??= this.duration;
        }, { once: true });
      }
      return play.call(this);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play the sample chapter' }).click();
  await expect(page).toHaveURL(/\/project\//);
  const firstDuration = await expectAudio(page, 90_000);
  expect(served).toContain(modelURL + 'onnx/model_quantized.onnx');
  expect(served).toContain(modelURL + 'voices/af_heart.bin');

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  allowFixture = false;
  await page.evaluate(async () => {
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  expect(await expectAudio(page, 15_000)).toBe(firstDuration);
});
