import { Brain } from '../tests/reference-core';
import fs from 'node:fs';
fs.mkdirSync('evidence', { recursive: true });
const results = [364, -364, 20, 0].map((w) => {
  const b = new Brain({
    schemaVersion: 1,
    dataset: 'fixture',
    nodeIds: ['1', '2'],
    labels: ['in', 'out'],
    positions: [
      [0, 0, 0],
      [1, 0, 0],
    ],
    offsets: [0, 1, 1],
    targets: [1],
    weights: [w * 0.275],
    inputs: {},
    outputs: { out: [1] },
  });
  b.v[0] = 20;
  let c = [0, 0];
  b.onSpike = (i) => c[i]++;
  b.advance(20);
  return { w, counts: c, v: Array.from(b.v), g: Array.from(b.g) };
});
fs.writeFileSync('evidence/cpu-fixtures.json', JSON.stringify(results, null, 2));
