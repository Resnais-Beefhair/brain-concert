import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

await fs.mkdir('evidence', { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: true,
  args: [
    '--no-sandbox',
    '--enable-unsafe-webgpu',
    '--use-angle=swiftshader',
    '--enable-features=Vulkan',
    '--disable-vulkan-surface',
  ],
});
const url = process.env.REVIEW_URL || 'http://127.0.0.1:5173/';
const errors = [];
try {
  const page = await browser.newPage({ locale: 'fi-FI', viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url);
  await page.waitForFunction(
    () => window.brainConcertDiagnostics?.running,
    {},
    { timeout: 180_000 },
  );
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('#sound').innerText(), 'Enable sound');
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#quality').inputValue(), 'balanced');
  const initial = await page.evaluate(() => window.brainConcertDiagnostics);
  assert.equal(initial.neurons, 138639);
  assert.equal(initial.edges, 15091983);
  await page.click('[data-input="0"]');
  await page.waitForFunction(() => window.brainConcertDiagnostics.totalSpikes > 0);
  await page.click('#play');
  await page.screenshot({ path: 'evidence/english-app.png' });
  await page.click('#settings');
  await page.selectOption('#quality', 'low');
  await page.waitForFunction(() => window.brainConcertDiagnostics.pixelRatio === 1);
  await page.selectOption('#language', 'fi');
  assert.equal(await page.locator('#sound').innerText(), 'Ääni päälle');
  await page.selectOption('#language', 'en');
  await page.reload();
  await page.waitForFunction(
    () => window.brainConcertDiagnostics?.running,
    {},
    { timeout: 180_000 },
  );
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.click('#play');
  assert.deepEqual(errors, []);
  // No-WebGPU path must explain the requirement and skip the large dataset.
  const fallback = await browser.newPage({ locale: 'fi-FI' });
  await fallback.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  const dataRequests = [];
  fallback.on('request', (request) => {
    if (request.url().includes('/data/')) dataRequests.push(request.url());
  });
  await fallback.goto(url);
  await fallback.locator('#reason').waitFor({ state: 'visible' });
  assert.match(await fallback.locator('#reason').innerText(), /WebGPU is unavailable/);
  assert.deepEqual(dataRequests, []);
  await fallback.screenshot({ path: 'evidence/unsupported-browser.png' });
  await fs.writeFile(
    'evidence/browser-review.json',
    JSON.stringify({ passed: true, initial, errors, fallbackDataRequests: dataRequests }, null, 2),
  );
  console.log(
    'PASS English default, full graph, spikes, controls, saved language, and unsupported-browser path',
  );
} finally {
  await browser.close();
}
