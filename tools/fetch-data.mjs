import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/manifest.json'), 'utf8'));
const base = new URL(process.env.DATA_BASE_URL || 'https://koodio.fi/demot/aivokonsertti/data/');
const output = path.resolve(process.env.DATA_OUTPUT_DIR || path.join(root, 'public/data'));
const verifyOnly = process.argv.includes('--verify-only');
const valid = (bytes, spec) =>
  bytes.length === spec.bytes && createHash('sha256').update(bytes).digest('hex') === spec.sha256;

await fs.mkdir(output, { recursive: true });
for (const [name, spec] of Object.entries(manifest.files)) {
  const destination = path.join(output, name);
  const existing = await fs.readFile(destination).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing && valid(existing, spec)) {
    console.log(`Verified ${name}`);
    continue;
  }
  if (verifyOnly) throw new Error(`Missing or invalid data: ${name}. Run npm run data:fetch.`);
  const response = await fetch(new URL(name, base), { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Download failed: ${name} (HTTP ${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes, spec)) throw new Error(`Integrity check failed: ${name}; nothing overwritten.`);
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx' });
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
