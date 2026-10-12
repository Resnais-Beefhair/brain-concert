import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const output = 'evidence/ci-browser';
await fs.mkdir(output, { recursive: true });
// Synthetic data is intercepted by the test browser, never written into public/data.
const n = 16,
  files = {};
const positions = new Float32Array(n * 4);
for (let i = 0; i < n; i++) positions.set([Math.cos(i) * 40, Math.sin(i) * 30, i - 8, 1], i * 4);
for (const [name, data] of Object.entries({
  'offsets.bin': Uint32Array.from({ length: n + 1 }, (_, i) => i),
  'targets.bin': Uint32Array.from({ length: n }, (_, i) => (i + 1) % n),
  'weights.bin': Int32Array.from({ length: n }, () => 10),
  'inputs.bin': Uint32Array.from({ length: n }, (_, i) => 1 << (i % 4)),
  'positions.bin': positions,
}))
  files[name] = Buffer.from(data.buffer);
const ids = Array.from({ length: n }, (_, i) => String(90071992547409931n + BigInt(i)));
files['metadata.json'] = Buffer.from(
  JSON.stringify({
    ids,
    labels: ids.map((_, i) => 'Test cell ' + i),
    classes: ids.map(() => 'synthetic'),
  }),
);
const manifest = {
  schemaVersion: 2,
  neurons: n,
  edgeRows: n,
  synapses: 160,
  positionedNeurons: n,
  unpositionedIds: [],
  inputCounts: { taste: 4, vibration: 4, light: 4, scent: 4 },
  totalBytes: Object.values(files).reduce((v, b) => v + b.length, 0),
  files: Object.fromEntries(
    Object.entries(files).map(([key, b]) => [
      key,
      { bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') },
    ]),
  ),
};
files['manifest.json'] = Buffer.from(JSON.stringify(manifest));
let browser, server;
const errors = [];
const report = { passed: false, syntheticNeurons: n, cases: [], errors };
try {
  // Own the entire server/browser lifecycle, including failing assertions.
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  browser = await chromium.launch({
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
  const fallback = await browser.newPage();
  await fallback.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  const requests = [];
  fallback.on('request', (r) => {
    if (r.url().includes('/data/')) requests.push(r.url());
  });
  await fallback.goto(url);
  await fallback.locator('#reason').waitFor({ state: 'visible' });
  assert.match(await fallback.locator('#reason').innerText(), /WebGPU is unavailable/);
  assert.deepEqual(requests, []);
  await fallback.screenshot({ path: `${output}/unsupported.png` });
  report.cases.push('unsupported WebGPU skips data');
  await fallback.close();
  const failed = await browser.newPage();
  await failed.route('**/data/manifest.json', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await failed.goto(url);
  await failed.locator('#reason').waitFor({ state: 'visible' });
  assert.match(await failed.locator('#reason').innerText(), /could not be loaded/);
  assert.doesNotMatch(await failed.locator('#reason').innerText(), /Error:|DATA_/);
  await failed.selectOption('#language', 'fi');
  assert.match(await failed.locator('#reason').innerText(), /lataus epäonnistui/);
  report.cases.push('localized loading failure');
  await failed.close();
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/data/*', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    return route.fulfill({
      status: 200,
      body: files[name],
      contentType: name.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.brainConcertDiagnostics?.running, {}, { timeout: 60000 });
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#language').getAttribute('aria-label'), 'Language');
  await page.click('#play');
  await page.click('#settings');
  for (const [id, value] of Object.entries({
    environment: 'storm',
    palette: 'organ',
    colour: 'prism',
    quality: 'low',
  }))
    await page.selectOption('#' + id, value);
  await page.locator('#speed').fill('60');
  await page.locator('#gentle').check();
  await page.locator('#drift').uncheck();
  await page.click('#settings');
  await page.click('[data-mode="threads"]');
  await page.click('#settings');
  await page.click('#reset');
  await page.waitForFunction(() => document.getElementById('palette').value === 'glass');
  const controls = await page.evaluate(() =>
    Object.fromEntries(
      ['environment', 'palette', 'colour', 'quality', 'speed', 'gentle', 'drift'].map((id) => {
        const el = document.getElementById(id);
        return [id, el.type === 'checkbox' ? el.checked : el.value];
      }),
    ),
  );
  assert.deepEqual(controls, {
    environment: 'tide',
    palette: 'glass',
    colour: 'ember',
    quality: 'balanced',
    speed: '25',
    gentle: false,
    drift: true,
  });
  assert.equal(await page.locator('[data-mode="bloom"]').getAttribute('aria-pressed'), 'true');
  report.cases.push('all model/view controls reset');
  await page.selectOption('#environment', 'storm');
  await page.selectOption('#palette', 'organ');
  await page.selectOption('#colour', 'prism');
  await page.locator('#speed').fill('60');
  await page.click('#settings');
  await page.click('#inspect');
  await page.fill('#search', ids[3]);
  await page.locator('#results button').first().click();
  await page.click('#settings');
  await page.click('#share');
  await page.waitForFunction(() =>
    document.getElementById('toast').textContent.startsWith('Settings link copied'),
  );
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(shared.includes('neuron=' + ids[3]));
  await page.goto('about:blank');
  await page.goto(shared);
  await page.waitForFunction(() => window.brainConcertDiagnostics?.running, {}, { timeout: 60000 });
  await page.click('#play');
  assert.equal(await page.locator('#palette').inputValue(), 'organ');
  assert.equal(await page.locator('#environment').inputValue(), 'storm');
  assert.equal(await page.locator('#colour').inputValue(), 'prism');
  assert.equal(await page.locator('#speed').inputValue(), '60');
  assert.equal(await page.locator('#cell-id').innerText(), ids[3]);
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
  report.cases.push('share restores settings and exact ID, never sound');
  await page.selectOption('#language', 'fi');
  assert.equal(await page.locator('#language').getAttribute('aria-label'), 'Kieli');
  assert.equal(
    await page.locator('#github').getAttribute('href'),
    'https://github.com/Resnais-Beefhair/brain-concert',
  );
  const immutable = await page.evaluate(() => {
    const old = window.brainConcertDiagnostics;
    try {
      old.errors.push('mutated');
    } catch {}
    try {
      old.neurons = -1;
    } catch {}
    return (
      window.brainConcertDiagnostics.neurons === 16 &&
      !window.brainConcertDiagnostics.errors.includes('mutated')
    );
  });
  assert.ok(immutable);
  report.cases.push('localized accessibility and readonly diagnostics');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `${output}/app-${width}.png` });
    const box = await page.locator('#github').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width);
    for (const id of ['settings', 'language']) {
      assert.ok(
        await page.locator('#' + id).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit === el || el.contains(hit);
        }),
        `Header ${id} must remain usable at ${width}px with a drawer open`,
      );
    }
  }
  await page.click('#settings');
  const download = page.waitForEvent('download');
  await page.click('#export');
  const file = await download;
  await file.saveAs(`${output}/events.json`);
  const exported = JSON.parse(await fs.readFile(`${output}/events.json`, 'utf8'));
  assert.ok(Array.isArray(exported.events));
  assert.equal(exported.droppedEvents, 0);
  report.cases.push('JSON event export');
  assert.deepEqual(errors, []);
  report.passed = true;
  console.log('PASS', report.cases);
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  await fs.writeFile(`${output}/result.json`, JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  if (server) await server.close();
}
