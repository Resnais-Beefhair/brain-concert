import { afterEach, expect, test, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { loadNetwork } from '../src/data';
import { inputs } from '../src/inputs';
import { createDefaultState } from '../src/state';
import { EventLog } from '../src/event-log';
import { parseUrlState, serializeUrlState } from '../src/url-state';
import { errorKey, errorKeys } from '../src/errors';
import { translations } from '../src/i18n';

afterEach(() => vi.unstubAllGlobals());

test('reset creates independent complete preferences and respects reduced motion', () => {
  const state = createDefaultState();
  state.environment = 'storm';
  state.palette = 'organ';
  state.speed = 0.8;
  state.colour = 'prism';
  state.quality = 'low';
  state.mode = 'anatomy';
  state.gentle = true;
  state.drift = false;
  state.selected = 7;
  state.silent.add(7);
  state.impulses[0] = 130;
  state.pulsesUntil[0] = 200;
  Object.assign(state, createDefaultState());
  expect(state).toEqual({
    environment: 'tide',
    palette: 'glass',
    speed: 0.25,
    colour: 'ember',
    quality: 'balanced',
    mode: 'bloom',
    gentle: false,
    drift: true,
    selected: -1,
    silent: new Set(),
    impulses: [0, 0, 0, 0],
    pulsesUntil: [0, 0, 0, 0],
  });
  const next = createDefaultState(true);
  expect(next.gentle).toBe(true);
  state.silent.add(3);
  state.impulses[0] = 1;
  expect(next.silent.size).toBe(0);
  expect(next.impulses[0]).toBe(0);
});
test('sensory rates preserve tide/storm dynamics and still means no background drive', () => {
  expect(inputs(0, 'tide', [0, 0, 0, 0], [0, 0, 0, 0])[0]).toBe(26.25);
  expect(inputs(0, 'storm', [0, 0, 0, 0], [0, 0, 0, 0])).toEqual([35, 10, 1, 4]);
  expect(inputs(42100, 'still', [0, 0, 0, 0], [0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
  for (const env of ['tide', 'storm'] as const)
    for (const step of [0, 500, 10000, 1e9])
      for (const rate of inputs(step, env, [0, 0, 0, 0], [0, 0, 0, 0]))
        expect(rate >= 0 && rate <= 300 && Number.isFinite(rate)).toBe(true);
});
test('impulses end exactly at their model-time boundary and never mutate input arrays', () => {
  const impulses = [130, 120, 10, 12],
    until = [200, 200, 200, 200];
  expect(inputs(999, 'still', impulses, until)).toEqual(impulses);
  expect(inputs(1000, 'still', impulses, until)).toEqual([0, 0, 0, 0]);
  expect(until).toEqual([200, 200, 200, 200]);
});
test('ring log retains chronological last events and accurately counts truncation', () => {
  const log = new EventLog<number>(3);
  for (let i = 0; i < 10; i++) log.push(i);
  expect(log.toArray()).toEqual([7, 8, 9]);
  expect(log.dropped).toBe(7);
  log.toArray().pop();
  expect(log.toArray()).toEqual([7, 8, 9]);
  log.clear();
  log.push(42);
  expect(log.toArray()).toEqual([42]);
  expect(log.dropped).toBe(0);
  expect(() => new EventLog(0)).toThrow(RangeError);
});
test('settings links round trip losslessly including string FlyWire IDs', () => {
  const state = createDefaultState();
  state.environment = 'storm';
  state.palette = 'organ';
  state.speed = 0.6;
  const neuron = '90071992547409931';
  expect(parseUrlState(serializeUrlState(state, neuron))).toEqual({
    environment: 'storm',
    palette: 'organ',
    speed: 0.6,
    colour: 'ember',
    mode: 'bloom',
    neuron,
  });
});
test.each([
  '#env=<script>&palette=nope&speed=Infinity&neuron=1e20',
  '#speed=0',
  '#speed=2',
  '#speed=&colour=invalid',
  '#%E0%A4%A',
])('invalid link is ignored without throwing: %s', (hash) => {
  expect(parseUrlState(hash)).toEqual({});
});
test('all known error codes have user-facing translations and unknown errors remain private', () => {
  for (const [code, key] of Object.entries(errorKeys)) {
    expect(errorKey(Error(code + ' file.bin'))).toBe(key);
    for (const lang of ['fi', 'en'] as const)
      expect(translations[lang][key].length).toBeGreaterThan(10);
  }
  expect(errorKey(Error('<private implementation detail>'))).toBe('unexpectedError');
});

function mockDataset(mode = 'ok') {
  const files: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries({
    'offsets.bin': new Uint32Array([0, 1, 1]),
    'targets.bin': new Uint32Array([1]),
    'weights.bin': new Int32Array([-10]),
    'inputs.bin': new Uint32Array([1, 0]),
    'positions.bin': new Float32Array(8),
  }))
    files[name] = new Uint8Array(data.buffer);
  files['metadata.json'] = new TextEncoder().encode(
    JSON.stringify({ ids: ['90071992547409931', '2'], labels: ['a', 'b'], classes: ['x', 'y'] }),
  );
  const manifest = {
    schemaVersion: 2,
    neurons: 2,
    edgeRows: 1,
    totalBytes: Object.values(files).reduce((n, b) => n + b.length, 0),
    files: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        { bytes: bytes.length, sha256: bytesToHex(sha256(bytes)) },
      ]),
    ),
  };
  if (mode === 'schema') manifest.schemaVersion = 999;
  if (mode === 'hash') manifest.files['offsets.bin'].sha256 = '0'.repeat(64);
  if (mode === 'oversize') files['offsets.bin'] = new Uint8Array(20);
  if (mode === 'short') files['offsets.bin'] = new Uint8Array(4);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json'))
        return Response.json(manifest, { status: mode === 'manifest-http' ? 503 : 200 });
      const name = url.split('/').at(-1)!;
      return new Response(files[name] as Uint8Array<ArrayBuffer>, {
        status: mode === 'http' ? 404 : 200,
      });
    }),
  );
}
test('network loader validates streamed data and keeps large IDs as strings', async () => {
  mockDataset();
  const progress = vi.fn();
  const { net } = await loadNetwork(progress);
  expect(net.n).toBe(2);
  expect(net.ids[0]).toBe('90071992547409931');
  expect(progress).toHaveBeenLastCalledWith(1, expect.objectContaining({ phase: 'verify' }));
});
test.each([
  ['hash', 'DATA_HASH'],
  ['oversize', 'DATA_HASH'],
  ['short', 'DATA_HASH'],
  ['http', 'DATA_FETCH'],
  ['manifest-http', 'DATA_MANIFEST'],
  ['schema', 'DATA_SCHEMA'],
])('loader rejects %s', async (mode, code) => {
  mockDataset(mode);
  await expect(loadNetwork(() => {})).rejects.toThrow(code);
});

test('network outage has a localized manifest error code', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(loadNetwork(() => {})).rejects.toThrow('DATA_MANIFEST');
});
