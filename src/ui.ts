import markup from './ui.html?raw';
import { loadingMarkup } from './loading';
import { t, type Key } from './i18n';
import type { AppState } from './state';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export function text(id: string, key: Key) {
  $(id).dataset.t = key;
  $(id).textContent = t(key);
}
export function mountUI() {
  // Trusted, bundled markup only. Translate using textContent, never HTML interpolation.
  $('app').innerHTML = markup;
  $('loader').innerHTML = loadingMarkup();
}
export function syncControls(state: AppState) {
  for (const id of ['environment', 'palette', 'colour', 'quality'] as const)
    $<HTMLSelectElement>(id).value = state[id];
  $<HTMLInputElement>('speed').value = String(state.speed * 100);
  $('speed-value').textContent = state.speed.toFixed(2) + '×';
  for (const id of ['gentle', 'drift'] as const) $<HTMLInputElement>(id).checked = state[id];
  for (const id of ['cut', 'mute'] as const) {
    $(id).setAttribute('aria-pressed', 'false');
    text(id, id);
  }
  document
    .querySelectorAll<HTMLElement>('[data-mode]')
    .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.mode === state.mode)));
}
