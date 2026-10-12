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
    const net = (w) => ({
      n: 2,
      offsets: new Uint32Array([0, 1, 1]),
      targets: new Uint32Array([1]),
      weights: new Int32Array([w]),
      inputs: new Uint32Array(2),
      positions: new Float32Array(8),
      ids: ['1', '2'],
      labels: ['in', 'out'],
      classes: ['', ''],
    });
    const tests = [];
    for (const w of [364, -364, 20, 0]) {
      const g = await window.GPUBrain.create(net(w));
      g.inject(0, 20);
      let c = [0, 0];
      for (let k = 0; k < 2; k++) {
        const f = await g.advance(50, [0, 0, 0, 0]);
        c = c.map((x, i) => x + f.counts[i]);
      }
      const state = new Float32Array(await g.inspectState());
      tests.push({ w, counts: c, v: [state[0], state[4]], g: [state[1], state[5]] });
      g.dispose();
    }
    return tests;
  });
  const reference = JSON.parse(await fs.readFile('evidence/cpu-fixtures.json'));
  for (let k = 0; k < result.length; k++) {
    assert.deepEqual(result[k].counts, reference[k].counts);
    for (const key of ['v', 'g'])
      for (let j = 0; j < 2; j++)
        assert(Math.abs(result[k][key][j] - reference[k][key][j]) < 0.0002);
  }
  console.log(result);
  assert(result[0].counts[1] > 0);
  assert.equal(result[1].counts[1], 0);
  assert(result[1].v[1] < -52);
  assert.equal(result[3].counts[1], 0);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await fs.writeFile(
    'evidence/gpu-fixtures.json',
    JSON.stringify({ passed: true, tests: result, errors }, null, 2),
  );
  const full = await p.evaluate(async () => {
    const { net, manifest } = await window.loadNetwork(() => {});
    const g = await window.GPUBrain.create(net);
    const trials = [];
    for (let i = 0; i < 3; i++) {
      const f = await g.advance(5, [60, 40, 2, 3]);
      trials.push({
        timeMs: f.timeMs,
        computeMs: f.computeMs,
        spikes: f.counts.reduce((a, b) => a + b, 0),
      });
    }
    g.dispose();
    return { neurons: net.n, edges: net.targets.length, trials, inputs: manifest.inputCounts };
  });
  console.log(full);
  await fs.writeFile(
    'evidence/gpu-full-smoke.json',
    JSON.stringify(
      { passed: true, backend: 'SwiftShader software WebGPU, not physical GPU benchmark', ...full },
      null,
      2,
    ),
  );
} finally {
  await b.close();
}
