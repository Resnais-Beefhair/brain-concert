export type Environment = 'tide' | 'storm' | 'still';
export interface AppState {
  environment: Environment;
  palette: 'glass' | 'organ' | 'raw';
  speed: number;
  colour: 'aurora' | 'prism' | 'ember';
  quality: 'balanced' | 'high' | 'low';
  mode: 'anatomy' | 'threads' | 'bloom';
  gentle: boolean;
  drift: boolean;
  selected: number;
  silent: Set<number>;
  impulses: number[];
  pulsesUntil: number[];
}

// Only resettable preferences/model controls live here, never GPU/audio resources.
// Language, sound consent, volume and play/pause are intentionally preserved on reset.
export function createDefaultState(reducedMotion = false): AppState {
  return {
    environment: 'tide',
    palette: 'glass',
    speed: 0.25,
    colour: 'ember',
    quality: 'balanced',
    mode: 'bloom',
    gentle: reducedMotion,
    drift: true,
    selected: -1,
    silent: new Set(),
    impulses: [0, 0, 0, 0],
    pulsesUntil: [0, 0, 0, 0],
  };
}
