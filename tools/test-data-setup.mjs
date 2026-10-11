import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
await fs.mkdir('evidence', {recursive: true});
const output = await fs.mkdtemp(path.join(root, 'evidence/data-setup-'));
let corrupt = false;
const server = createServer(async (request, response) => {
  try {
    const name = path.basename(new URL(request.url, 'http://localhost').pathname);
    if (corrupt) { response.end('corrupt fixture'); return; }
    response.end(await fs.readFile(path.join(root, 'public/data', name)));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const run = (verify = false) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['tools/fetch-data.mjs', ...(verify ? ['--verify-only'] : [])], {
    env: {...process.env, DATA_OUTPUT_DIR: output, DATA_BASE_URL: `http://127.0.0.1:${server.address().port}/`},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let text = '';
  child.stdout.on('data', chunk => { text += chunk; });
  child.stderr.on('data', chunk => { text += chunk; });
  child.on('error', reject);
  child.on('close', code => resolve({code, text}));
});
try {
  assert.notEqual((await run(true)).code, 0, 'Missing files must fail verification');
  corrupt = true;
  const bad = await run();
  assert.notEqual(bad.code, 0);
  assert.match(bad.text, /Integrity check failed/);
  assert.deepEqual(await fs.readdir(output), [], 'Corrupt download must not be written');
  corrupt = false;
  const good = await run();
  assert.equal(good.code, 0, good.text);
  assert.equal((await run(true)).code, 0);
  await fs.writeFile(path.join(output, 'offsets.bin'), 'existing corrupt local file');
  assert.notEqual((await run(true)).code, 0);
  assert.equal((await run()).code, 0, 'A verified download should repair a corrupt local file');
  await fs.writeFile('evidence/data-setup.json', JSON.stringify({passed: true, cases: ['missing', 'corrupt download rejected', 'clean download', 'verify', 'local corruption detected', 'repair']}, null, 2));
  console.log('PASS six data-setup checks against a local HTTP mirror');
} finally {
  await new Promise(resolve => server.close(resolve));
  await fs.rm(output, {recursive: true, force: true});
}
