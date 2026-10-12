import { test, expect } from 'vitest';
import { chooseLanguage, translations } from '../src/i18n';
import { validateNetwork } from '../src/data';
import type { Network } from '../src/gpu';
const fixture = (): Network => ({
  n: 2,
  offsets: new Uint32Array([0, 1, 1]),
  targets: new Uint32Array([1]),
  weights: new Int32Array([-10]),
  inputs: new Uint32Array(2),
  positions: new Float32Array(8),
  ids: ['90071992547409931', '90071992547409932'],
  labels: ['a', 'b'],
  classes: ['x', 'y'],
});
test('English is the default even for Finnish browsers', () =>
  expect(chooseLanguage(['fi-FI', 'en-US'], null)).toBe('en'));
test('English or unsupported primary locale defaults to English', () => {
  expect(chooseLanguage(['en-GB', 'fi'], null)).toBe('en');
  expect(chooseLanguage(['de-DE'], null)).toBe('en');
  expect(chooseLanguage([], null)).toBe('en');
});
test('Explicit supported language preference wins; invalid storage is ignored', () => {
  expect(chooseLanguage(['fi-FI'], 'en')).toBe('en');
  expect(chooseLanguage(['en-US'], 'fi')).toBe('fi');
  expect(chooseLanguage(['fi-FI'], 'script')).toBe('en');
});
test('Every UI key has a nonempty Finnish and English translation', () => {
  expect(Object.keys(translations.fi).sort()).toEqual(Object.keys(translations.en).sort());
  for (const dict of Object.values(translations))
    for (const value of Object.values(dict)) expect(value.trim().length).toBeGreaterThan(0);
});
test('Full-network shape and original IDs accepted', () =>
  expect(() => validateNetwork(fixture())).not.toThrow());
test('Malformed CSR, target, position and numeric IDs rejected', () => {
  const a = fixture();
  a.offsets[2] = 0;
  expect(() => validateNetwork(a)).toThrow();
  const b = fixture();
  b.targets[0] = 2;
  expect(() => validateNetwork(b)).toThrow();
  const c = fixture();
  c.positions[0] = NaN;
  expect(() => validateNetwork(c)).toThrow();
  const d = fixture();
  d.ids[0] = '9e15';
  expect(() => validateNetwork(d)).toThrow();
});
