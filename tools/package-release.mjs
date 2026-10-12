import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${version}`)
  throw Error(`Tag ${process.env.RELEASE_TAG} does not match package version ${version}`);
const output = path.resolve('evidence/release');
await fs.mkdir(output, { recursive: true });
const staging = await fs.mkdtemp(path.join(output, 'stage-'));
const name = `brain-concert-${version}`;
const root = path.join(staging, name);
try {
  await fs.cp('dist', root, {
    recursive: true,
    filter: (source) => !source.startsWith(path.join('dist', 'data')),
  });
  await fs.mkdir(path.join(root, 'data'), { recursive: true });
  await fs.mkdir(path.join(root, 'tools'), { recursive: true });
  await fs.copyFile('data/manifest.json', path.join(root, 'data/manifest.json'));
  await fs.copyFile('tools/fetch-data.mjs', path.join(root, 'tools/fetch-data.mjs'));
  await fs.copyFile('LICENSE', path.join(root, 'LICENSE'));
  await fs.writeFile(path.join(root, 'VERSION'), version + '\n');
  await fs.writeFile(
    path.join(root, 'setup-data.mjs'),
    `import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const child = spawnSync(process.execPath,[fileURLToPath(new URL('./tools/fetch-data.mjs',import.meta.url))],{stdio:'inherit',env:{...process.env,DATA_OUTPUT_DIR:fileURLToPath(new URL('./data/',import.meta.url))}});
if(child.error)throw child.error;process.exit(child.status??1);
`,
  );
  await fs.writeFile(
    path.join(root, 'READ-ME.txt'),
    `Brain Concert ${version}\n\nThis is a built site without the 132 MB scientific dataset.\nWith Node.js 22.20+ (22.x) or 24.12+ run: node setup-data.mjs\nThis downloads the pinned CC BY 4.0 data and verifies SHA-256 before use.\nThen serve this directory over trusted HTTPS or localhost, not file://.\nAudio is off until explicitly enabled. No server computation is needed.\nSource, license and model limitations: https://github.com/Resnais-Beefhair/brain-concert\n`,
  );
  const archive = path.join(output, `${name}-site.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', staging, name]);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  await fs.writeFile(
    path.join(output, 'SHA256SUMS'),
    `${hash.digest('hex')}  ${path.basename(archive)}\n`,
  );
  console.log(`Packaged ${archive} (dataset excluded)`);
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}
