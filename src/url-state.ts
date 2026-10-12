import type { AppState } from './state';

type SharedState = Partial<
  Pick<AppState, 'environment' | 'palette' | 'speed' | 'colour' | 'mode'>
> & { neuron?: string };
const options = {
  environment: ['tide', 'storm', 'still'],
  palette: ['glass', 'organ', 'raw'],
  colour: ['aurora', 'prism', 'ember'],
  mode: ['anatomy', 'threads', 'bloom'],
} as const;

export function parseUrlState(hash: string): SharedState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: SharedState = {};
  for (const key of Object.keys(options) as (keyof typeof options)[]) {
    const value = params.get(key === 'environment' ? 'env' : key);
    if (value && (options[key] as readonly string[]).includes(value))
      Object.assign(state, { [key]: value });
  }
  const raw = params.get('speed');
  const speed = Number(raw);
  if (raw && Number.isFinite(speed) && speed >= 0.05 && speed <= 1)
    state.speed = Math.round(speed * 100) / 100;
  const neuron = params.get('neuron');
  // FlyWire IDs must remain strings, not imprecise JavaScript numbers.
  if (neuron && /^\d{1,20}$/.test(neuron)) state.neuron = neuron;
  return state;
}
export function serializeUrlState(state: AppState, neuron?: string): string {
  const params = new URLSearchParams({
    env: state.environment,
    palette: state.palette,
    speed: String(state.speed),
    colour: state.colour,
    mode: state.mode,
  });
  if (neuron && /^\d{1,20}$/.test(neuron)) params.set('neuron', neuron);
  return '#' + params.toString();
}
