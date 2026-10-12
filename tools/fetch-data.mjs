import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/manifest.json'), 'utf8'));
const base = new URL(process.env.DATA_BASE_URL || 'https://koodio.fi/demot/aivokonsertti/data/');
const output = path.resolve(process.env.DATA_OUTPUT_DIR || path.join(root, 'public/data'));
const verifyOnly = process.argv.includes('--verify-only');
async function validFile(file, spec) {
  try {
    if ((await fs.stat(file)).size !== spec.bytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex') === spec.sha256;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

await fs.mkdir(output, { recursive: true });
for (const [name, spec] of Object.entries(manifest.files)) {
  const destination = path.join(output, name);
  if (await validFile(destination, spec)) {
    console.log(`Verified ${name}`);
    continue;
  }
  if (verifyOnly) throw new Error(`Missing or invalid data: ${name}. Run npm run data:fetch.`);
  const response = await fetch(new URL(name, base), { signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Download failed: ${name} (HTTP ${response.status})`);
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const hash = createHash('sha256');
  let received = 0;
  const integrityError = () => new Error(`Integrity check failed: ${name}; nothing overwritten.`);
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          if (received > spec.bytes) {
            callback(integrityError());
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(temporary, { flags: 'wx' }),
    );
    if (received !== spec.bytes || hash.digest('hex') !== spec.sha256) throw integrityError();
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  console.log(`Downloaded and verified ${name}`);
}
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Ready: ${manifest.neurons.toLocaleString('en')} neurons; ${manifest.totalBytes} bytes.`,
);
