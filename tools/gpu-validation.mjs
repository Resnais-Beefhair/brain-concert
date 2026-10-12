import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('evidence', { recursive: true });
const b = await chromium.launch({
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
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await p.goto(new URL('gpu-test.html', process.env.REVIEW_URL || 'http://127.0.0.1:5173/').href);
  await p.waitForFunction(() => window.ready);
  const result = await p.evaluate(async () => {
    const { net } = await window.loadNetwork(() => {});
    const g = await window.GPUBrain.create(net);
    const rate = [80, 80, 4, 4];
    const sum = (a) => a.reduce((s, x) => s + x, 0);
    const first = await g.advance(40, rate);
    await g.reset();
    const second = await g.advance(40, rate);
    const deterministic = first.counts.every((x, i) => x === second.counts[i]);
    await g.reset();
    const a = await g.advance(10, rate),
      b = await g.advance(30, rate);
    const batchInvariant = first.counts.every((x, i) => x === a.counts[i] + b.counts[i]);
    await g.reset();
    g.cut = true;
    const disconnected = await g.advance(50, rate);
    let external = 0,
      internal = 0;
    for (let i = 0; i < net.n; i++) {
      if (net.inputs[i]) external += disconnected.counts[i];
      else internal += disconnected.counts[i];
    }
    g.mute = true;
    const muted = await g.advance(30, rate);
    await g.reset();
    const input = net.inputs.findIndex((x) => (x & 1) !== 0);
    g.silence(input, true);
    const cellSilent = await g.advance(50, [300, 0, 0, 0]);
    await g.reset();
    g.step = 4294967290;
    const wrap = await g.advance(30, [0, 0, 0, 0]);
    const state = new Float32Array(await g.inspectState());
    let finite = true;
    for (let i = 0; i < net.n; i++)
      if (!Number.isFinite(state[i * 4]) || !Number.isFinite(state[i * 4 + 1])) finite = false;
    g.dispose();
    return {
      neurons: net.n,
      edges: net.targets.length,
      deterministic,
      batchInvariant,
      firstSpikes: sum(first.counts),
      external,
      internal,
      mutedSpikes: sum(muted.counts),
      silencedCell: cellSilent.counts[input],
      otherTasteSpikes: sum(cellSilent.counts),
      uint32ClockCrossed: wrap.step > 4294967296,
      wrapSpikes: sum(wrap.counts),
      finite,
    };
  });
  assert(result.deterministic);
  assert(result.batchInvariant);
  assert(result.external > 0);
  assert.equal(result.internal, 0);
  assert.equal(result.mutedSpikes, 0);
  assert.equal(result.silencedCell, 0);
  assert(result.otherTasteSpikes > 0);
  assert(result.uint32ClockCrossed && result.finite);
  assert.equal(result.wrapSpikes, 0);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await fs.writeFile(
    'evidence/gpu-validation.json',
    JSON.stringify({ passed: true, ...result, errors }, null, 2),
  );
  console.log(result);
} finally {
  await b.close();
}
