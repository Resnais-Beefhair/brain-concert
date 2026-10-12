import type { Network, GPUFrame } from './gpu';
import { $, text } from './ui';
import { t } from './i18n';

export function renderCell(
  net: Network,
  index: number,
  frame: GPUFrame | null,
  silent: boolean,
  focus: () => void,
  toggleSilence: () => void,
) {
  $('inspector').hidden = false;
  $('settings-panel').hidden = true;
  $('detail').innerHTML = `
    <div class="cell-name" id="cell-name"></div><div class="cell-id" id="cell-id"></div>
    <div class="metrics"><span id="connections-label"></span><strong id="cell-connections"></strong>
      <span id="spikes-label"></span><strong id="cell-spikes"></strong></div>
    <p id="cell-unlocated" class="fine"></p>
    <div class="actions"><button id="focus-cell" class="action"></button>
      <button id="silence-cell" class="action"></button></div>`;
  $('cell-name').textContent = net.labels[index] || net.classes[index] || '—';
  $('cell-id').textContent = net.ids[index];
  $('cell-connections').textContent = String(net.offsets[index + 1] - net.offsets[index]);
  $('cell-spikes').textContent = String(frame?.counts[index] ?? 0);
  text('connections-label', 'connections');
  text('spikes-label', 'spikes');
  text('cell-unlocated', 'unlocated');
  $('cell-unlocated').hidden = Boolean(net.positions[index * 4 + 3]);
  text('focus-cell', 'focus');
  text('silence-cell', silent ? 'restore' : 'silence');
  $('silence-cell').setAttribute('aria-pressed', String(silent));
  $('focus-cell').onclick = focus;
  $('silence-cell').onclick = toggleSilence;
}
export function searchCells(net: Network, inspect: (index: number) => void) {
  const q = $<HTMLInputElement>('search').value.trim().toLowerCase();
  $('results').replaceChildren();
  if (!net || q.length < 2) return;
  let found = 0;
  for (let i = 0; i < net.n && found < 18; i++) {
    if (!(net.ids[i] + ' ' + net.labels[i]).toLowerCase().includes(q)) continue;
    found++;
    const button = document.createElement('button');
    button.textContent = (net.labels[i] || '—') + ' · …' + net.ids[i].slice(-7);
    button.onclick = () => inspect(i);
    $('results').append(button);
  }
  if (!found) $('results').textContent = t('noResults');
}
